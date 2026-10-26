-- Trial lessons and package requests from the public reservation screen.
-- A free trial books the clicked seat and updates occupancy.
-- Package choices are requests to the studio. They do not grant paid credits.

insert into public.packages (name, credit_count)
values ('Ücretsiz Deneme Dersi', 1)
on conflict (name) do nothing;

create table public.package_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  slot_id uuid references public.session_slots (id) on delete set null,
  kind text not null check (kind in ('pack_8', 'pack_12', 'private_single')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'closed')),
  created_at timestamptz not null default now()
);

create unique index package_requests_one_pending
  on public.package_requests (member_id, kind)
  where status = 'pending';

create or replace function public.member_lesson_flags(p_member_id uuid)
returns table (
  has_taken_lessons boolean,
  trial_used boolean,
  has_paid_package boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.reservations r
      join public.session_slots s on s.id = r.slot_id
      where r.member_id = p_member_id
        and (
          r.status in ('attended', 'no_show', 'late_cancelled')
          or (r.status = 'booked' and s.starts_at <= now())
        )
    ),
    exists (
      select 1
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and p.name = 'Ücretsiz Deneme Dersi'
    ),
    exists (
      select 1
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and p.name <> 'Ücretsiz Deneme Dersi'
    );
$$;

create or replace function public.member_booking_state(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name text;
  v_credits integer;
  v_packages jsonb;
  v_reservations jsonb;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
begin
  v_member_id := public.member_id_for_phone(p_phone);

  if v_member_id is null then
    return jsonb_build_object('member', null, 'reservations', '[]'::jsonb);
  end if;

  select full_name
  into v_name
  from public.members
  where id = v_member_id;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_credits
  from public.member_packages
  where member_id = v_member_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', p.name,
        'credits_remaining', mp.credits_remaining,
        'credits_total', mp.credits_total,
        'starts_on', mp.starts_on
      )
      order by mp.starts_on, mp.created_at
    ),
    '[]'::jsonb
  )
  into v_packages
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = v_member_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'session_type', s.session_type,
        'status', r.status
      )
      order by s.starts_at
    ),
    '[]'::jsonb
  )
  into v_reservations
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = v_member_id
    and r.status = 'booked'
    and s.starts_at > now();

  select f.has_taken_lessons, f.trial_used, f.has_paid_package
  into v_has_taken, v_trial_used, v_has_paid
  from public.member_lesson_flags(v_member_id) as f;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'full_name', v_name,
      'credits_remaining', v_credits,
      'has_taken_lessons', v_has_taken,
      'trial_used', v_trial_used,
      'has_paid_package', v_has_paid,
      'packages', v_packages
    ),
    'reservations', v_reservations
  );
end;
$$;

create or replace function public.register_trial_lesson(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
  v_slot public.session_slots;
  v_booked integer;
  v_package_id uuid;
  v_member_package_id uuid;
  v_slot_date date;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
  v_reservation_id uuid;
begin
  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  if v_slot.status <> 'open'
    or v_slot.starts_at <= now()
    or not public.slot_is_legal(v_slot.starts_at)
  then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  if v_booked >= v_slot.capacity then
    raise exception 'Slot dolu';
  end if;

  v_member_id := public.member_id_for_phone(v_phone);

  if v_member_id is not null then
    select f.has_taken_lessons, f.trial_used, f.has_paid_package
    into v_has_taken, v_trial_used, v_has_paid
    from public.member_lesson_flags(v_member_id) as f;

    if v_has_taken
      or v_trial_used
      or v_has_paid
      or exists (
        select 1
        from public.reservations
        where member_id = v_member_id
          and status = 'booked'
      )
    then
      raise exception 'Bu telefonla kayıtlı üyelik var';
    end if;
  else
    insert into public.members (full_name, phone)
    values (v_first || ' ' || v_last, v_phone)
    returning id into v_member_id;
  end if;

  insert into public.packages (name, credit_count)
  values ('Ücretsiz Deneme Dersi', 1)
  on conflict (name) do nothing;

  select id
  into v_package_id
  from public.packages
  where name = 'Ücretsiz Deneme Dersi';

  v_slot_date := (timezone('Europe/Istanbul', v_slot.starts_at))::date;

  insert into public.member_packages (
    member_id,
    package_id,
    credits_total,
    credits_remaining,
    starts_on
  )
  values (
    v_member_id,
    v_package_id,
    1,
    1,
    v_slot_date
  )
  returning id into v_member_package_id;

  insert into public.credit_ledger (member_package_id, delta, reason)
  values (v_member_package_id, 1, 'assign');

  perform public.assert_package_balance(v_member_package_id);
  v_reservation_id := public.book_session(v_member_id, p_slot_id);
  return v_reservation_id;
end;
$$;

create or replace function public.request_member_package(
  p_phone text,
  p_kind text,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
  v_request_id uuid;
begin
  if p_kind not in ('pack_8', 'pack_12', 'private_single') then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  v_member_id := public.member_id_for_phone(p_phone);
  if v_member_id is null then
    raise exception 'Paket talebi için kayıtlı üyelik gerekli';
  end if;

  select f.has_taken_lessons, f.trial_used, f.has_paid_package
  into v_has_taken, v_trial_used, v_has_paid
  from public.member_lesson_flags(v_member_id) as f;

  if not (v_has_taken or v_trial_used or v_has_paid) then
    raise exception 'Paket talebi için kayıtlı üyelik gerekli';
  end if;

  if p_slot_id is not null and not exists (
    select 1
    from public.session_slots
    where id = p_slot_id
  ) then
    raise exception 'Slot bulunamadı';
  end if;

  insert into public.package_requests (member_id, slot_id, kind)
  values (v_member_id, p_slot_id, p_kind)
  on conflict (member_id, kind) where status = 'pending'
  do update
    set slot_id = excluded.slot_id,
        created_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;

alter table public.package_requests enable row level security;

revoke all on table public.package_requests from public, anon, authenticated;
revoke all on function public.member_lesson_flags(uuid) from public, anon, authenticated;
revoke all on function public.register_trial_lesson(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.request_member_package(text, text, uuid) from public, anon, authenticated;

grant execute on function public.register_trial_lesson(text, text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.request_member_package(text, text, uuid) to anon, authenticated, service_role;

-- Signup collects name, phone, and KVKK on the account page.
-- Existing rows stay as they are. New writes require the three fields when every current row already has them.
-- Booking and trial registration stay on the same credit rules; they only refuse an unfinished profile.

alter table public.members
  add column if not exists kvkk_accepted_at timestamptz;

create unique index if not exists members_phone_unique
  on public.members (phone)
  where phone is not null;

do $$
begin
  if not exists (
    select 1
    from public.members
    where first_name is null
      or last_name is null
      or phone is null
      or btrim(first_name) = ''
      or btrim(last_name) = ''
      or btrim(phone) = ''
  ) then
    alter table public.members alter column first_name set not null;
    alter table public.members alter column last_name set not null;
    alter table public.members alter column phone set not null;
  end if;
end $$;

create or replace function public.valid_person_name(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v text := btrim(coalesce(p_value, ''));
  v_letters text;
begin
  if v = '' or char_length(v) > 40 then
    return false;
  end if;

  if v ~ '[0-9<>]' then
    return false;
  end if;

  if v !~ $pat$^[A-Za-zÇĞİÖŞÜçğıöşüİı[:space:]'’´`-]+$$pat$ then
    return false;
  end if;

  v_letters := regexp_replace(v, '[^A-Za-zÇĞİÖŞÜçğıöşüİı]', '', 'g');
  return char_length(v_letters) >= 2;
end;
$fn$;

create or replace function public.member_profile_complete(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_uid
      and char_length(btrim(coalesce(m.first_name, ''))) >= 2
      and char_length(btrim(coalesce(m.last_name, ''))) >= 2
      and m.first_name !~ '[0-9<>]'
      and m.last_name !~ '[0-9<>]'
      and public.normalize_phone(m.phone) is not null
      and m.kvkk_accepted_at is not null
  );
$$;

create or replace function public.complete_member_profile(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_kvkk boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_self uuid;
  v_other uuid;
  v_owner uuid;
  v_claim jsonb;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  if p_kvkk is not true then
    raise exception 'KVKK onayı gerekli';
  end if;

  if not public.valid_person_name(v_first) or not public.valid_person_name(v_last) then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext('member-profile'), hashtext(v_uid::text));
  perform pg_advisory_xact_lock(hashtext(v_phone));

  select id
  into v_self
  from public.members
  where user_id = v_uid
  for update;

  v_other := public.member_id_for_phone(v_phone);

  if v_other is not null and v_other is distinct from v_self then
    select user_id
    into v_owner
    from public.members
    where id = v_other
    for update;

    if v_owner is not null and v_owner is distinct from v_uid then
      insert into public.member_link_requests (member_id, user_id, phone, email)
      values (
        v_other,
        v_uid,
        v_phone,
        nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
      )
      on conflict (user_id, phone) where status = 'pending'
      do nothing;

      return jsonb_build_object('status', 'pending_link');
    end if;

    v_claim := public.claim_member_phone(v_phone);
    if coalesce(v_claim ->> 'status', '') in ('pending', 'not_found') then
      return jsonb_build_object('status', 'pending_link');
    end if;

    v_self := v_other;
  end if;

  if v_self is null then
    insert into public.members (
      full_name,
      first_name,
      last_name,
      phone,
      user_id,
      email,
      kvkk_accepted_at
    )
    values (
      v_first || ' ' || v_last,
      v_first,
      v_last,
      v_phone,
      v_uid,
      public.session_email(),
      now()
    )
    returning id into v_self;

    return jsonb_build_object('status', 'created');
  end if;

  update public.members
  set
    first_name = case
      when nullif(btrim(coalesce(first_name, '')), '') is null then v_first
      else first_name
    end,
    last_name = case
      when nullif(btrim(coalesce(last_name, '')), '') is null then v_last
      else last_name
    end,
    phone = case
      when nullif(btrim(coalesce(phone, '')), '') is null then v_phone
      else phone
    end,
    email = coalesce(email, public.session_email()),
    kvkk_accepted_at = coalesce(kvkk_accepted_at, now())
  where id = v_self
    and user_id = v_uid;

  update public.members
  set full_name = btrim(first_name) || ' ' || btrim(last_name)
  where id = v_self
    and nullif(btrim(coalesce(full_name, '')), '') is null;

  return jsonb_build_object('status', 'updated');
end;
$$;

create or replace function public.member_booking_state()
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
  v_complete boolean := public.member_profile_complete(auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id, full_name
  into v_member_id, v_name
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    return jsonb_build_object(
      'profile_complete', false,
      'member', null,
      'reservations', '[]'::jsonb
    );
  end if;

  select coalesce(sum(credits_remaining), 0)::integer
  into v_credits
  from public.member_packages
  where member_id = v_member_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mp.id,
        'name', p.name,
        'credits_remaining', mp.credits_remaining,
        'credits_total', mp.credits_total,
        'starts_on', mp.starts_on,
        'session_type', p.session_type
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
    'profile_complete', v_complete,
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

create or replace function public.book_session(p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if not public.member_profile_complete(auth.uid()) then
    raise exception 'Önce bilgilerini tamamla';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  return public.book_session(v_member_id, p_slot_id);
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
  v_uid uuid := auth.uid();
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
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  -- p_first_name, p_last_name, and p_phone stay in the signature.
  -- The session profile is the only identity this function uses.
  if not public.member_profile_complete(v_uid) then
    raise exception 'Önce bilgilerini tamamla';
  end if;

  select id, phone
  into v_member_id, v_phone
  from public.members
  where user_id = v_uid
  for update;

  if v_member_id is null then
    raise exception 'Önce bilgilerini tamamla';
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

  if v_slot.session_type is distinct from 'group'::public.session_type then
    raise exception 'Deneme antrenmanı yalnız grup dersine yazılır';
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

create or replace function public.member_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  return public.member_dashboard_payload(v_member_id, 50)
    || jsonb_build_object('profile_complete', public.member_profile_complete(auth.uid()));
end;
$$;

revoke all on function public.valid_person_name(text) from public, anon, authenticated;
revoke all on function public.member_profile_complete(uuid) from public, anon, authenticated;
revoke all on function public.complete_member_profile(text, text, text, boolean) from public, anon;
grant execute on function public.complete_member_profile(text, text, text, boolean) to authenticated, service_role;

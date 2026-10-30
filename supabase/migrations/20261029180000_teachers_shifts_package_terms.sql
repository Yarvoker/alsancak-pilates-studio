-- Teachers, shifts, 30-day package window, and empty legal copy.
-- Existing instructors keep the same ids. A reservation stores both
-- teacher_id and instructor_id so the performance pool still attributes the hour.
-- iyzico is not wired. activate_package is the single activation entry;
-- admin calls it with source 'manual'.

create table public.teachers (
  id uuid primary key,
  full_name text not null unique,
  gives_group boolean not null default true,
  gives_private boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.teachers (id, full_name, gives_group, gives_private, active)
values
  ('a1b2c3d4-e501-4c1a-8d21-8f1c2a106b01', 'Devran Çiçek', true, true, true),
  ('a1b2c3d4-e502-4c1a-8d21-8f1c2a106b02', 'Ecrin Aydınlı', true, true, true),
  ('a1b2c3d4-e503-4c1a-8d21-8f1c2a106b03', 'Cemal Ayhan', true, true, true),
  ('a1b2c3d4-e504-4c1a-8d21-8f1c2a106b04', 'Önder Güzel', true, true, true),
  ('a1b2c3d4-e505-4c1a-8d21-8f1c2a106b05', 'Emel Gamze Güzel', true, true, true)
on conflict (id) do update
set
  full_name = excluded.full_name,
  gives_group = excluded.gives_group,
  gives_private = excluded.gives_private,
  active = excluded.active;

create table public.teacher_shifts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index teacher_shifts_teacher_date_idx
  on public.teacher_shifts (teacher_id, date);

alter table public.reservations
  add column if not exists teacher_id uuid references public.teachers (id);

create index if not exists reservations_teacher_id_idx
  on public.reservations (teacher_id)
  where teacher_id is not null;

alter table public.member_packages
  add column if not exists activated_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists remaining_credits integer,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists extended_by text,
  add column if not exists extended_at timestamptz,
  add column if not exists activation_source text;

update public.member_packages
set
  activated_at = coalesce(activated_at, created_at),
  expires_at = coalesce(
    expires_at,
    case
      when expires_on is not null then (expires_on::timestamp + time '21:00') at time zone 'Europe/Istanbul'
      else created_at + interval '30 days'
    end
  ),
  remaining_credits = coalesce(remaining_credits, credits_remaining)
where activated_at is null
   or remaining_credits is null
   or expires_at is null;

alter table public.member_packages
  alter column remaining_credits set default 0;

update public.member_packages
set remaining_credits = credits_remaining
where remaining_credits is null;

alter table public.member_packages
  alter column remaining_credits set not null;

create table public.site_content (
  key text primary key,
  title text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_content (key, title, body)
values
  ('package_terms', 'Paket Koşulları', ''),
  ('iptal_iade', 'İptal ve İade', ''),
  ('mesafeli_satis', 'Mesafeli Satış Sözleşmesi', ''),
  ('cerez', 'Çerez Politikası', '')
on conflict (key) do nothing;

alter table public.teachers enable row level security;
alter table public.teacher_shifts enable row level security;
alter table public.site_content enable row level security;

revoke all on table public.teachers from public, anon, authenticated;
revoke all on table public.teacher_shifts from public, anon, authenticated;
revoke all on table public.site_content from public, anon, authenticated;

grant select on table public.site_content to anon, authenticated;

create policy site_content_read
  on public.site_content
  for select
  to anon, authenticated
  using (true);

create or replace function public.sync_member_package_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    new.remaining_credits := new.credits_remaining;
  elsif new.credits_remaining is distinct from old.credits_remaining then
    new.remaining_credits := new.credits_remaining;
  elsif new.remaining_credits is distinct from old.remaining_credits then
    new.credits_remaining := new.remaining_credits;
  end if;

  if new.remaining_credits is null then
    new.remaining_credits := new.credits_remaining;
  end if;

  select name
  into v_name
  from public.packages
  where id = new.package_id;

  if v_name = 'Ücretsiz Deneme Dersi' and new.activated_at is null then
    new.activated_at := now();
    new.expires_at := coalesce(new.expires_at, new.activated_at + interval '30 days');
    new.activation_source := coalesce(new.activation_source, 'trial');
  end if;

  if new.expires_at is not null then
    new.expires_on := (timezone('Europe/Istanbul', new.expires_at))::date;
  end if;

  return new;
end;
$$;

drop trigger if exists member_packages_sync_fields on public.member_packages;

create trigger member_packages_sync_fields
  before insert or update on public.member_packages
  for each row
  execute function public.sync_member_package_fields();

create or replace function public.teacher_covers_slot(
  p_teacher_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_shifts sh
    where sh.teacher_id = p_teacher_id
      and sh.date = (timezone('Europe/Istanbul', p_starts_at))::date
      and sh.start_time <= (timezone('Europe/Istanbul', p_starts_at))::time
      and sh.end_time >= (timezone('Europe/Istanbul', p_ends_at))::time
  );
$$;

create or replace function public.teacher_has_other_lesson(
  p_teacher_id uuid,
  p_slot_id uuid,
  p_starts_at timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where coalesce(r.teacher_id, r.instructor_id) = p_teacher_id
      and r.status in ('booked', 'attended', 'no_show')
      and s.starts_at = p_starts_at
      and s.id <> p_slot_id
  );
$$;

create or replace function public.assert_teacher_can_take(
  p_teacher_id uuid,
  p_slot_id uuid
)
returns public.session_slots
language plpgsql
set search_path = public
as $$
declare
  v_slot public.session_slots;
  v_teacher public.teachers;
begin
  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  select *
  into v_teacher
  from public.teachers
  where id = p_teacher_id
    and active
  for update;

  if not found then
    raise exception 'Antrenör bulunamadı';
  end if;

  if v_slot.session_type = 'group' and not v_teacher.gives_group then
    raise exception 'Öğretmen bu dersi vermiyor';
  end if;

  if v_slot.session_type = 'private' and not v_teacher.gives_private then
    raise exception 'Öğretmen bu dersi vermiyor';
  end if;

  if not public.teacher_covers_slot(p_teacher_id, v_slot.starts_at, v_slot.ends_at) then
    raise exception 'Öğretmen mesaisi yok';
  end if;

  if public.teacher_has_other_lesson(p_teacher_id, p_slot_id, v_slot.starts_at) then
    raise exception 'Eğitmen uygun değil';
  end if;

  return v_slot;
end;
$$;

create or replace function public.list_bookable_slots(p_from date, p_to date)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  session_type public.session_type,
  capacity integer,
  booked_count integer,
  status public.slot_status
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 40 then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  return query
  select
    s.id,
    s.starts_at,
    s.ends_at,
    s.session_type,
    s.capacity,
    (
      select count(*)::integer
      from public.reservations r
      where r.slot_id = s.id
        and r.status = 'booked'
    ) as booked_count,
    s.status
  from public.session_slots s
  where (timezone('Europe/Istanbul', s.starts_at))::date between p_from and p_to
    and s.starts_at > now()
    and s.status in ('open', 'full')
    and public.slot_is_legal(s.starts_at)
  order by s.starts_at, s.session_type;
end;
$$;

create or replace function public.list_available_teachers(p_slot_id uuid)
returns table (
  id uuid,
  full_name text,
  gives_group boolean,
  gives_private boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.full_name, t.gives_group, t.gives_private
  from public.teachers t
  join public.session_slots s on s.id = p_slot_id
  where t.active
    and (
      (s.session_type = 'group' and t.gives_group)
      or (s.session_type = 'private' and t.gives_private)
    )
    and public.teacher_covers_slot(t.id, s.starts_at, s.ends_at)
    and not public.teacher_has_other_lesson(t.id, s.id, s.starts_at)
  order by t.full_name;
$$;

create or replace function public.book_session(p_member_id uuid, p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.session_slots;
  v_package public.member_packages;
  v_booked integer;
  v_slot_date date;
  v_reservation_id uuid;
begin
  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Üye bulunamadı';
  end if;

  perform 1
  from public.members
  where id = p_member_id
  for update;

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_member_id::text), hashtext(v_slot.starts_at::text));

  if not public.slot_is_legal(v_slot.starts_at) then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  if v_slot.status <> 'open' then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  if v_slot.session_type = 'private' then
    if v_slot.capacity is distinct from 2 then
      raise exception 'Slot rezervasyona kapalı';
    end if;
  elsif v_slot.session_type = 'group' then
    if v_slot.capacity is distinct from 14 then
      raise exception 'Slot rezervasyona kapalı';
    end if;
  else
    raise exception 'Slot rezervasyona kapalı';
  end if;

  if v_slot.starts_at <= now() then
    raise exception 'Ders başlamış';
  end if;

  if exists (
    select 1
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.member_id = p_member_id
      and r.status = 'booked'
      and s.starts_at = v_slot.starts_at
      and r.slot_id <> p_slot_id
  ) then
    raise exception 'Bu saatte başka rezervasyonun var';
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  if v_booked >= v_slot.capacity then
    raise exception 'Slot dolu';
  end if;

  v_slot_date := (timezone('Europe/Istanbul', v_slot.starts_at))::date;

  select mp.*
  into v_package
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = p_member_id
    and mp.activated_at is not null
    and mp.starts_on <= v_slot_date
    and mp.credits_remaining > 0
    and (mp.expires_at is null or (timezone('Europe/Istanbul', mp.expires_at))::date >= v_slot_date)
    and (
      p.session_type is null
      or p.session_type = v_slot.session_type
    )
  order by
    case when p.session_type = v_slot.session_type then 0 else 1 end,
    mp.expires_at nulls last,
    mp.starts_on,
    mp.created_at
  limit 1
  for update of mp;

  if not found then
    if exists (
      select 1
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and mp.activated_at is not null
        and mp.credits_remaining > 0
        and mp.expires_at is not null
        and (timezone('Europe/Istanbul', mp.expires_at))::date < v_slot_date
        and (
          p.session_type is null
          or p.session_type = v_slot.session_type
        )
    ) then
      raise exception 'Paketin bu tarihte geçerli değil';
    end if;

    if exists (
      select 1
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and mp.activated_at is not null
        and mp.starts_on > v_slot_date
        and mp.credits_remaining > 0
        and (mp.expires_at is null or (timezone('Europe/Istanbul', mp.expires_at))::date >= v_slot_date)
        and (
          p.session_type is null
          or p.session_type = v_slot.session_type
        )
    ) then
      raise exception 'Üyelik başlangıcından önce rezervasyon yapılamaz';
    end if;

    if exists (
      select 1
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and mp.activated_at is not null
        and mp.starts_on <= v_slot_date
        and mp.credits_remaining > 0
        and (mp.expires_at is null or (timezone('Europe/Istanbul', mp.expires_at))::date >= v_slot_date)
    ) then
      raise exception 'Bu ders türü için kullanılabilir kredi yok';
    end if;

    raise exception 'Ders almak için paket seçmelisin';
  end if;

  insert into public.reservations (slot_id, member_id, member_package_id, status)
  values (p_slot_id, p_member_id, v_package.id, 'booked')
  returning id into v_reservation_id;

  update public.member_packages
  set credits_remaining = credits_remaining - 1
  where id = v_package.id;

  insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
  values (v_package.id, v_reservation_id, -1, 'book');

  perform public.assert_package_balance(v_package.id);
  perform public.refresh_slot_occupancy(p_slot_id);
  return v_reservation_id;
end;
$$;

create or replace function public.book_session_with_instructor(
  p_slot_id uuid,
  p_instructor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.session_slots;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if not public.member_profile_complete(auth.uid()) then
    raise exception 'Önce bilgilerini tamamla';
  end if;

  v_slot := public.assert_teacher_can_take(p_instructor_id, p_slot_id);
  perform pg_advisory_xact_lock(hashtext(p_instructor_id::text), hashtext(v_slot.starts_at::text));

  if public.teacher_has_other_lesson(p_instructor_id, p_slot_id, v_slot.starts_at) then
    raise exception 'Eğitmen uygun değil';
  end if;

  v_reservation_id := public.book_session(p_slot_id);

  update public.reservations
  set
    instructor_id = p_instructor_id,
    teacher_id = p_instructor_id
  where id = v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.register_trial_with_instructor(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_slot_id uuid,
  p_instructor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.session_slots;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  v_slot := public.assert_teacher_can_take(p_instructor_id, p_slot_id);

  if v_slot.session_type is distinct from 'group'::public.session_type then
    raise exception 'Deneme antrenmanı yalnız grup dersine yazılır';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_instructor_id::text), hashtext(v_slot.starts_at::text));

  if public.teacher_has_other_lesson(p_instructor_id, p_slot_id, v_slot.starts_at) then
    raise exception 'Eğitmen uygun değil';
  end if;

  v_reservation_id := public.register_trial_lesson(
    p_first_name,
    p_last_name,
    p_phone,
    p_slot_id
  );

  update public.reservations
  set
    instructor_id = p_instructor_id,
    teacher_id = p_instructor_id
  where id = v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.activate_package(
  p_purchase_id uuid,
  p_paid_at timestamptz,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid timestamptz := coalesce(p_paid_at, now());
begin
  if p_source is null or p_source not in ('manual', 'iyzico') then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  if p_purchase_id is null then
    raise exception 'Paket bulunamadı';
  end if;

  update public.member_packages
  set
    activated_at = v_paid,
    expires_at = v_paid + interval '30 days',
    activation_source = p_source
  where id = p_purchase_id
    and activated_at is null;

  if not found then
    if exists (select 1 from public.member_packages where id = p_purchase_id and activated_at is not null) then
      raise exception 'Paket zaten aktif';
    end if;
    raise exception 'Paket bulunamadı';
  end if;

  return p_purchase_id;
end;
$$;

create or replace function public.request_package_purchase(
  p_kind text,
  p_accept_terms boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name text;
  v_package_id uuid;
  v_credits integer;
  v_existing uuid;
  v_id uuid;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if not public.member_profile_complete(auth.uid()) then
    raise exception 'Önce bilgilerini tamamla';
  end if;

  if p_accept_terms is distinct from true then
    raise exception 'Paket koşullarını kabul etmelisin';
  end if;

  v_name := case p_kind
    when 'pack_8' then '8''li Pilates Paketi'
    when 'pack_12' then '12''li Pilates Paketi'
    when 'private_single' then 'Özel Ders Paketi (Private)'
    when 'private_pack' then 'Özel Ders Paketi (Private)'
    else null
  end;

  if v_name is null then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  select id
  into v_package_id
  from public.packages
  where name = v_name;

  if v_package_id is null then
    raise exception 'Paket bulunamadı';
  end if;

  select mp.id
  into v_existing
  from public.member_packages mp
  where mp.member_id = v_member_id
    and mp.package_id = v_package_id
    and mp.activated_at is null
    and mp.credits_remaining > 0
  order by mp.created_at desc
  limit 1;

  if v_existing is not null then
    update public.member_packages
    set terms_accepted_at = now()
    where id = v_existing;
    return v_existing;
  end if;

  v_credits := case when p_kind in ('private_single', 'private_pack') then 1 else null end;

  v_id := public.assign_member_package(v_member_id, v_package_id, v_today, v_credits);

  update public.member_packages
  set
    terms_accepted_at = now(),
    activated_at = null,
    expires_at = null,
    activation_source = null
  where id = v_id;

  return v_id;
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
  where member_id = v_member_id
    and activated_at is not null
    and (expires_at is null or expires_at >= now());

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mp.id,
        'name', p.name,
        'credits_remaining', mp.credits_remaining,
        'credits_total', mp.credits_total,
        'starts_on', mp.starts_on,
        'expires_on', coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on),
        'expires_at', mp.expires_at,
        'activated_at', mp.activated_at,
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
        'status', r.status,
        'teacher_id', r.teacher_id
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

create or replace function public.member_dashboard_payload(
  p_member_id uuid,
  p_history_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Europe/Istanbul', now()))::date;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_since timestamptz;
  v_package_id uuid;
  v_name text;
  v_session public.session_type;
  v_total integer := 0;
  v_remaining integer := 0;
  v_starts date;
  v_expires date;
  v_status text := 'none';
  v_type text;
  v_days integer;
  v_upcoming jsonb;
  v_history jsonb;
  v_total_attended integer := 0;
  v_month_attended integer := 0;
  v_weeks date[] := '{}';
  v_cursor date;
  v_streak integer := 0;
  v_pending jsonb := null;
begin
  if p_member_id is not null then
    select first_name, last_name, email, phone, created_at
    into v_first, v_last, v_email, v_phone, v_since
    from public.members
    where id = p_member_id;
  end if;

  v_email := coalesce(
    nullif(btrim(coalesce(v_email, '')), ''),
    nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
  );

  if p_member_id is null or not exists (select 1 from public.members where id = p_member_id) then
    return jsonb_build_object(
      'profile', jsonb_build_object(
        'first_name', null,
        'last_name', null,
        'email', v_email,
        'phone_masked', null,
        'member_since', null
      ),
      'package', jsonb_build_object(
        'id', null,
        'name', null,
        'type', null,
        'credits_total', 0,
        'credits_used', 0,
        'credits_remaining', 0,
        'starts_on', null,
        'expires_on', null,
        'days_left', null,
        'status', 'none'
      ),
      'pending_package', null,
      'upcoming', '[]'::jsonb,
      'history', '[]'::jsonb,
      'stats', jsonb_build_object(
        'total_attended', 0,
        'this_month_attended', 0,
        'streak_weeks', 0
      )
    );
  end if;

  select jsonb_build_object(
    'id', mp.id,
    'name', p.name,
    'credits_remaining', mp.credits_remaining,
    'credits_total', mp.credits_total,
    'starts_on', mp.starts_on
  )
  into v_pending
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = p_member_id
    and mp.activated_at is null
    and mp.credits_remaining > 0
  order by mp.created_at desc
  limit 1;

  select
    mp.id,
    p.name,
    p.session_type,
    mp.credits_total,
    mp.credits_remaining,
    mp.starts_on,
    coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on)
  into v_package_id, v_name, v_session, v_total, v_remaining, v_starts, v_expires
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = p_member_id
    and mp.activated_at is not null
    and mp.credits_remaining > 0
    and (mp.expires_at is null or (timezone('Europe/Istanbul', mp.expires_at))::date >= v_today)
    and (mp.expires_on is null or mp.expires_on >= v_today or mp.expires_at is not null)
    and mp.starts_on <= v_today
  order by mp.starts_on desc, mp.created_at desc
  limit 1;

  if found then
    v_status := 'active';
  else
    select
      mp.id,
      p.name,
      p.session_type,
      mp.credits_total,
      mp.credits_remaining,
      mp.starts_on,
      coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on)
    into v_package_id, v_name, v_session, v_total, v_remaining, v_starts, v_expires
    from public.member_packages mp
    join public.packages p on p.id = mp.package_id
    where mp.member_id = p_member_id
      and mp.activated_at is not null
      and mp.credits_remaining > 0
      and (mp.expires_at is null or (timezone('Europe/Istanbul', mp.expires_at))::date >= v_today)
      and mp.starts_on > v_today
    order by mp.starts_on asc, mp.created_at asc
    limit 1;

    if found then
      v_status := 'active';
    elsif v_pending is not null then
      v_status := 'pending';
      v_package_id := null;
      v_name := v_pending->>'name';
      v_session := null;
      v_total := coalesce((v_pending->>'credits_total')::integer, 0);
      v_remaining := coalesce((v_pending->>'credits_remaining')::integer, 0);
      v_starts := nullif(v_pending->>'starts_on', '')::date;
      v_expires := null;
    elsif exists (
      select 1 from public.member_packages
      where member_id = p_member_id
        and activated_at is not null
    ) then
      v_status := 'expired';
      select
        mp.id,
        p.name,
        p.session_type,
        mp.credits_total,
        mp.credits_remaining,
        mp.starts_on,
        coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on)
      into v_package_id, v_name, v_session, v_total, v_remaining, v_starts, v_expires
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
        and mp.activated_at is not null
      order by mp.starts_on desc, mp.created_at desc
      limit 1;
    else
      v_status := 'none';
      v_package_id := null;
      v_name := null;
      v_session := null;
      v_total := 0;
      v_remaining := 0;
      v_starts := null;
      v_expires := null;
    end if;
  end if;

  if v_status = 'none' or v_status = 'pending' then
    v_type := case when v_status = 'pending' then 'pending' else null end;
    v_days := null;
  else
    if v_name = 'Ücretsiz Deneme Dersi' or v_session is null then
      v_type := 'trial';
    else
      v_type := v_session::text;
    end if;
    v_days := case when v_expires is null then null else (v_expires - v_today) end;
    v_total := coalesce(v_total, 0);
    v_remaining := coalesce(v_remaining, 0);
  end if;

  select coalesce(jsonb_agg(item order by item->>'starts_at'), '[]'::jsonb)
  into v_upcoming
  from (
    select jsonb_build_object(
      'reservation_id', r.id,
      'starts_at', s.starts_at,
      'ends_at', s.ends_at,
      'session_type', s.session_type,
      'cancel_deadline', s.starts_at - interval '24 hours',
      'can_cancel', now() < (s.starts_at - interval '24 hours'),
      'status', r.status
    ) as item
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.member_id = p_member_id
      and r.status = 'booked'
      and s.starts_at > now()
    order by s.starts_at asc
  ) listed;

  v_history := public.member_history_rows(p_member_id, null, p_history_limit);

  select
    count(*) filter (
      where r.status = 'attended'
        or (r.status = 'booked' and s.starts_at <= now())
    )::integer,
    count(*) filter (
      where (
        r.status = 'attended'
        or (r.status = 'booked' and s.starts_at <= now())
      )
      and date_trunc('month', timezone('Europe/Istanbul', s.starts_at))
        = date_trunc('month', timezone('Europe/Istanbul', now()))
    )::integer
  into v_total_attended, v_month_attended
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = p_member_id;

  select coalesce(array_agg(distinct date_trunc('week', timezone('Europe/Istanbul', s.starts_at))::date), '{}')
  into v_weeks
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = p_member_id
    and (
      r.status = 'attended'
      or (r.status = 'booked' and s.starts_at <= now())
    );

  v_cursor := date_trunc('week', timezone('Europe/Istanbul', now()))::date;
  if not (v_cursor = any (v_weeks)) then
    v_cursor := v_cursor - 7;
    if not (v_cursor = any (v_weeks)) then
      v_cursor := null;
    end if;
  end if;

  while v_cursor is not null and v_streak < 520 and (v_cursor = any (v_weeks)) loop
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 7;
  end loop;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'first_name', v_first,
      'last_name', v_last,
      'email', v_email,
      'phone_masked', public.mask_member_phone(v_phone),
      'member_since', v_since
    ),
    'package', jsonb_build_object(
      'id', v_package_id,
      'name', v_name,
      'type', v_type,
      'credits_total', coalesce(v_total, 0),
      'credits_used', greatest(coalesce(v_total, 0) - coalesce(v_remaining, 0), 0),
      'credits_remaining', coalesce(v_remaining, 0),
      'starts_on', v_starts,
      'expires_on', v_expires,
      'days_left', v_days,
      'status', v_status
    ),
    'pending_package', v_pending,
    'upcoming', coalesce(v_upcoming, '[]'::jsonb),
    'history', coalesce(v_history, '[]'::jsonb),
    'stats', jsonb_build_object(
      'total_attended', coalesce(v_total_attended, 0),
      'this_month_attended', coalesce(v_month_attended, 0),
      'streak_weeks', coalesce(v_streak, 0)
    )
  );
end;
$$;

create or replace function public.admin_lesson_history(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  select coalesce(jsonb_agg(item order by item->>'starts_at' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', r.id,
      'member_id', m.id,
      'full_name', m.full_name,
      'phone', m.phone,
      'starts_at', s.starts_at,
      'session_type', s.session_type,
      'status', r.status,
      'teacher_id', coalesce(r.teacher_id, r.instructor_id),
      'teacher_name', t.full_name,
      'attendance', case r.status
        when 'attended' then 'Geldi'
        when 'no_show' then 'Gelmedi'
        when 'cancelled' then 'İptal'
        when 'late_cancelled' then 'İptal'
        else 'Bekliyor'
      end,
      'credit_state', case
        when r.status = 'cancelled' then 'İade'
        when r.status = 'booked' and now() < s.starts_at - interval '24 hours' then 'Tutuluyor'
        else 'Düşüldü'
      end,
      'can_attend', r.status = 'booked' and s.starts_at <= now(),
      'can_no_show', r.status = 'booked' and now() >= s.starts_at - interval '24 hours',
      'can_cancel', r.status = 'booked'
    ) as item
    from public.reservations r
    join public.members m on m.id = r.member_id
    join public.session_slots s on s.id = r.slot_id
    left join public.teachers t on t.id = coalesce(r.teacher_id, r.instructor_id)
    order by s.starts_at desc
    limit 400
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.admin_list_teachers(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  select coalesce(jsonb_agg(item order by item->>'full_name'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', t.id,
      'full_name', t.full_name,
      'gives_group', t.gives_group,
      'gives_private', t.gives_private,
      'active', t.active
    ) as item
    from public.teachers t
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.admin_set_teacher_flags(
  p_username text,
  p_password text,
  p_teacher_id uuid,
  p_gives_group boolean,
  p_gives_private boolean,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  update public.teachers
  set
    gives_group = coalesce(p_gives_group, gives_group),
    gives_private = coalesce(p_gives_private, gives_private),
    active = coalesce(p_active, active)
  where id = p_teacher_id;

  if not found then
    raise exception 'Antrenör bulunamadı';
  end if;

  update public.instructors
  set active = coalesce(p_active, active)
  where id = p_teacher_id;

  return jsonb_build_object('id', p_teacher_id);
end;
$$;

create or replace function public.shift_list_covers(
  p_shifts jsonb,
  p_start time,
  p_end time
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) elem
    where (elem->>'start')::time <= p_start
      and (elem->>'end')::time >= p_end
  );
$$;

create or replace function public.admin_save_teacher_shifts(
  p_username text,
  p_password text,
  p_teacher_id uuid,
  p_date date,
  p_shifts jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_start time;
  v_end time;
  v_prev_end time := null;
  v_blocked jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_teacher_id is null or p_date is null or jsonb_typeof(coalesce(p_shifts, '[]'::jsonb)) <> 'array' then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  if not exists (select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'Antrenör bulunamadı';
  end if;

  for v_elem in
    select value
    from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb))
    order by value->>'start'
  loop
    v_start := (v_elem->>'start')::time;
    v_end := (v_elem->>'end')::time;
    if v_start is null or v_end is null or v_end <= v_start then
      raise exception 'Geçersiz tarih aralığı';
    end if;
    if v_prev_end is not null and v_start < v_prev_end then
      raise exception 'Geçersiz tarih aralığı';
    end if;
    v_prev_end := v_end;
  end loop;

  select coalesce(jsonb_agg(item order by item->>'starts_at'), '[]'::jsonb)
  into v_blocked
  from (
    select jsonb_build_object(
      'id', r.id,
      'full_name', m.full_name,
      'starts_at', s.starts_at,
      'session_type', s.session_type,
      'status', r.status
    ) as item
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    join public.members m on m.id = r.member_id
    where coalesce(r.teacher_id, r.instructor_id) = p_teacher_id
      and r.status in ('booked', 'attended', 'no_show')
      and (timezone('Europe/Istanbul', s.starts_at))::date = p_date
      and not public.shift_list_covers(
        coalesce(p_shifts, '[]'::jsonb),
        (timezone('Europe/Istanbul', s.starts_at))::time,
        (timezone('Europe/Istanbul', s.ends_at))::time
      )
  ) listed;

  if jsonb_array_length(v_blocked) > 0 and p_force is distinct from true then
    return jsonb_build_object('saved', false, 'reservations', v_blocked);
  end if;

  delete from public.teacher_shifts
  where teacher_id = p_teacher_id
    and date = p_date;

  insert into public.teacher_shifts (teacher_id, date, start_time, end_time)
  select
    p_teacher_id,
    p_date,
    (elem->>'start')::time,
    (elem->>'end')::time
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) elem;

  return jsonb_build_object('saved', true, 'reservations', v_blocked);
end;
$$;

create or replace function public.admin_list_shifts(
  p_username text,
  p_password text,
  p_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_from date;
  v_to date;
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_month is null then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  v_month := date_trunc('month', p_month)::date;
  v_from := v_month;
  v_to := (v_month + interval '1 month' - interval '1 day')::date;

  select coalesce(jsonb_agg(item order by item->>'date', item->>'start_time'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', sh.id,
      'teacher_id', sh.teacher_id,
      'date', sh.date,
      'start_time', to_char(sh.start_time, 'HH24:MI'),
      'end_time', to_char(sh.end_time, 'HH24:MI')
    ) as item
    from public.teacher_shifts sh
    where sh.date between v_from and v_to
  ) listed;

  return jsonb_build_object('from', v_from, 'to', v_to, 'shifts', v_rows);
end;
$$;

create or replace function public.admin_copy_shift_pattern(
  p_username text,
  p_password text,
  p_month date,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_from date;
  v_to date;
  v_teacher record;
  v_day date;
  v_source date;
  v_shifts jsonb;
  v_saved jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_written integer := 0;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_mode not in ('week', 'previous') or p_month is null then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  v_month := date_trunc('month', p_month)::date;
  v_from := v_month;
  v_to := (v_month + interval '1 month' - interval '1 day')::date;

  for v_teacher in select id from public.teachers order by full_name loop
    v_day := v_from;
    while v_day <= v_to loop
      v_shifts := null;

      if p_mode = 'previous' then
        v_source := (v_day - interval '1 month')::date;
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', to_char(sh.start_time, 'HH24:MI'),
          'end', to_char(sh.end_time, 'HH24:MI')
        ) order by sh.start_time), '[]'::jsonb)
        into v_shifts
        from public.teacher_shifts sh
        where sh.teacher_id = v_teacher.id
          and sh.date = v_source;
      else
        select coalesce(jsonb_agg(jsonb_build_object(
          'start', to_char(sh.start_time, 'HH24:MI'),
          'end', to_char(sh.end_time, 'HH24:MI')
        ) order by sh.start_time), '[]'::jsonb)
        into v_shifts
        from public.teacher_shifts sh
        where sh.teacher_id = v_teacher.id
          and sh.date = (
            select min(src.date)
            from public.teacher_shifts src
            where src.teacher_id = v_teacher.id
              and src.date between v_from and v_to
              and extract(isodow from src.date) = extract(isodow from v_day)
          );
      end if;

      if v_shifts is not null and jsonb_array_length(v_shifts) > 0 then
        v_saved := public.admin_save_teacher_shifts(
          p_username,
          p_password,
          v_teacher.id,
          v_day,
          v_shifts,
          false
        );
        if coalesce((v_saved->>'saved')::boolean, false) then
          v_written := v_written + 1;
        else
          v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
            'teacher_id', v_teacher.id,
            'date', v_day,
            'reservations', v_saved->'reservations'
          ));
        end if;
      end if;

      v_day := v_day + 1;
    end loop;
  end loop;

  return jsonb_build_object('written', v_written, 'skipped', v_skipped);
end;
$$;

create or replace function public.admin_activate_package(
  p_username text,
  p_password text,
  p_purchase_id uuid,
  p_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  return public.activate_package(p_purchase_id, coalesce(p_paid_at, now()), 'manual');
end;
$$;

create or replace function public.admin_extend_package(
  p_username text,
  p_password text,
  p_purchase_id uuid,
  p_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := coalesce(p_days, 30);
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if v_days < 1 or v_days > 365 then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  update public.member_packages
  set
    expires_at = coalesce(expires_at, activated_at, now()) + make_interval(days => v_days),
    extended_by = p_username,
    extended_at = now()
  where id = p_purchase_id
    and activated_at is not null;

  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  return p_purchase_id;
end;
$$;

create or replace function public.admin_list_site_content(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  select coalesce(jsonb_agg(item order by item->>'key'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'key', c.key,
      'title', c.title,
      'body', c.body,
      'updated_at', c.updated_at
    ) as item
    from public.site_content c
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.admin_save_site_content(
  p_username text,
  p_password text,
  p_key text,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_key is null or p_key !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  insert into public.site_content (key, title, body, updated_at)
  values (p_key, coalesce(p_title, ''), coalesce(p_body, ''), now())
  on conflict (key) do update
  set
    title = excluded.title,
    body = excluded.body,
    updated_at = now();

  return jsonb_build_object('key', p_key);
end;
$$;

revoke all on function public.sync_member_package_fields() from public, anon, authenticated;
revoke all on function public.teacher_covers_slot(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.teacher_has_other_lesson(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.assert_teacher_can_take(uuid, uuid) from public, anon, authenticated;
revoke all on function public.shift_list_covers(jsonb, time, time) from public, anon, authenticated;
revoke all on function public.activate_package(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.book_session(uuid, uuid) from public, anon, authenticated;

grant execute on function public.list_bookable_slots(date, date) to anon, authenticated, service_role;
grant execute on function public.list_available_teachers(uuid) to anon, authenticated, service_role;
grant execute on function public.book_session(uuid) to authenticated, service_role;
grant execute on function public.book_session(uuid, uuid) to service_role;
grant execute on function public.book_session_with_instructor(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.register_trial_with_instructor(text, text, text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.request_package_purchase(text, boolean) to authenticated, service_role;
grant execute on function public.activate_package(uuid, timestamptz, text) to service_role;

revoke all on function public.admin_list_teachers(text, text) from public;
revoke all on function public.admin_set_teacher_flags(text, text, uuid, boolean, boolean, boolean) from public;
revoke all on function public.admin_save_teacher_shifts(text, text, uuid, date, jsonb, boolean) from public;
revoke all on function public.admin_list_shifts(text, text, date) from public;
revoke all on function public.admin_copy_shift_pattern(text, text, date, text) from public;
revoke all on function public.admin_activate_package(text, text, uuid, timestamptz) from public;
revoke all on function public.admin_extend_package(text, text, uuid, integer) from public;
revoke all on function public.admin_list_site_content(text, text) from public;
revoke all on function public.admin_save_site_content(text, text, text, text, text) from public;

grant execute on function public.admin_list_teachers(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_set_teacher_flags(text, text, uuid, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_save_teacher_shifts(text, text, uuid, date, jsonb, boolean) to anon, authenticated, service_role;
grant execute on function public.admin_list_shifts(text, text, date) to anon, authenticated, service_role;
grant execute on function public.admin_copy_shift_pattern(text, text, date, text) to anon, authenticated, service_role;
grant execute on function public.admin_activate_package(text, text, uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.admin_extend_package(text, text, uuid, integer) to anon, authenticated, service_role;
grant execute on function public.admin_list_site_content(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_save_site_content(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_lesson_history(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

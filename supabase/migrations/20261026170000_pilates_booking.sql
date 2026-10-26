-- Alsancak Pilates reservation rules.
-- Time zone: Europe/Istanbul. Lessons last 50 minutes.
-- Mon–Fri 07:00–21:00, Saturday 09:00–21:00, Sunday closed.

create extension if not exists pg_cron;

create type public.session_type as enum ('private', 'group');
create type public.slot_status as enum ('draft', 'open', 'full', 'closed');
create type public.reservation_status as enum (
  'booked',
  'cancelled',
  'late_cancelled',
  'no_show',
  'attended'
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  credit_count integer not null check (credit_count > 0),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.member_packages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  package_id uuid not null references public.packages (id),
  credits_total integer not null check (credits_total > 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  starts_on date not null,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (credits_remaining <= credits_total),
  unique (id, member_id)
);

create table public.session_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  session_type public.session_type,
  capacity integer,
  status public.slot_status not null default 'draft',
  created_at timestamptz not null default now(),
  check (ends_at = starts_at + interval '50 minutes'),
  check (
    (
      status = 'draft'
      and session_type is null
      and capacity is null
    )
    or (
      status in ('open', 'full', 'closed')
      and (
        (session_type = 'private' and capacity = 2)
        or (session_type = 'group' and capacity = 14)
      )
    )
  )
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.session_slots (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  member_package_id uuid not null,
  status public.reservation_status not null default 'booked',
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  foreign key (member_package_id, member_id)
    references public.member_packages (id, member_id)
    on delete cascade
);

create unique index reservations_one_booked_per_member_slot
  on public.reservations (member_id, slot_id)
  where status = 'booked';

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  member_package_id uuid not null references public.member_packages (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete cascade,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (
    (reason = 'assign' and delta > 0)
    or (reason = 'book' and delta < 0)
    or (reason = 'refund' and delta > 0)
    or (reason = 'burn' and delta = 0)
  )
);

insert into public.packages (name, credit_count)
values
  ('8''li Paket', 8),
  ('12''li Paket', 12);

create or replace function public.slot_is_legal(p_starts_at timestamptz)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  local_ts timestamp;
  day_of_week integer;
  minute_of_day integer;
  open_minute integer;
  close_minute integer := 21 * 60;
begin
  local_ts := timezone('Europe/Istanbul', p_starts_at);
  if local_ts <> date_trunc('minute', local_ts) then
    return false;
  end if;

  day_of_week := extract(dow from local_ts)::integer;
  if day_of_week = 0 then
    return false;
  end if;

  minute_of_day :=
    extract(hour from local_ts)::integer * 60
    + extract(minute from local_ts)::integer;
  open_minute := case when day_of_week = 6 then 9 * 60 else 7 * 60 end;

  if minute_of_day < open_minute or minute_of_day + 50 > close_minute then
    return false;
  end if;

  return (minute_of_day - open_minute) % 50 = 0;
end;
$$;

create or replace function public.assert_package_balance(p_member_package_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  stored integer;
  summed integer;
begin
  select credits_remaining
  into stored
  from public.member_packages
  where id = p_member_package_id;

  select coalesce(sum(delta), 0)::integer
  into summed
  from public.credit_ledger
  where member_package_id = p_member_package_id;

  if stored is null or stored <> summed then
    raise exception 'Kredi defteri uyuşmuyor';
  end if;
end;
$$;

create or replace function public.generate_session_slots(p_from_date date, p_to_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cursor_date date;
  day_of_week integer;
  open_minute integer;
  close_minute integer := 21 * 60;
  start_minute integer;
  slot_start timestamptz;
  inserted_count integer := 0;
  v_inserted integer;
begin
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  if p_to_date - p_from_date > 400 then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  cursor_date := p_from_date;
  while cursor_date <= p_to_date loop
    day_of_week := extract(dow from cursor_date)::integer;

    if day_of_week <> 0 then
      open_minute := case when day_of_week = 6 then 9 * 60 else 7 * 60 end;
      start_minute := open_minute;

      while start_minute + 50 <= close_minute loop
        slot_start :=
          (cursor_date::timestamp + make_interval(mins => start_minute))
          at time zone 'Europe/Istanbul';

        if not public.slot_is_legal(slot_start) then
          raise exception 'Yasal olmayan slot üretildi';
        end if;

        insert into public.session_slots (starts_at, ends_at, status)
        values (slot_start, slot_start + interval '50 minutes', 'draft')
        on conflict (starts_at) do nothing;

        get diagnostics v_inserted = row_count;
        inserted_count := inserted_count + v_inserted;
        start_minute := start_minute + 50;
      end loop;
    end if;

    cursor_date := cursor_date + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.open_session_slot(
  p_slot_id uuid,
  p_session_type public.session_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.session_slots;
  v_capacity integer;
  v_booked integer;
begin
  if p_session_type is null then
    raise exception 'Ders türü gerekli';
  end if;

  v_capacity := case p_session_type when 'private' then 2 when 'group' then 14 end;

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  if not public.slot_is_legal(v_slot.starts_at) then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  if v_booked > v_capacity then
    raise exception 'Mevcut rezervasyonlar yeni kapasiteyi aşıyor';
  end if;

  update public.session_slots
  set
    session_type = p_session_type,
    capacity = v_capacity,
    status = case when v_booked >= v_capacity then 'full'::public.slot_status else 'open'::public.slot_status end
  where id = p_slot_id;

  return p_slot_id;
end;
$$;

create or replace function public.assign_member_package(
  p_member_id uuid,
  p_package_id uuid,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_package_id uuid;
begin
  if p_starts_on is null or p_starts_on < (timezone('Europe/Istanbul', now()))::date then
    raise exception 'Başlangıç tarihi geçmiş olamaz';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Üye bulunamadı';
  end if;

  select id, credit_count
  into v_package_id, v_credits
  from public.packages
  where id = p_package_id;

  if v_package_id is null then
    raise exception 'Paket bulunamadı';
  end if;

  insert into public.member_packages (
    member_id,
    package_id,
    credits_total,
    credits_remaining,
    starts_on,
    assigned_by
  )
  values (
    p_member_id,
    p_package_id,
    v_credits,
    v_credits,
    p_starts_on,
    auth.uid()
  )
  returning id into v_package_id;

  insert into public.credit_ledger (member_package_id, delta, reason)
  values (v_package_id, v_credits, 'assign');

  perform public.assert_package_balance(v_package_id);
  return v_package_id;
end;
$$;

create or replace function public.refresh_slot_occupancy(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booked integer;
  v_capacity integer;
  v_status public.slot_status;
begin
  select capacity, status
  into v_capacity, v_status
  from public.session_slots
  where id = p_slot_id
  for update;

  if v_status not in ('open', 'full') then
    return;
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  update public.session_slots
  set status = case
    when v_booked >= v_capacity then 'full'::public.slot_status
    else 'open'::public.slot_status
  end
  where id = p_slot_id;
end;
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

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  if not public.slot_is_legal(v_slot.starts_at) then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  if v_slot.status <> 'open' then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  if v_slot.starts_at <= now() then
    raise exception 'Ders başlamış';
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

  select *
  into v_package
  from public.member_packages
  where member_id = p_member_id
    and starts_on <= v_slot_date
    and credits_remaining > 0
  order by starts_on, created_at
  limit 1
  for update;

  if not found then
    if exists (
      select 1
      from public.member_packages
      where member_id = p_member_id
        and starts_on <= v_slot_date
    ) then
      raise exception 'Kullanılabilir ders kredisi yok';
    end if;

    if exists (
      select 1
      from public.member_packages
      where member_id = p_member_id
        and starts_on > v_slot_date
    ) then
      raise exception 'Üyelik başlangıcından önce rezervasyon yapılamaz';
    end if;

    raise exception 'Kullanılabilir ders kredisi yok';
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

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_slot public.session_slots;
  v_early boolean;
begin
  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if v_reservation.status <> 'booked' then
    raise exception 'Rezervasyon iptal edilemez';
  end if;

  select *
  into v_slot
  from public.session_slots
  where id = v_reservation.slot_id
  for update;

  perform 1
  from public.member_packages
  where id = v_reservation.member_package_id
  for update;

  v_early := now() < v_slot.starts_at - interval '24 hours';

  if v_early then
    update public.reservations
    set status = 'cancelled', cancelled_at = now()
    where id = p_reservation_id;

    update public.member_packages
    set credits_remaining = credits_remaining + 1
    where id = v_reservation.member_package_id;

    insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
    values (v_reservation.member_package_id, p_reservation_id, 1, 'refund');
  else
    update public.reservations
    set status = 'late_cancelled', cancelled_at = now()
    where id = p_reservation_id;

    insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
    values (v_reservation.member_package_id, p_reservation_id, 0, 'burn');
  end if;

  perform public.assert_package_balance(v_reservation.member_package_id);
  perform public.refresh_slot_occupancy(v_reservation.slot_id);
  return p_reservation_id;
end;
$$;

create or replace function public.finalize_elapsed_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select r.id, r.member_package_id
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.status = 'booked'
      and s.starts_at <= now()
    for update of r
  loop
    update public.reservations
    set status = 'no_show'
    where id = v_row.id;

    insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
    values (v_row.member_package_id, v_row.id, 0, 'burn');

    perform public.assert_package_balance(v_row.member_package_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

select cron.schedule(
  'finalize-elapsed-reservations',
  '*/15 * * * *',
  $$select public.finalize_elapsed_reservations();$$
);

alter table public.packages enable row level security;
alter table public.members enable row level security;
alter table public.member_packages enable row level security;
alter table public.session_slots enable row level security;
alter table public.reservations enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on table public.packages from public, anon, authenticated;
revoke all on table public.members from public, anon, authenticated;
revoke all on table public.member_packages from public, anon, authenticated;
revoke all on table public.session_slots from public, anon, authenticated;
revoke all on table public.reservations from public, anon, authenticated;
revoke all on table public.credit_ledger from public, anon, authenticated;

revoke all on function public.slot_is_legal(timestamptz) from public, anon, authenticated;
revoke all on function public.assert_package_balance(uuid) from public, anon, authenticated;
revoke all on function public.generate_session_slots(date, date) from public, anon, authenticated;
revoke all on function public.open_session_slot(uuid, public.session_type) from public, anon, authenticated;
revoke all on function public.assign_member_package(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.refresh_slot_occupancy(uuid) from public, anon, authenticated;
revoke all on function public.book_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_reservation(uuid) from public, anon, authenticated;
revoke all on function public.finalize_elapsed_reservations() from public, anon, authenticated;

grant execute on function public.generate_session_slots(date, date) to service_role;
grant execute on function public.open_session_slot(uuid, public.session_type) to service_role;
grant execute on function public.assign_member_package(uuid, uuid, date) to service_role;
grant execute on function public.book_session(uuid, uuid) to service_role;
grant execute on function public.cancel_reservation(uuid) to service_role;
grant execute on function public.finalize_elapsed_reservations() to service_role;

-- Instructor calendars for Alsancak Pilates.
-- A reservation occupies its instructor at session_slots.starts_at when status is
-- booked, attended, or no_show. cancelled and late_cancelled leave the hour free.
-- Another instructor's reservation never blocks the selected instructor.
-- Null instructor_id (older rows) occupies nobody.

create table public.instructors (
  id uuid primary key,
  full_name text not null unique,
  photo_path text not null,
  sort_order integer not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.reservations
  add column instructor_id uuid references public.instructors (id);

insert into public.instructors (id, full_name, photo_path, sort_order)
values
  ('a1b2c3d4-e501-4c1a-8d21-8f1c2a106b01', 'Devran Çiçek', '/images/instructors/devran.jpg', 1),
  ('a1b2c3d4-e502-4c1a-8d21-8f1c2a106b02', 'Ecrin Aydınlı', '/images/instructors/ecrin.jpg', 2),
  ('a1b2c3d4-e503-4c1a-8d21-8f1c2a106b03', 'Cemal Ayhan', '/images/instructors/cemal.jpg', 3),
  ('a1b2c3d4-e504-4c1a-8d21-8f1c2a106b04', 'Önder Güzel', '/images/instructors/onder.jpg', 4),
  ('a1b2c3d4-e505-4c1a-8d21-8f1c2a106b05', 'Emel Gamze Güzel', '/images/instructors/emel.jpg', 5)
on conflict (id) do update
set
  full_name = excluded.full_name,
  photo_path = excluded.photo_path,
  sort_order = excluded.sort_order,
  active = true;

create index reservations_instructor_id_idx
  on public.reservations (instructor_id)
  where instructor_id is not null;

alter table public.instructors enable row level security;
revoke all on table public.instructors from public, anon, authenticated;

create or replace function public.list_instructors()
returns table (
  id uuid,
  full_name text,
  photo_path text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.full_name, i.photo_path, i.sort_order
  from public.instructors i
  where i.active
  order by i.sort_order;
$$;

create or replace function public.list_instructor_occupancy(p_from date, p_to date)
returns table (
  instructor_id uuid,
  starts_at timestamptz,
  session_type public.session_type,
  status public.reservation_status
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 21 then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  return query
  select r.instructor_id, s.starts_at, s.session_type, r.status
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.instructor_id is not null
    and r.status in ('booked', 'attended', 'no_show')
    and (timezone('Europe/Istanbul', s.starts_at))::date between p_from and p_to;
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
  v_starts_at timestamptz;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if not exists (
    select 1
    from public.instructors
    where id = p_instructor_id
      and active
  ) then
    raise exception 'Antrenör bulunamadı';
  end if;

  select starts_at
  into v_starts_at
  from public.session_slots
  where id = p_slot_id;

  if v_starts_at is null then
    raise exception 'Slot bulunamadı';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_instructor_id::text), hashtext(v_starts_at::text));

  if exists (
    select 1
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.instructor_id = p_instructor_id
      and r.status in ('booked', 'attended', 'no_show')
      and s.starts_at = v_starts_at
  ) then
    raise exception 'Eğitmen uygun değil';
  end if;

  v_reservation_id := public.book_session(p_slot_id);

  update public.reservations
  set instructor_id = p_instructor_id
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
  v_starts_at timestamptz;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if not exists (
    select 1
    from public.instructors
    where id = p_instructor_id
      and active
  ) then
    raise exception 'Antrenör bulunamadı';
  end if;

  select starts_at
  into v_starts_at
  from public.session_slots
  where id = p_slot_id;

  if v_starts_at is null then
    raise exception 'Slot bulunamadı';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_instructor_id::text), hashtext(v_starts_at::text));

  if exists (
    select 1
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.instructor_id = p_instructor_id
      and r.status in ('booked', 'attended', 'no_show')
      and s.starts_at = v_starts_at
  ) then
    raise exception 'Eğitmen uygun değil';
  end if;

  v_reservation_id := public.register_trial_lesson(
    p_first_name,
    p_last_name,
    p_phone,
    p_slot_id
  );

  update public.reservations
  set instructor_id = p_instructor_id
  where id = v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.admin_instructor_performance(
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
  v_rows jsonb;
  v_unassigned jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_month is null then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  v_month := date_trunc('month', p_month)::date;

  -- Status map (reservation_status), by the lesson's Europe/Istanbul month:
  -- completed = attended
  -- active    = booked
  -- cancelled = cancelled + late_cancelled
  -- no_show stays Gelmedi and is not folded into the three counts above.
  -- Reservations with a null instructor_id are returned as unassigned.

  select coalesce(jsonb_agg(listed.item order by listed.sort_order), '[]'::jsonb)
  into v_rows
  from (
    select
      i.sort_order,
      jsonb_build_object(
        'id', i.id,
        'full_name', i.full_name,
        'photo_path', i.photo_path,
        'sort_order', i.sort_order,
        'completed', coalesce(c.completed, 0),
        'active', coalesce(c.active, 0),
        'cancelled', coalesce(c.cancelled, 0),
        'no_show', coalesce(c.no_show, 0),
        'completed_minutes', coalesce(c.completed, 0) * 50
      ) as item
    from public.instructors i
    left join (
      select
        r.instructor_id,
        count(*) filter (where r.status = 'attended')::integer as completed,
        count(*) filter (where r.status = 'booked')::integer as active,
        count(*) filter (where r.status in ('cancelled', 'late_cancelled'))::integer as cancelled,
        count(*) filter (where r.status = 'no_show')::integer as no_show
      from public.reservations r
      join public.session_slots s on s.id = r.slot_id
      where r.instructor_id is not null
        and date_trunc('month', timezone('Europe/Istanbul', s.starts_at))::date = v_month
      group by r.instructor_id
    ) c on c.instructor_id = i.id
    where i.active
  ) listed;

  select jsonb_build_object(
    'completed', count(*) filter (where r.status = 'attended')::integer,
    'active', count(*) filter (where r.status = 'booked')::integer,
    'cancelled', count(*) filter (where r.status in ('cancelled', 'late_cancelled'))::integer,
    'no_show', count(*) filter (where r.status = 'no_show')::integer
  )
  into v_unassigned
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.instructor_id is null
    and date_trunc('month', timezone('Europe/Istanbul', s.starts_at))::date = v_month;

  return jsonb_build_object(
    'month', v_month,
    'instructors', v_rows,
    'unassigned', v_unassigned
  );
end;
$$;

revoke all on function public.list_instructors() from public;
grant execute on function public.list_instructors() to anon, authenticated, service_role;

revoke all on function public.list_instructor_occupancy(date, date) from public;
grant execute on function public.list_instructor_occupancy(date, date) to anon, authenticated, service_role;

revoke all on function public.book_session_with_instructor(uuid, uuid) from public;
grant execute on function public.book_session_with_instructor(uuid, uuid) to authenticated, service_role;

revoke all on function public.register_trial_with_instructor(text, text, text, uuid, uuid) from public;
grant execute on function public.register_trial_with_instructor(text, text, text, uuid, uuid) to authenticated, service_role;

revoke all on function public.admin_instructor_performance(text, text, date) from public;
grant execute on function public.admin_instructor_performance(text, text, date) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- One clock time can hold a private lesson (2) and a group lesson (14) together.

alter table public.session_slots
  drop constraint session_slots_starts_at_key;

alter table public.session_slots
  add constraint session_slots_start_type_key
  unique nulls not distinct (starts_at, session_type);

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
        on conflict on constraint session_slots_start_type_key do nothing;

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

create or replace function public.ensure_open_slot(
  p_starts_at timestamptz,
  p_session_type public.session_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status public.slot_status;
  v_capacity integer;
begin
  if p_session_type is null then
    raise exception 'Ders türü gerekli';
  end if;

  if p_starts_at is null or p_starts_at <= now() or not public.slot_is_legal(p_starts_at) then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  select id, status
  into v_id, v_status
  from public.session_slots
  where starts_at = p_starts_at
    and session_type = p_session_type
  for update;

  if found then
    if v_status = 'closed' then
      return v_id;
    end if;
    return public.open_session_slot(v_id, p_session_type);
  end if;

  select id
  into v_id
  from public.session_slots
  where starts_at = p_starts_at
    and status = 'draft'
    and session_type is null
  for update;

  if found then
    return public.open_session_slot(v_id, p_session_type);
  end if;

  v_capacity := case p_session_type when 'private' then 2 when 'group' then 14 end;

  insert into public.session_slots (
    starts_at,
    ends_at,
    session_type,
    capacity,
    status
  )
  values (
    p_starts_at,
    p_starts_at + interval '50 minutes',
    p_session_type,
    v_capacity,
    'open'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_open_week(
  p_username text,
  p_password text,
  p_session_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date;
  v_to date;
  v_start timestamptz;
  v_hours integer := 0;
  v_opened integer := 0;
  v_skipped integer := 0;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_session_type not in ('private', 'group', 'both') then
    raise exception 'Ders türü gerekli';
  end if;

  v_from := (timezone('Europe/Istanbul', now()))::date;
  v_to := v_from + 6;

  for v_start in
    select distinct s.starts_at
    from public.session_slots s
    where (timezone('Europe/Istanbul', s.starts_at))::date between v_from and v_to
      and s.starts_at > now()
      and public.slot_is_legal(s.starts_at)
      and s.status in ('draft', 'open', 'full')
    order by s.starts_at
  loop
    v_hours := v_hours + 1;
    begin
      perform public.ensure_open_slot(v_start, 'private');
      perform public.ensure_open_slot(v_start, 'group');
      v_opened := v_opened + 1;
    exception
      when others then
        if sqlerrm = 'Mevcut rezervasyonlar yeni kapasiteyi aşıyor' then
          v_skipped := v_skipped + 1;
        else
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'hours', v_hours,
    'opened', v_opened,
    'skipped', v_skipped,
    'from_date', v_from,
    'to_date', v_to
  );
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 21 then
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

revoke all on function public.ensure_open_slot(timestamptz, public.session_type) from public, anon, authenticated;
grant execute on function public.ensure_open_slot(timestamptz, public.session_type) to service_role;

do $$
declare
  v_start timestamptz;
begin
  for v_start in
    select distinct s.starts_at
    from public.session_slots s
    where s.starts_at > now()
      and s.status in ('open', 'full')
      and public.slot_is_legal(s.starts_at)
    order by s.starts_at
  loop
    perform public.ensure_open_slot(v_start, 'private');
    perform public.ensure_open_slot(v_start, 'group');
  end loop;
end;
$$;

notify pgrst, 'reload schema';

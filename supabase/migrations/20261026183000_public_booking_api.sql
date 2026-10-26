-- Public booking surface for the studio site.
-- Anon can only call these wrappers. Credit, capacity, start date, and
-- cancellation rules stay in the existing security definer functions.

create or replace function public.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if digits ~ '^90[0-9]{10}$' then
    return '+' || digits;
  elsif digits ~ '^0[0-9]{10}$' then
    return '+9' || digits;
  elsif digits ~ '^[1-9][0-9]{9}$' then
    return '+90' || digits;
  end if;

  return null;
end;
$$;

create or replace function public.member_id_for_phone(p_phone text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_count integer;
  v_member_id uuid;
begin
  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  select count(*)::integer
  into v_count
  from public.members
  where public.normalize_phone(phone) = v_phone;

  if v_count = 0 then
    return null;
  end if;

  if v_count > 1 then
    raise exception 'Bu telefon birden fazla üyeye ait';
  end if;

  select id
  into v_member_id
  from public.members
  where public.normalize_phone(phone) = v_phone;

  return v_member_id;
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
  order by s.starts_at;
end;
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

  return jsonb_build_object(
    'member', jsonb_build_object(
      'full_name', v_name,
      'credits_remaining', v_credits,
      'packages', v_packages
    ),
    'reservations', v_reservations
  );
end;
$$;

create or replace function public.book_session_for_phone(p_phone text, p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := public.member_id_for_phone(p_phone);
  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  return public.book_session(v_member_id, p_slot_id);
end;
$$;

create or replace function public.cancel_reservation_for_phone(
  p_phone text,
  p_reservation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_owner uuid;
begin
  v_member_id := public.member_id_for_phone(p_phone);
  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  select member_id
  into v_owner
  from public.reservations
  where id = p_reservation_id;

  if v_owner is null or v_owner <> v_member_id then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  return public.cancel_reservation(p_reservation_id);
end;
$$;

revoke all on function public.normalize_phone(text) from public, anon, authenticated;
revoke all on function public.member_id_for_phone(text) from public, anon, authenticated;
revoke all on function public.list_bookable_slots(date, date) from public, anon, authenticated;
revoke all on function public.member_booking_state(text) from public, anon, authenticated;
revoke all on function public.book_session_for_phone(text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_reservation_for_phone(text, uuid) from public, anon, authenticated;

grant execute on function public.list_bookable_slots(date, date) to anon, authenticated, service_role;
grant execute on function public.member_booking_state(text) to anon, authenticated, service_role;
grant execute on function public.book_session_for_phone(text, uuid) to anon, authenticated, service_role;
grant execute on function public.cancel_reservation_for_phone(text, uuid) to anon, authenticated, service_role;

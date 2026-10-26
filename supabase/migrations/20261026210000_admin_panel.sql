-- Studio admin access. The password is stored as a bcrypt hash.
-- Public booking stays on the anon key; admin calls must pass a valid login.

create table public.admin_credentials (
  username text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

insert into public.admin_credentials (username, password_hash)
values (
  'YARATICI',
  $hash$$2a$06$hoYaeNRDqPAGwJ6BgUe/LuRgdKkvNpiOlVH7Q0HwH4f.AvXgi27Jy$hash$
)
on conflict (username) do update
set password_hash = excluded.password_hash;

create or replace function public.admin_login(p_username text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_check text;
begin
  if p_username is null
    or p_password is null
    or char_length(p_username) > 80
    or char_length(p_password) > 200
  then
    return false;
  end if;

  select password_hash
  into v_hash
  from public.admin_credentials
  where username = p_username;

  if v_hash is null then
    select password_hash
    into v_check
    from public.admin_credentials
    where username = 'YARATICI';

    if v_check is not null then
      perform extensions.crypt(p_password, v_check);
    end if;

    return false;
  end if;

  return v_hash = extensions.crypt(p_password, v_hash);
end;
$$;

create or replace function public.admin_list_clients(p_username text, p_password text)
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
      'id', m.id,
      'full_name', m.full_name,
      'phone', m.phone,
      'active_package', active.name,
      'package_starts_on', active.starts_on,
      'credits_remaining', bal.credits_remaining
    ) as item
    from public.members m
    left join lateral (
      select p.name, mp.starts_on
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
        and mp.credits_remaining > 0
      order by
        case
          when mp.starts_on <= (timezone('Europe/Istanbul', now()))::date then 0
          else 1
        end,
        mp.starts_on,
        mp.created_at
      limit 1
    ) active on true
    left join lateral (
      select coalesce(sum(mp.credits_remaining), 0)::integer as credits_remaining
      from public.member_packages mp
      where mp.member_id = m.id
    ) bal on true
  ) listed;

  return v_rows;
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
    order by s.starts_at desc
    limit 400
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.admin_mark_attendance(
  p_username text,
  p_password text,
  p_reservation_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
  v_slot public.session_slots;
  v_early boolean;
  v_credits integer;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_outcome not in ('attended', 'no_show', 'cancelled') then
    raise exception 'Katılım durumu geçersiz';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Rezervasyon bulunamadı';
  end if;

  if v_reservation.status <> 'booked' then
    raise exception 'Katılım bu kayıttan değiştirilemez';
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

  if p_outcome = 'attended' then
    if v_slot.starts_at > now() then
      raise exception 'Geldi işareti ders başladıktan sonra konur';
    end if;

    update public.reservations
    set status = 'attended'
    where id = p_reservation_id;
  elsif p_outcome = 'no_show' then
    if now() < v_slot.starts_at - interval '24 hours' then
      raise exception 'No-show yalnızca derse 24 saatten az kala işaretlenir';
    end if;

    update public.reservations
    set status = 'no_show',
        cancelled_at = now()
    where id = p_reservation_id;

    if not exists (
      select 1
      from public.credit_ledger
      where reservation_id = p_reservation_id
        and reason = 'burn'
    ) then
      insert into public.credit_ledger (member_package_id, reservation_id, delta, reason)
      values (v_reservation.member_package_id, p_reservation_id, 0, 'burn');
    end if;

    perform public.assert_package_balance(v_reservation.member_package_id);
  else
    v_early := now() < v_slot.starts_at - interval '24 hours';
    perform public.cancel_reservation(p_reservation_id);
  end if;

  perform public.refresh_slot_occupancy(v_reservation.slot_id);

  select coalesce(sum(credits_remaining), 0)::integer
  into v_credits
  from public.member_packages
  where member_id = v_reservation.member_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'outcome', p_outcome,
    'refunded', coalesce(v_early, false),
    'credits_remaining', v_credits
  );
end;
$$;

create or replace function public.admin_assign_package(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_kind text,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_package_id uuid;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  v_name := case p_kind
    when 'pack_8' then '8''li Paket'
    when 'pack_12' then '12''li Paket'
    else null
  end;

  if v_name is null then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Üye bulunamadı';
  end if;

  select id
  into v_package_id
  from public.packages
  where name = v_name;

  if v_package_id is null then
    raise exception 'Paket bulunamadı';
  end if;

  return public.assign_member_package(p_member_id, v_package_id, p_starts_on);
end;
$$;

alter table public.admin_credentials enable row level security;

revoke all on table public.admin_credentials from public, anon, authenticated;
revoke all on function public.admin_login(text, text) from public, anon, authenticated;
revoke all on function public.admin_list_clients(text, text) from public, anon, authenticated;
revoke all on function public.admin_lesson_history(text, text) from public, anon, authenticated;
revoke all on function public.admin_mark_attendance(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_assign_package(text, text, uuid, text, date) from public, anon, authenticated;

grant execute on function public.admin_login(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_list_clients(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_lesson_history(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_mark_attendance(text, text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_assign_package(text, text, uuid, text, date) to anon, authenticated, service_role;

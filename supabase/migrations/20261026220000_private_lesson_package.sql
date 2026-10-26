-- Private lesson packages spend credits only on private slots (capacity 2).
-- Group packs stay on group slots (capacity 14). Trial credits stay unrestricted.

alter table public.packages
  add column if not exists session_type public.session_type;

update public.packages
set
  name = '8''li Pilates Paketi',
  session_type = 'group'
where name in ('8''li Paket', '8''li Pilates Paketi');

update public.packages
set
  name = '12''li Pilates Paketi',
  session_type = 'group'
where name in ('12''li Paket', '12''li Pilates Paketi');

insert into public.packages (name, credit_count, session_type)
values ('Özel Ders Paketi (Private)', 1, 'private')
on conflict (name) do update
set session_type = excluded.session_type;

update public.packages
set session_type = null
where name = 'Ücretsiz Deneme Dersi';

create or replace function public.assign_member_package(
  p_member_id uuid,
  p_package_id uuid,
  p_starts_on date,
  p_credits integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog integer;
  v_session public.session_type;
  v_credits integer;
  v_member_package_id uuid;
begin
  if p_starts_on is null or p_starts_on < (timezone('Europe/Istanbul', now()))::date then
    raise exception 'Başlangıç tarihi geçmiş olamaz';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Üye bulunamadı';
  end if;

  select credit_count, session_type
  into v_catalog, v_session
  from public.packages
  where id = p_package_id;

  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  if p_credits is null then
    v_credits := v_catalog;
  else
    if v_session is distinct from 'private'::public.session_type then
      raise exception 'Paket seçeneği geçersiz';
    end if;

    if p_credits < 1 or p_credits > 60 then
      raise exception 'Özel ders kredisi geçersiz';
    end if;

    v_credits := p_credits;
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
  returning id into v_member_package_id;

  insert into public.credit_ledger (member_package_id, delta, reason)
  values (v_member_package_id, v_credits, 'assign');

  perform public.assert_package_balance(v_member_package_id);
  return v_member_package_id;
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
begin
  return public.assign_member_package(p_member_id, p_package_id, p_starts_on, null::integer);
end;
$$;

drop function if exists public.admin_assign_package(text, text, uuid, text, date);

create function public.admin_assign_package(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_kind text,
  p_starts_on date,
  p_credits integer default null
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
    when 'pack_8' then '8''li Pilates Paketi'
    when 'pack_12' then '12''li Pilates Paketi'
    when 'private_pack' then 'Özel Ders Paketi (Private)'
    else null
  end;

  if v_name is null then
    raise exception 'Paket seçeneği geçersiz';
  end if;

  if p_kind = 'private_pack' then
    if p_credits is null or p_credits < 1 or p_credits > 60 then
      raise exception 'Özel ders kredisi geçersiz';
    end if;
  elsif p_credits is not null then
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

  return public.assign_member_package(
    p_member_id,
    v_package_id,
    p_starts_on,
    case when p_kind = 'private_pack' then p_credits else null::integer end
  );
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
    and mp.starts_on <= v_slot_date
    and mp.credits_remaining > 0
    and (
      p.session_type is null
      or p.session_type = v_slot.session_type
    )
  order by
    case when p.session_type = v_slot.session_type then 0 else 1 end,
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
        and mp.starts_on > v_slot_date
        and mp.credits_remaining > 0
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
      where mp.member_id = p_member_id
        and mp.starts_on <= v_slot_date
        and mp.credits_remaining > 0
    ) then
      raise exception 'Bu ders türü için kullanılabilir kredi yok';
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
      'credits_remaining', bal.credits_remaining,
      'packages', coalesce(open_packs.packages, '[]'::jsonb)
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
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', mp.id,
          'name', p.name,
          'credits_remaining', mp.credits_remaining,
          'credits_total', mp.credits_total,
          'starts_on', mp.starts_on,
          'session_type', p.session_type
        )
        order by mp.starts_on, mp.created_at
      ) as packages
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
        and mp.credits_remaining > 0
    ) open_packs on true
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.assign_member_package(uuid, uuid, date, integer) from public, anon, authenticated;
revoke all on function public.admin_assign_package(text, text, uuid, text, date, integer) from public, anon, authenticated;

grant execute on function public.assign_member_package(uuid, uuid, date, integer) to service_role;
grant execute on function public.admin_assign_package(text, text, uuid, text, date, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

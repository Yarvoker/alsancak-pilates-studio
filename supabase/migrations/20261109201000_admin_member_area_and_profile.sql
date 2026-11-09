-- Admin list placement only. lesson_area does not change which sessions a
-- package can book, and it does not touch credits, packages, cash, or payments.
-- Existing members stay in group until an admin moves one.

alter table public.members
  add column if not exists lesson_area text;

alter table public.members
  alter column lesson_area set default 'group';

update public.members
set lesson_area = 'group'
where lesson_area is null;

alter table public.members
  alter column lesson_area set not null;

alter table public.members
  drop constraint if exists members_lesson_area_check;

alter table public.members
  add constraint members_lesson_area_check
  check (lesson_area in ('group', 'private'));

comment on column public.members.lesson_area is
  'Admin list placement only: group or private. Does not change package booking.';

create or replace function public.admin_list_clients(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
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
      'lesson_area', m.lesson_area,
      'sign_in_method', public.member_sign_in_method(m.user_id),
      'has_login', m.user_id is not null,
      'active_package', active.name,
      'package_starts_on', active.starts_on,
      'credits_remaining', bal.credits_remaining,
      'packages', coalesce(open_packs.packages, '[]'::jsonb),
      'has_cash', exists (
        select 1 from public.cash_receipts r where r.member_id = m.id
      ),
      'has_site_card', m.user_id is not null and (
        exists (
          select 1 from public.payments p
          where p.member_id = m.id and p.status = 'paid'
        )
        or exists (
          select 1 from public.member_packages mp
          where mp.member_id = m.id and mp.activation_source = 'iyzico'
        )
      ),
      'has_external_card', m.user_id is null and (
        exists (
          select 1 from public.payments p
          where p.member_id = m.id and p.status = 'paid'
        )
        or exists (
          select 1 from public.member_packages mp
          where mp.member_id = m.id and mp.activation_source = 'iyzico'
        )
      )
    ) as item
    from public.members m
    left join lateral (
      select p.name, mp.starts_on
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
        and mp.credits_remaining > 0
        and coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on) >= v_today
      order by
        case when mp.starts_on <= v_today then 0 else 1 end,
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
          'expires_on', coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on),
          'session_type', p.session_type
        )
        order by
          case
            when coalesce((timezone('Europe/Istanbul', mp.expires_at))::date, mp.expires_on) >= v_today then 0
            else 1
          end,
          mp.starts_on,
          mp.created_at
      ) as packages
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = m.id
    ) open_packs on true
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_clients(text, text) from public;
grant execute on function public.admin_list_clients(text, text) to anon, authenticated, service_role;

create or replace function public.admin_set_member_lesson_area(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_area text
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

  if p_area is null or p_area not in ('group', 'private') then
    raise exception 'Özel veya grup seç';
  end if;

  update public.members
  set lesson_area = p_area
  where id = p_member_id;

  if not found then
    raise exception 'Danışan bulunamadı';
  end if;

  return jsonb_build_object(
    'member_id', p_member_id,
    'lesson_area', p_area
  );
end;
$$;

revoke all on function public.admin_set_member_lesson_area(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_member_lesson_area(text, text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_update_member_profile(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_full text;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if v_first = '' or v_last = '' then
    raise exception 'Ad gir';
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Danışan bulunamadı';
  end if;

  if nullif(btrim(coalesce(p_phone, '')), '') is null then
    v_phone := null;
  else
    v_phone := public.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'Telefon numarası geçersiz';
    end if;
  end if;

  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtext(v_phone));

    if exists (
      select 1
      from public.members
      where id <> p_member_id
        and phone is not null
        and public.normalize_phone(phone) = v_phone
    ) then
      raise exception 'Bu telefonla kayıtlı üyelik var';
    end if;
  end if;

  v_full := btrim(v_first || ' ' || v_last);

  update public.members
  set first_name = v_first,
      last_name = v_last,
      full_name = v_full,
      phone = v_phone
  where id = p_member_id;

  if not found then
    raise exception 'Danışan bulunamadı';
  end if;

  return jsonb_build_object(
    'member_id', p_member_id,
    'first_name', v_first,
    'last_name', v_last,
    'full_name', v_full,
    'phone', v_phone
  );
exception
  when unique_violation then
    raise exception 'Bu telefonla kayıtlı üyelik var';
end;
$$;

revoke all on function public.admin_update_member_profile(text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_member_profile(text, text, uuid, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

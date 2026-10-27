-- Phone changes use the same Turkish mobile rule.
-- The studio list shows the phone and whether the member signs in with Google or email.

create or replace function public.update_member_profile(
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'isim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null or v_phone !~ '^\+905[0-9]{9}$' then
    raise exception 'Telefon numarası geçersiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = v_uid;

  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  v_other := public.member_id_for_phone(v_phone);
  if v_other is not null and v_other <> v_member_id then
    raise exception 'Bu telefon başka bir hesaba bağlı';
  end if;

  update public.members
  set
    first_name = v_first,
    last_name = v_last,
    full_name = v_first || ' ' || v_last,
    phone = v_phone
  where id = v_member_id
    and user_id = v_uid;

  return public.member_dashboard_payload(v_member_id, 50);
end;
$fn$;

create or replace function public.admin_list_clients(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
      'sign_in_method', public.member_sign_in_method(m.user_id),
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
$fn$;

create or replace function public.admin_member_dashboard(
  p_username text,
  p_password text,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payload jsonb;
  v_uid uuid;
  v_phone text;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_member_id is null or not exists (
    select 1 from public.members where id = p_member_id
  ) then
    raise exception 'Üye bulunamadı';
  end if;

  select user_id, phone
  into v_uid, v_phone
  from public.members
  where id = p_member_id;

  v_payload := public.member_dashboard_payload(p_member_id, 50);
  v_payload := jsonb_set(
    v_payload,
    '{profile,sign_in_method}',
    coalesce(to_jsonb(public.member_sign_in_method(v_uid)), 'null'::jsonb),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{profile,phone}',
    coalesce(to_jsonb(v_phone), 'null'::jsonb),
    true
  );
  return v_payload;
end;
$fn$;

notify pgrst, 'reload schema';

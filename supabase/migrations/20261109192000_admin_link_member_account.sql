-- Manual match: attach one site login to one desk member.
-- The desk row keeps its id. A signup duplicate's packages, reservations,
-- payments, cash receipts, package requests, link requests, manual credit
-- adjustments, and deletion requests move onto that row, then the duplicate
-- is removed. Credit rows stay on the same package ids.
-- Refuses when the desk row already has another login, when the login is
-- already on that row, when both rows hold a booked seat on the same slot,
-- or when both have the same pending package request.
-- members.phone may be null so the existing optional-phone desk form can save.

alter table public.members
  alter column phone drop not null;

alter table public.reservations
  drop constraint reservations_member_package_id_member_id_fkey;

alter table public.reservations
  add constraint reservations_member_package_id_member_id_fkey
  foreign key (member_package_id, member_id)
  references public.member_packages (id, member_id)
  on delete cascade
  deferrable initially immediate;

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

create or replace function public.admin_search_site_accounts(
  p_username text,
  p_password text,
  p_query text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := left(btrim(coalesce(p_query, '')), 80);
  v_fold text;
  v_digits text;
  v_rows jsonb;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if char_length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  v_fold := translate(
    lower(replace(replace(v_query, 'İ', 'i'), 'I', 'ı')),
    'şğüöçı',
    'sguoci'
  );
  v_digits := regexp_replace(v_query, '\D', '', 'g');

  select coalesce(jsonb_agg(item order by item->>'full_name'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'member_id', m.id,
      'full_name', coalesce(
        nullif(btrim(m.full_name), ''),
        nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data->>'name'), '')
      ),
      'email', coalesce(nullif(btrim(m.email), ''), nullif(btrim(u.email), '')),
      'phone', m.phone,
      'credits_remaining', coalesce(bal.credits_remaining, 0),
      'sign_in_method', public.member_sign_in_method(u.id)
    ) as item
    from auth.users u
    left join public.members m on m.user_id = u.id
    left join lateral (
      select coalesce(sum(mp.credits_remaining), 0)::integer as credits_remaining
      from public.member_packages mp
      where mp.member_id = m.id
    ) bal on true
    where strpos(
        translate(lower(replace(replace(coalesce(m.full_name, ''), 'İ', 'i'), 'I', 'ı')), 'şğüöçı', 'sguoci'),
        v_fold
      ) > 0
      or strpos(
        translate(lower(replace(replace(coalesce(m.email, ''), 'İ', 'i'), 'I', 'ı')), 'şğüöçı', 'sguoci'),
        v_fold
      ) > 0
      or strpos(
        translate(lower(replace(replace(coalesce(u.email, ''), 'İ', 'i'), 'I', 'ı')), 'şğüöçı', 'sguoci'),
        v_fold
      ) > 0
      or strpos(
        translate(
          lower(replace(replace(coalesce(u.raw_user_meta_data->>'full_name', ''), 'İ', 'i'), 'I', 'ı')),
          'şğüöçı',
          'sguoci'
        ),
        v_fold
      ) > 0
      or strpos(
        translate(
          lower(replace(replace(coalesce(u.raw_user_meta_data->>'name', ''), 'İ', 'i'), 'I', 'ı')),
          'şğüöçı',
          'sguoci'
        ),
        v_fold
      ) > 0
      or (
        char_length(v_digits) >= 2
        and strpos(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), v_digits) > 0
      )
    order by coalesce(m.full_name, u.email) nulls last, u.created_at
    limit 8
  ) hits;

  return v_rows;
end;
$$;

create or replace function public.admin_link_member_account(
  p_username text,
  p_password text,
  p_member_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desk public.members;
  v_dup public.members;
  v_auth_email text;
  v_email_to_set text;
  v_kvkk timestamptz;
  v_credits_before integer;
  v_credits_after integer;
  v_moved_ids uuid[];
  v_pkg_id uuid;
  v_first uuid;
  v_second uuid;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  if p_user_id is null then
    raise exception 'Hesap bulunamadı';
  end if;

  if p_member_id::text <= p_user_id::text then
    v_first := p_member_id;
    v_second := p_user_id;
  else
    v_first := p_user_id;
    v_second := p_member_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('admin-link-member'), hashtext(v_first::text));
  perform pg_advisory_xact_lock(hashtext('admin-link-member'), hashtext(v_second::text));

  select nullif(btrim(u.email), '')
  into v_auth_email
  from auth.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'Hesap bulunamadı';
  end if;

  perform 1
  from public.members
  where id = p_member_id
     or user_id = p_user_id
  order by id
  for update;

  select *
  into v_desk
  from public.members
  where id = p_member_id;

  if not found then
    raise exception 'Üye bulunamadı';
  end if;

  if v_desk.user_id is not null and v_desk.user_id is distinct from p_user_id then
    raise exception 'Bu kaydın zaten bir site hesabı var';
  end if;

  if v_desk.user_id = p_user_id then
    raise exception 'Bu hesap zaten bu kayıtta';
  end if;

  select *
  into v_dup
  from public.members
  where user_id = p_user_id
    and id <> p_member_id;

  if v_dup.id is not null and exists (
    select 1
    from public.reservations src
    join public.reservations dst
      on dst.slot_id = src.slot_id
     and dst.member_id = v_desk.id
     and dst.status = 'booked'
    where src.member_id = v_dup.id
      and src.status = 'booked'
  ) then
    raise exception 'Aynı derse iki kayıt var';
  end if;

  if v_dup.id is not null and exists (
    select 1
    from public.package_requests src
    join public.package_requests dst
      on dst.kind = src.kind
     and dst.member_id = v_desk.id
     and dst.status = 'pending'
    where src.member_id = v_dup.id
      and src.status = 'pending'
  ) then
    raise exception 'Aynı bekleyen paket isteği var';
  end if;

  select coalesce(sum(mp.credits_remaining), 0)::integer
  into v_credits_before
  from public.member_packages mp
  where mp.member_id = v_desk.id
     or (v_dup.id is not null and mp.member_id = v_dup.id);

  v_email_to_set := null;
  v_kvkk := null;

  if nullif(btrim(v_desk.email), '') is null then
    v_email_to_set := coalesce(nullif(btrim(v_dup.email), ''), v_auth_email);
    if v_email_to_set is not null and exists (
      select 1
      from public.members other
      where other.id <> v_desk.id
        and (v_dup.id is null or other.id <> v_dup.id)
        and nullif(btrim(other.email), '') is not null
        and lower(btrim(other.email)) = lower(v_email_to_set)
    ) then
      v_email_to_set := null;
    end if;
  end if;

  if v_desk.kvkk_accepted_at is null and v_dup.kvkk_accepted_at is not null then
    v_kvkk := v_dup.kvkk_accepted_at;
  end if;

  if v_dup.id is not null then
    execute 'set constraints reservations_member_package_id_member_id_fkey deferred';

    with moved as (
      update public.member_packages
      set member_id = v_desk.id
      where member_id = v_dup.id
      returning id
    )
    select coalesce(array_agg(id), array[]::uuid[])
    into v_moved_ids
    from moved;

    update public.reservations
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.payments
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.cash_receipts
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.package_requests
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.member_link_requests
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.manual_credit_adjustments
    set member_id = v_desk.id
    where member_id = v_dup.id;

    update public.member_deletion_requests
    set member_id = v_desk.id
    where member_id = v_dup.id;

    if exists (select 1 from public.member_packages where member_id = v_dup.id)
      or exists (select 1 from public.reservations where member_id = v_dup.id)
      or exists (select 1 from public.payments where member_id = v_dup.id)
      or exists (select 1 from public.cash_receipts where member_id = v_dup.id)
      or exists (select 1 from public.package_requests where member_id = v_dup.id)
      or exists (select 1 from public.member_link_requests where member_id = v_dup.id)
      or exists (select 1 from public.manual_credit_adjustments where member_id = v_dup.id)
      or exists (select 1 from public.member_deletion_requests where member_id = v_dup.id)
    then
      raise exception 'Kayıt taşınamadı';
    end if;

    if v_moved_ids is not null then
      foreach v_pkg_id in array v_moved_ids loop
        perform public.assert_package_balance(v_pkg_id);
      end loop;
    end if;

    delete from public.members
    where id = v_dup.id;

    if exists (select 1 from public.members where id = v_dup.id) then
      raise exception 'Kayıt taşınamadı';
    end if;
  end if;

  update public.members
  set user_id = p_user_id,
      email = case
        when nullif(btrim(email), '') is null and v_email_to_set is not null then v_email_to_set
        else email
      end,
      kvkk_accepted_at = coalesce(kvkk_accepted_at, v_kvkk)
  where id = v_desk.id
    and (user_id is null or user_id = p_user_id);

  if not found then
    raise exception 'Bu kaydın zaten bir site hesabı var';
  end if;

  select coalesce(sum(mp.credits_remaining), 0)::integer
  into v_credits_after
  from public.member_packages mp
  where mp.member_id = v_desk.id;

  if v_credits_after is distinct from v_credits_before then
    raise exception 'Kredi defteri uyuşmuyor';
  end if;

  return jsonb_build_object(
    'status', 'linked',
    'full_name', v_desk.full_name,
    'merged', v_dup.id is not null
  );
end;
$$;

revoke all on function public.admin_search_site_accounts(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_link_member_account(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_search_site_accounts(text, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_link_member_account(text, text, uuid, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

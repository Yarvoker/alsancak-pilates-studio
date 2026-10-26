-- Phone claim can no longer bind an unbound member to whoever is logged in.
-- Email match links once. Anything else waits for the studio, or looks like "not found".

create table public.phone_claim_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index phone_claim_attempts_user_created_idx
  on public.phone_claim_attempts (user_id, created_at desc);

alter table public.phone_claim_attempts enable row level security;
revoke all on table public.phone_claim_attempts from public, anon, authenticated;

create table public.member_link_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  user_id uuid not null,
  phone text not null,
  email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index member_link_requests_one_pending
  on public.member_link_requests (user_id, phone)
  where status = 'pending';

alter table public.member_link_requests enable row level security;
revoke all on table public.member_link_requests from public, anon, authenticated;

revoke all on function public.claim_member_phone(text) from public, anon, authenticated, service_role;
drop function public.claim_member_phone(text);

create function public.claim_member_phone(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_existing uuid;
  v_owner uuid;
  v_member_email text;
  v_session_email text;
  v_attempts integer;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext('phone-claim'), hashtext(v_uid::text));

  delete from public.phone_claim_attempts
  where user_id = v_uid
    and created_at <= now() - interval '1 hour';

  insert into public.phone_claim_attempts (user_id)
  values (v_uid);

  select count(*)::integer
  into v_attempts
  from public.phone_claim_attempts
  where user_id = v_uid
    and created_at > now() - interval '1 hour';

  if v_attempts > 5 then
    raise exception 'Çok fazla bağlama denemesi';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  v_existing := public.member_id_for_phone(v_phone);
  if v_existing is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select user_id, email
  into v_owner, v_member_email
  from public.members
  where id = v_existing
  for update;

  if v_owner is not null then
    if v_owner = v_uid then
      return jsonb_build_object('status', 'linked');
    end if;

    return jsonb_build_object('status', 'not_found');
  end if;

  v_session_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_member_email := nullif(lower(btrim(coalesce(v_member_email, ''))), '');

  if v_member_email is not null
    and v_session_email is not null
    and v_member_email = v_session_email
    and not exists (
      select 1
      from public.members
      where user_id = v_uid
        and id <> v_existing
    )
  then
    update public.members
    set user_id = v_uid
    where id = v_existing
      and user_id is null;

    if found then
      return jsonb_build_object('status', 'linked');
    end if;

    select user_id
    into v_owner
    from public.members
    where id = v_existing;

    if v_owner = v_uid then
      return jsonb_build_object('status', 'linked');
    end if;

    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.member_link_requests (member_id, user_id, phone, email)
  values (
    v_existing,
    v_uid,
    v_phone,
    nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
  )
  on conflict (user_id, phone) where status = 'pending'
  do nothing;

  return jsonb_build_object('status', 'pending');
end;
$$;

create or replace function public.admin_list_link_requests(
  p_username text,
  p_password text
)
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

  select coalesce(jsonb_agg(item order by item->>'created_at'), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', r.id,
      'full_name', m.full_name,
      'phone', m.phone,
      'email', r.email,
      'created_at', r.created_at
    ) as item
    from public.member_link_requests r
    join public.members m on m.id = r.member_id
    where r.status = 'pending'
    order by r.created_at
    limit 200
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.admin_decide_link_request(
  p_username text,
  p_password text,
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.member_link_requests;
  v_owner uuid;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Bağlama kararı geçersiz';
  end if;

  select *
  into v_request
  from public.member_link_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Bağlama isteği bulunamadı';
  end if;

  if p_decision = 'rejected' then
    update public.member_link_requests
    set status = 'rejected',
        decided_at = now()
    where id = p_request_id;

    return jsonb_build_object('status', 'rejected');
  end if;

  select user_id
  into v_owner
  from public.members
  where id = v_request.member_id
  for update;

  if v_owner is not null and v_owner is distinct from v_request.user_id then
    raise exception 'Bağlama onaylanamadı';
  end if;

  if exists (
    select 1
    from public.members
    where user_id = v_request.user_id
      and id <> v_request.member_id
  ) then
    raise exception 'Bağlama onaylanamadı';
  end if;

  if v_owner is null then
    update public.members
    set user_id = v_request.user_id,
        email = coalesce(email, nullif(btrim(v_request.email), ''))
    where id = v_request.member_id
      and user_id is null;

    if not found then
      raise exception 'Bağlama onaylanamadı';
    end if;
  end if;

  update public.member_link_requests
  set status = 'approved',
      decided_at = now()
  where id = p_request_id
    and status = 'pending';

  return jsonb_build_object('status', 'approved');
end;
$$;

create or replace function public.record_booking_inquiry(
  p_selected_on date,
  p_phone text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text;
  v_phone text;
  v_id uuid;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  if p_source not in ('day', 'phone') then
    raise exception 'Kayıt türü geçersiz';
  end if;

  -- The typed phone is never stored. A session uses that member's own phone.
  if auth.uid() is not null then
    select nullif(btrim(m.phone), '')
    into v_raw
    from public.members m
    where m.user_id = auth.uid()
    limit 1;

    v_phone := public.normalize_phone(v_raw);
  else
    v_raw := null;
    v_phone := null;
  end if;

  if p_selected_on is not null and (
    p_selected_on < v_today
    or p_selected_on > v_today + 7
  ) then
    p_selected_on := null;
  end if;

  if p_selected_on is null and v_raw is null then
    return null;
  end if;

  if exists (
    select 1
    from public.booking_inquiries
    where source = p_source
      and selected_on is not distinct from p_selected_on
      and phone_raw is not distinct from v_raw
      and created_at > now() - interval '2 minutes'
  ) then
    return null;
  end if;

  insert into public.booking_inquiries (selected_on, phone_raw, phone_normalized, source)
  values (p_selected_on, v_raw, v_phone, p_source)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.book_session(uuid) from public, anon;
revoke all on function public.cancel_reservation(uuid) from public, anon;
revoke all on function public.member_booking_state() from public, anon;
revoke all on function public.register_member(text, text, text) from public, anon;
revoke all on function public.register_trial_lesson(text, text, text, uuid) from public, anon;
revoke all on function public.claim_member_phone(text) from public, anon;

grant execute on function public.book_session(uuid) to authenticated, service_role;
grant execute on function public.cancel_reservation(uuid) to authenticated, service_role;
grant execute on function public.member_booking_state() to authenticated, service_role;
grant execute on function public.register_member(text, text, text) to authenticated, service_role;
grant execute on function public.register_trial_lesson(text, text, text, uuid) to authenticated, service_role;
grant execute on function public.claim_member_phone(text) to authenticated, service_role;

revoke all on function public.admin_list_link_requests(text, text) from public, anon, authenticated;
revoke all on function public.admin_decide_link_request(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_link_requests(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_decide_link_request(text, text, uuid, text) to anon, authenticated, service_role;

grant execute on function public.record_booking_inquiry(date, text, text) to anon, authenticated, service_role;
grant execute on function public.list_bookable_slots(date, date) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

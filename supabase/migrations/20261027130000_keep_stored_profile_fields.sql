create or replace function public.complete_member_profile(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_kvkk boolean
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
  v_stored_phone text;
  v_stored_first text;
  v_stored_last text;
  v_self uuid;
  v_other uuid;
  v_owner uuid;
  v_claim jsonb;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  if p_kvkk is not true then
    raise exception 'KVKK onayı gerekli';
  end if;

  perform pg_advisory_xact_lock(hashtext('member-profile'), hashtext(v_uid::text));

  select id,
         public.normalize_phone(phone),
         btrim(coalesce(first_name, '')),
         btrim(coalesce(last_name, ''))
  into v_self, v_stored_phone, v_stored_first, v_stored_last
  from public.members
  where user_id = v_uid
  for update;

  if not public.valid_person_name(v_first) and public.valid_person_name(v_stored_first) then
    v_first := v_stored_first;
  end if;
  if not public.valid_person_name(v_last) and public.valid_person_name(v_stored_last) then
    v_last := v_stored_last;
  end if;

  if not public.valid_person_name(v_first) or not public.valid_person_name(v_last) then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    v_phone := v_stored_phone;
  end if;
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  v_other := public.member_id_for_phone(v_phone);

  if v_other is not null and v_other is distinct from v_self then
    select user_id
    into v_owner
    from public.members
    where id = v_other
    for update;

    if v_owner is not null and v_owner is distinct from v_uid then
      insert into public.member_link_requests (member_id, user_id, phone, email)
      values (
        v_other,
        v_uid,
        v_phone,
        nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
      )
      on conflict (user_id, phone) where status = 'pending'
      do nothing;

      return jsonb_build_object('status', 'pending_link');
    end if;

    v_claim := public.claim_member_phone(v_phone);
    if coalesce(v_claim ->> 'status', '') in ('pending', 'not_found') then
      return jsonb_build_object('status', 'pending_link');
    end if;

    v_self := v_other;
  end if;

  if v_self is null then
    insert into public.members (
      full_name,
      first_name,
      last_name,
      phone,
      user_id,
      email,
      kvkk_accepted_at
    )
    values (
      v_first || ' ' || v_last,
      v_first,
      v_last,
      v_phone,
      v_uid,
      public.session_email(),
      now()
    )
    returning id into v_self;

    return jsonb_build_object('status', 'created');
  end if;

  update public.members
  set
    first_name = case
      when nullif(btrim(coalesce(first_name, '')), '') is null then v_first
      else first_name
    end,
    last_name = case
      when nullif(btrim(coalesce(last_name, '')), '') is null then v_last
      else last_name
    end,
    phone = case
      when nullif(btrim(coalesce(phone, '')), '') is null then v_phone
      else phone
    end,
    email = coalesce(email, public.session_email()),
    kvkk_accepted_at = coalesce(kvkk_accepted_at, now())
  where id = v_self
    and user_id = v_uid;

  update public.members
  set full_name = btrim(first_name) || ' ' || btrim(last_name)
  where id = v_self
    and nullif(btrim(coalesce(full_name, '')), '') is null;

  return jsonb_build_object('status', 'updated');
end;
$fn$;

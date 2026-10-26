-- A phone that is not on file can be saved with a name, without booking a lesson.
-- Trial registration stays on an open group hour.

create or replace function public.register_member(
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
begin
  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  v_member_id := public.member_id_for_phone(v_phone);
  if v_member_id is not null then
    raise exception 'Bu telefonla kayıtlı üyelik var';
  end if;

  insert into public.members (full_name, phone)
  values (v_first || ' ' || v_last, v_phone)
  returning id into v_member_id;

  return v_member_id;
end;
$$;

create or replace function public.register_trial_lesson(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text;
  v_member_id uuid;
  v_slot public.session_slots;
  v_booked integer;
  v_package_id uuid;
  v_member_package_id uuid;
  v_slot_date date;
  v_has_taken boolean;
  v_trial_used boolean;
  v_has_paid boolean;
  v_reservation_id uuid;
begin
  if char_length(v_first) < 2
    or char_length(v_first) > 40
    or char_length(v_last) < 2
    or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]'
    or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]'
    or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  select *
  into v_slot
  from public.session_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Slot bulunamadı';
  end if;

  if v_slot.session_type is distinct from 'group'::public.session_type then
    raise exception 'Deneme antrenmanı yalnız grup dersine yazılır';
  end if;

  if v_slot.status <> 'open'
    or v_slot.starts_at <= now()
    or not public.slot_is_legal(v_slot.starts_at)
  then
    raise exception 'Slot rezervasyona kapalı';
  end if;

  select count(*)::integer
  into v_booked
  from public.reservations
  where slot_id = p_slot_id
    and status = 'booked';

  if v_booked >= v_slot.capacity then
    raise exception 'Slot dolu';
  end if;

  v_member_id := public.member_id_for_phone(v_phone);

  if v_member_id is not null then
    select f.has_taken_lessons, f.trial_used, f.has_paid_package
    into v_has_taken, v_trial_used, v_has_paid
    from public.member_lesson_flags(v_member_id) as f;

    if v_has_taken
      or v_trial_used
      or v_has_paid
      or exists (
        select 1
        from public.reservations
        where member_id = v_member_id
          and status = 'booked'
      )
    then
      raise exception 'Bu telefonla kayıtlı üyelik var';
    end if;
  else
    insert into public.members (full_name, phone)
    values (v_first || ' ' || v_last, v_phone)
    returning id into v_member_id;
  end if;

  insert into public.packages (name, credit_count)
  values ('Ücretsiz Deneme Dersi', 1)
  on conflict (name) do nothing;

  select id
  into v_package_id
  from public.packages
  where name = 'Ücretsiz Deneme Dersi';

  v_slot_date := (timezone('Europe/Istanbul', v_slot.starts_at))::date;

  insert into public.member_packages (
    member_id,
    package_id,
    credits_total,
    credits_remaining,
    starts_on
  )
  values (
    v_member_id,
    v_package_id,
    1,
    1,
    v_slot_date
  )
  returning id into v_member_package_id;

  insert into public.credit_ledger (member_package_id, delta, reason)
  values (v_member_package_id, 1, 'assign');

  perform public.assert_package_balance(v_member_package_id);
  v_reservation_id := public.book_session(v_member_id, p_slot_id);
  return v_reservation_id;
end;
$$;

revoke all on function public.register_member(text, text, text) from public, anon, authenticated;
grant execute on function public.register_member(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

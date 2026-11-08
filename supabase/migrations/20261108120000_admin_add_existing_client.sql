-- Let the desk add an old client who is not in the member list yet.

create or replace function public.admin_add_existing_client(
  p_username text,
  p_password text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_remaining integer,
  p_teacher_id uuid default null,
  p_starts_on date default null,
  p_amount numeric default null,
  p_received_on date default null,
  p_note text default null
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
  v_member_id uuid;
  v_lessons jsonb;
  v_receipt jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if char_length(v_first) < 2 or char_length(v_first) > 40
    or char_length(v_last) < 2 or char_length(v_last) > 40
    or v_first !~ '[[:alpha:]]' or v_last !~ '[[:alpha:]]'
    or v_first ~ '[0-9]' or v_last ~ '[0-9]'
  then
    raise exception 'İsim ve soyisim gerekli';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'Telefon numarası geçersiz';
  end if;

  if p_remaining is null or p_remaining < 0 or p_remaining > 500 then
    raise exception 'Kalan ders geçersiz';
  end if;

  if p_remaining > 0 and (
    p_starts_on is null
    or p_starts_on < date '2020-01-01'
    or p_starts_on > (timezone('Europe/Istanbul', now()))::date + 366
  ) then
    raise exception 'Başlangıç tarihi geçersiz';
  end if;

  if (p_remaining > 0 or p_amount is not null) and (
    p_teacher_id is null or not exists (
      select 1 from public.teachers where id = p_teacher_id and active
    )
  ) then
    raise exception 'Öğretmen seç';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_phone));

  if public.member_id_for_phone(v_phone) is not null then
    raise exception 'Bu telefonla kayıtlı üyelik var';
  end if;

  insert into public.members (full_name, first_name, last_name, phone)
  values (v_first || ' ' || v_last, v_first, v_last, v_phone)
  returning id into v_member_id;

  if p_remaining > 0 then
    v_lessons := public.admin_set_remaining_lessons(
      p_username,
      p_password,
      v_member_id,
      p_remaining,
      p_teacher_id,
      p_starts_on
    );
  end if;

  if p_amount is not null then
    v_receipt := public.admin_record_cash_payment(
      p_username,
      p_password,
      v_member_id,
      p_amount,
      0,
      coalesce(p_received_on, (timezone('Europe/Istanbul', now()))::date),
      coalesce(v_note, 'Eski müşteri kaydı'),
      p_teacher_id
    );
  end if;

  return jsonb_build_object(
    'member_id', v_member_id,
    'full_name', v_first || ' ' || v_last,
    'phone', v_phone,
    'credits_remaining', coalesce((v_lessons->>'credits_remaining')::integer, 0),
    'starts_on', v_lessons->>'starts_on',
    'expires_on', v_lessons->>'expires_on',
    'receipt_id', v_receipt->>'id',
    'amount', v_receipt->>'amount'
  );
end;
$$;

revoke all on function public.admin_add_existing_client(text, text, text, text, text, integer, uuid, date, numeric, date, text) from public;
grant execute on function public.admin_add_existing_client(text, text, text, text, text, integer, uuid, date, numeric, date, text) to anon, authenticated, service_role;

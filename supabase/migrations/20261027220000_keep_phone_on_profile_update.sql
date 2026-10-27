-- A blank phone on profile save keeps the number already stored.
-- A new number still has to be a Turkish mobile and cannot belong to someone else.

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
  v_stored text;
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

  select id, public.normalize_phone(phone)
  into v_member_id, v_stored
  from public.members
  where user_id = v_uid;

  if v_member_id is null then
    raise exception 'Üye bulunamadı';
  end if;

  v_phone := public.normalize_phone(p_phone);
  if v_phone is null and btrim(coalesce(p_phone, '')) = '' then
    v_phone := v_stored;
  end if;
  if v_phone is null or v_phone !~ '^\+905[0-9]{9}$' then
    raise exception 'Telefon numarası geçersiz';
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

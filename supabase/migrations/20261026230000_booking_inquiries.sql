-- Day picks and phone entries from the public reservation screen.
-- The admin desk reads them. Visitors cannot read the table.

create table public.booking_inquiries (
  id uuid primary key default gen_random_uuid(),
  selected_on date,
  phone_raw text,
  phone_normalized text,
  source text not null check (source in ('day', 'phone')),
  created_at timestamptz not null default now(),
  check (char_length(coalesce(phone_raw, '')) <= 40),
  check (selected_on is not null or phone_raw is not null)
);

create index booking_inquiries_created_at
  on public.booking_inquiries (created_at desc);

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

  v_raw := left(btrim(coalesce(p_phone, '')), 40);
  if v_raw = '' then
    v_raw := null;
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

  v_phone := public.normalize_phone(v_raw);

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

create or replace function public.admin_list_booking_inquiries(
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

  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', id,
      'selected_on', selected_on,
      'phone_raw', phone_raw,
      'phone_normalized', phone_normalized,
      'source', source,
      'created_at', created_at
    ) as item
    from public.booking_inquiries
    order by created_at desc
    limit 400
  ) listed;

  return v_rows;
end;
$$;

alter table public.booking_inquiries enable row level security;

revoke all on table public.booking_inquiries from public, anon, authenticated;
revoke all on function public.record_booking_inquiry(date, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_booking_inquiries(text, text) from public, anon, authenticated;

grant execute on function public.record_booking_inquiry(date, text, text) to anon, authenticated, service_role;
grant execute on function public.admin_list_booking_inquiries(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

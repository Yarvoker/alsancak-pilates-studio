-- Member account read model. Identity stays auth.uid(). Phone stays contact data.
-- member_booking_state(), cancel_reservation_core, book_session, and
-- finalize_elapsed_reservations are intentionally unchanged.

alter table public.members
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.member_packages
  add column if not exists expires_on date;

update public.members m
set
  first_name = s.first_name,
  last_name = s.last_name
from (
  select
    id,
    case
      when cleaned = '' then null
      when strpos(cleaned, ' ') = 0 then cleaned
      else regexp_replace(cleaned, '\s+\S+$', '')
    end as first_name,
    case
      when cleaned = '' or strpos(cleaned, ' ') = 0 then ''
      else regexp_replace(cleaned, '^.*\s+', '')
    end as last_name
  from (
    select id, regexp_replace(btrim(coalesce(full_name, '')), '\s+', ' ', 'g') as cleaned
    from public.members
  ) raw
) s
where m.id = s.id
  and m.first_name is null;

create or replace function public.members_fill_names()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g');
begin
  if new.first_name is null then
    if v_name = '' then
      new.first_name := null;
      new.last_name := coalesce(new.last_name, '');
    elsif strpos(v_name, ' ') = 0 then
      new.first_name := v_name;
      new.last_name := coalesce(new.last_name, '');
    else
      new.first_name := regexp_replace(v_name, '\s+\S+$', '');
      new.last_name := regexp_replace(v_name, '^.*\s+', '');
    end if;
  end if;

  if new.last_name is null then
    new.last_name := '';
  end if;

  return new;
end;
$$;

drop trigger if exists members_fill_names on public.members;
create trigger members_fill_names
  before insert or update of full_name, first_name, last_name
  on public.members
  for each row
  execute function public.members_fill_names();

revoke all on function public.members_fill_names() from public, anon, authenticated;

create table if not exists public.member_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  email text,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create unique index if not exists member_deletion_requests_one_pending
  on public.member_deletion_requests (user_id)
  where status = 'pending';

alter table public.member_deletion_requests enable row level security;
revoke all on table public.member_deletion_requests from public, anon, authenticated;

create or replace function public.mask_member_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when digits ~ '^90[0-9]{10}$' then
      '+90 '
      || substr(digits, 3, 1)
      || '** *** '
      || substr(digits, 9, 2)
      || ' '
      || substr(digits, 11, 2)
    else null
  end
  from (
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
  ) raw;
$$;

create or replace function public.member_history_rows(
  p_member_id uuid,
  p_before timestamptz,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if p_member_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(item order by item->>'starts_at' desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'reservation_id', r.id,
      'starts_at', s.starts_at,
      'session_type', s.session_type,
      'attendance', case
        when r.status = 'attended' then 'attended'
        when r.status = 'booked' then 'auto_attended'
        when r.status = 'cancelled' then 'cancelled_refunded'
        when r.status = 'late_cancelled' then 'late_cancel'
        when r.status = 'no_show' then 'no_show'
        else r.status::text
      end,
      'credit_effect', case
        when r.status = 'cancelled' then 1
        else -1
      end
    ) as item
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.member_id = p_member_id
      and (
        r.status <> 'booked'
        or s.starts_at <= now()
      )
      and (p_before is null or s.starts_at < p_before)
    order by s.starts_at desc
    limit (case when p_limit is null then 1000000 else p_limit end)
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.member_dashboard_payload(
  p_member_id uuid,
  p_history_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Europe/Istanbul', now()))::date;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_since timestamptz;
  v_name text;
  v_session public.session_type;
  v_total integer := 0;
  v_remaining integer := 0;
  v_starts date;
  v_expires date;
  v_status text := 'none';
  v_type text;
  v_days integer;
  v_upcoming jsonb;
  v_history jsonb;
  v_total_attended integer := 0;
  v_month_attended integer := 0;
  v_weeks date[] := '{}';
  v_cursor date;
  v_streak integer := 0;
begin
  if p_member_id is not null then
    select first_name, last_name, email, phone, created_at
    into v_first, v_last, v_email, v_phone, v_since
    from public.members
    where id = p_member_id;
  end if;

  v_email := coalesce(
    nullif(btrim(coalesce(v_email, '')), ''),
    nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
  );

  if p_member_id is null or not exists (select 1 from public.members where id = p_member_id) then
    return jsonb_build_object(
        'profile', jsonb_build_object(
          'first_name', null,
          'last_name', null,
          'email', v_email,
          'phone_masked', null,
          'member_since', null
        ),
        'package', jsonb_build_object(
          'name', null,
          'type', null,
          'credits_total', 0,
          'credits_used', 0,
          'credits_remaining', 0,
          'starts_on', null,
          'expires_on', null,
          'days_left', null,
          'status', 'none'
        ),
        'upcoming', '[]'::jsonb,
        'history', '[]'::jsonb,
        'stats', jsonb_build_object(
          'total_attended', 0,
          'this_month_attended', 0,
          'streak_weeks', 0
        )
    );
  end if;

  select
    p.name,
    p.session_type,
    mp.credits_total,
    mp.credits_remaining,
    mp.starts_on,
    mp.expires_on
  into v_name, v_session, v_total, v_remaining, v_starts, v_expires
  from public.member_packages mp
  join public.packages p on p.id = mp.package_id
  where mp.member_id = p_member_id
    and mp.credits_remaining > 0
    and (mp.expires_on is null or mp.expires_on >= v_today)
    and mp.starts_on <= v_today
  order by mp.starts_on desc, mp.created_at desc
  limit 1;

  if found then
    v_status := 'active';
  else
    select
      p.name,
      p.session_type,
      mp.credits_total,
      mp.credits_remaining,
      mp.starts_on,
      mp.expires_on
    into v_name, v_session, v_total, v_remaining, v_starts, v_expires
    from public.member_packages mp
    join public.packages p on p.id = mp.package_id
    where mp.member_id = p_member_id
      and mp.credits_remaining > 0
      and (mp.expires_on is null or mp.expires_on >= v_today)
      and mp.starts_on > v_today
    order by mp.starts_on asc, mp.created_at asc
    limit 1;

    if found then
      v_status := 'active';
    elsif exists (select 1 from public.member_packages where member_id = p_member_id) then
      v_status := 'expired';
      select
        p.name,
        p.session_type,
        mp.credits_total,
        mp.credits_remaining,
        mp.starts_on,
        mp.expires_on
      into v_name, v_session, v_total, v_remaining, v_starts, v_expires
      from public.member_packages mp
      join public.packages p on p.id = mp.package_id
      where mp.member_id = p_member_id
      order by mp.starts_on desc, mp.created_at desc
      limit 1;
    else
      v_status := 'none';
      v_name := null;
      v_session := null;
      v_total := 0;
      v_remaining := 0;
      v_starts := null;
      v_expires := null;
    end if;
  end if;

  if v_status = 'none' then
    v_type := null;
    v_days := null;
  else
    if v_name = 'Ücretsiz Deneme Dersi' or v_session is null then
      v_type := 'trial';
    else
      v_type := v_session::text;
    end if;
    v_days := case when v_expires is null then null else (v_expires - v_today) end;
    v_total := coalesce(v_total, 0);
    v_remaining := coalesce(v_remaining, 0);
  end if;

  select coalesce(jsonb_agg(item order by item->>'starts_at'), '[]'::jsonb)
  into v_upcoming
  from (
    select jsonb_build_object(
      'reservation_id', r.id,
      'starts_at', s.starts_at,
      'ends_at', s.ends_at,
      'session_type', s.session_type,
      'cancel_deadline', s.starts_at - interval '24 hours',
      'can_cancel', now() < (s.starts_at - interval '24 hours'),
      'status', r.status
    ) as item
    from public.reservations r
    join public.session_slots s on s.id = r.slot_id
    where r.member_id = p_member_id
      and r.status = 'booked'
      and s.starts_at > now()
    order by s.starts_at asc
  ) listed;

  v_history := public.member_history_rows(p_member_id, null, p_history_limit);

  select
    count(*) filter (
      where r.status = 'attended'
        or (r.status = 'booked' and s.starts_at <= now())
    )::integer,
    count(*) filter (
      where (
        r.status = 'attended'
        or (r.status = 'booked' and s.starts_at <= now())
      )
      and date_trunc('month', timezone('Europe/Istanbul', s.starts_at))
        = date_trunc('month', timezone('Europe/Istanbul', now()))
    )::integer
  into v_total_attended, v_month_attended
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = p_member_id;

  select coalesce(array_agg(distinct date_trunc('week', timezone('Europe/Istanbul', s.starts_at))::date), '{}')
  into v_weeks
  from public.reservations r
  join public.session_slots s on s.id = r.slot_id
  where r.member_id = p_member_id
    and (
      r.status = 'attended'
      or (r.status = 'booked' and s.starts_at <= now())
    );

  v_cursor := date_trunc('week', timezone('Europe/Istanbul', now()))::date;
  if not (v_cursor = any (v_weeks)) then
    v_cursor := v_cursor - 7;
    if not (v_cursor = any (v_weeks)) then
      v_cursor := null;
    end if;
  end if;

  while v_cursor is not null and v_streak < 520 and (v_cursor = any (v_weeks)) loop
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 7;
  end loop;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'first_name', v_first,
      'last_name', v_last,
      'email', v_email,
      'phone_masked', public.mask_member_phone(v_phone),
      'member_since', v_since
    ),
    'package', jsonb_build_object(
      'name', v_name,
      'type', v_type,
      'credits_total', coalesce(v_total, 0),
      'credits_used', greatest(coalesce(v_total, 0) - coalesce(v_remaining, 0), 0),
      'credits_remaining', coalesce(v_remaining, 0),
      'starts_on', v_starts,
      'expires_on', v_expires,
      'days_left', v_days,
      'status', v_status
    ),
    'upcoming', coalesce(v_upcoming, '[]'::jsonb),
    'history', coalesce(v_history, '[]'::jsonb),
    'stats', jsonb_build_object(
      'total_attended', coalesce(v_total_attended, 0),
      'this_month_attended', coalesce(v_month_attended, 0),
      'streak_weeks', coalesce(v_streak, 0)
    )
  );
end;
$$;

create or replace function public.member_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  return public.member_dashboard_payload(v_member_id, 50);
end;
$$;

create or replace function public.member_history(
  p_before timestamptz,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_limit integer := coalesce(p_limit, 50);
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  if v_limit < 1 then
    v_limit := 1;
  elsif v_limit > 50 then
    v_limit := 50;
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  if v_member_id is null then
    return '[]'::jsonb;
  end if;

  return public.member_history_rows(v_member_id, p_before, v_limit);
end;
$$;

create or replace function public.member_data_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Yetkisiz';
  end if;

  select id
  into v_member_id
  from public.members
  where user_id = auth.uid();

  return public.member_dashboard_payload(v_member_id, null);
end;
$$;

create or replace function public.update_member_profile(
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
  if v_phone is null then
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
$$;

create or replace function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_email text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  select id, email
  into v_member_id, v_email
  from public.members
  where user_id = v_uid;

  v_email := coalesce(
    nullif(btrim(coalesce(v_email, '')), ''),
    nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '')
  );

  select id
  into v_id
  from public.member_deletion_requests
  where user_id = v_uid
    and status = 'pending'
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.member_deletion_requests (user_id, member_id, email, status)
  values (v_uid, v_member_id, v_email, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_member_dashboard(
  p_username text,
  p_password text,
  p_member_id uuid
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

  if p_member_id is null or not exists (
    select 1 from public.members where id = p_member_id
  ) then
    raise exception 'Üye bulunamadı';
  end if;

  return public.member_dashboard_payload(p_member_id, 50);
end;
$$;

create or replace function public.admin_list_deletion_requests(
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
      'id', d.id,
      'user_id', d.user_id,
      'member_id', d.member_id,
      'full_name', m.full_name,
      'email', coalesce(d.email, m.email),
      'phone', m.phone,
      'status', d.status,
      'created_at', d.created_at
    ) as item
    from public.member_deletion_requests d
    left join public.members m on m.id = d.member_id
    where d.status = 'pending'
    order by d.created_at desc
  ) listed;

  return v_rows;
end;
$$;

revoke all on function public.mask_member_phone(text) from public, anon, authenticated;
revoke all on function public.member_history_rows(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.member_dashboard_payload(uuid, integer) from public, anon, authenticated;

revoke all on function public.member_dashboard() from public, anon;
revoke all on function public.member_history(timestamptz, integer) from public, anon;
revoke all on function public.member_data_export() from public, anon;
revoke all on function public.update_member_profile(text, text, text) from public, anon;
revoke all on function public.request_account_deletion() from public, anon;

grant execute on function public.mask_member_phone(text) to service_role;
grant execute on function public.member_history_rows(uuid, timestamptz, integer) to service_role;
grant execute on function public.member_dashboard_payload(uuid, integer) to service_role;

grant execute on function public.member_dashboard() to authenticated, service_role;
grant execute on function public.member_history(timestamptz, integer) to authenticated, service_role;
grant execute on function public.member_data_export() to authenticated, service_role;
grant execute on function public.update_member_profile(text, text, text) to authenticated, service_role;
grant execute on function public.request_account_deletion() to authenticated, service_role;

revoke all on function public.admin_member_dashboard(text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_deletion_requests(text, text) from public, anon, authenticated;
grant execute on function public.admin_member_dashboard(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.admin_list_deletion_requests(text, text) to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservations'
    ) then
      alter publication supabase_realtime add table public.reservations;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Google and email sign-in share one member row.
-- A profile is complete only with a name and a Turkish mobile number.
-- Booking and trial rules are unchanged; an unfinished profile is still refused.

create unique index if not exists members_phone_unique
  on public.members (phone)
  where phone is not null;

create unique index if not exists members_email_unique
  on public.members (lower(btrim(email)))
  where nullif(btrim(email), '') is not null;

create or replace function public.is_tr_mobile(p_phone text)
returns boolean
language sql
immutable
set search_path = public
as $sql$
  select coalesce(public.normalize_phone(p_phone) ~ '^\+905[0-9]{9}$', false);
$sql$;

create or replace function public.member_profile_complete(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $sql$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_uid
      and char_length(btrim(coalesce(m.first_name, ''))) >= 2
      and char_length(btrim(coalesce(m.last_name, ''))) >= 2
      and m.first_name !~ '[0-9<>]'
      and m.last_name !~ '[0-9<>]'
      and public.is_tr_mobile(m.phone)
      and m.kvkk_accepted_at is not null
  );
$sql$;

create or replace function public.member_sign_in_method(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $sql$
  select case
    when p_uid is null then null
    when exists (
      select 1 from auth.identities i
      where i.user_id = p_uid and i.provider = 'google'
    ) and exists (
      select 1 from auth.identities i
      where i.user_id = p_uid and i.provider = 'email'
    ) then 'Google / E-posta'
    when exists (
      select 1 from auth.identities i
      where i.user_id = p_uid and i.provider = 'google'
    ) then 'Google'
    when exists (
      select 1 from auth.identities i
      where i.user_id = p_uid and i.provider = 'email'
    ) then 'E-posta'
    else null
  end;
$sql$;

notify pgrst, 'reload schema';

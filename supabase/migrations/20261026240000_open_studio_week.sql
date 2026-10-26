-- The studio desk can open the coming week as private (2) or group (14).
-- Draft hours stay closed on the public screen until this runs.

create or replace function public.admin_open_week(
  p_username text,
  p_password text,
  p_session_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date;
  v_to date;
  v_type public.session_type;
  v_id uuid;
  v_opened integer := 0;
  v_skipped integer := 0;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_session_type not in ('private', 'group') then
    raise exception 'Ders türü gerekli';
  end if;

  v_type := p_session_type::public.session_type;
  v_from := (timezone('Europe/Istanbul', now()))::date;
  v_to := v_from + 6;

  for v_id in
    select s.id
    from public.session_slots s
    where (timezone('Europe/Istanbul', s.starts_at))::date between v_from and v_to
      and s.starts_at > now()
      and public.slot_is_legal(s.starts_at)
      and s.status in ('draft', 'open', 'full')
    order by s.starts_at
  loop
    begin
      perform public.open_session_slot(v_id, v_type);
      v_opened := v_opened + 1;
    exception
      when others then
        if sqlerrm = 'Mevcut rezervasyonlar yeni kapasiteyi aşıyor' then
          v_skipped := v_skipped + 1;
        else
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'opened', v_opened,
    'skipped', v_skipped,
    'session_type', p_session_type,
    'from_date', v_from,
    'to_date', v_to
  );
end;
$$;

revoke all on function public.admin_open_week(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_open_week(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

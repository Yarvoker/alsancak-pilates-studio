create or replace function public.admin_fill_month_from_hours(
  p_username text,
  p_password text,
  p_month date,
  p_hours jsonb,
  p_holidays jsonb default '[]'::jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_from date;
  v_to date;
  v_row jsonb;
  v_teacher uuid;
  v_start time;
  v_end time;
  v_day date;
  v_shifts jsonb;
  v_saved jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_written integer := 0;
begin
  if not public.admin_login(p_username, p_password) then
    raise exception 'Yetkisiz';
  end if;

  if p_month is null or jsonb_typeof(coalesce(p_hours, '[]'::jsonb)) <> 'array' then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  v_month := date_trunc('month', p_month)::date;
  v_from := v_month;
  v_to := (v_month + interval '1 month' - interval '1 day')::date;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb))
  loop
    v_teacher := nullif(v_row->>'teacher_id', '')::uuid;
    v_start := nullif(v_row->>'start', '')::time;
    v_end := nullif(v_row->>'end', '')::time;

    if v_teacher is null or v_start is null or v_end is null or v_end <= v_start then
      raise exception 'Geçersiz tarih aralığı';
    end if;

    if not exists (select 1 from public.teachers where id = v_teacher) then
      raise exception 'Antrenör bulunamadı';
    end if;

    v_day := v_from;
    while v_day <= v_to loop
      if extract(dow from v_day) = 0 or exists (
        select 1
        from jsonb_array_elements_text(coalesce(p_holidays, '[]'::jsonb)) as holiday(value)
        where holiday.value ~ '^\d{4}-\d{2}-\d{2}$'
          and holiday.value::date = v_day
      ) then
        v_shifts := '[]'::jsonb;
      else
        v_shifts := jsonb_build_array(jsonb_build_object(
          'start', to_char(v_start, 'HH24:MI'),
          'end', to_char(v_end, 'HH24:MI')
        ));
      end if;

      v_saved := public.admin_save_teacher_shifts(
        p_username,
        p_password,
        v_teacher,
        v_day,
        v_shifts,
        p_force
      );

      if coalesce((v_saved->>'saved')::boolean, false) then
        v_written := v_written + 1;
      else
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'teacher_id', v_teacher,
          'date', v_day,
          'reservations', v_saved->'reservations'
        ));
      end if;

      v_day := v_day + 1;
    end loop;
  end loop;

  return jsonb_build_object('written', v_written, 'skipped', v_skipped);
end;
$$;

revoke all on function public.admin_fill_month_from_hours(text, text, date, jsonb, jsonb, boolean) from public;
grant execute on function public.admin_fill_month_from_hours(text, text, date, jsonb, jsonb, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

update public.teacher_shifts
set start_time = time '07:00'
where teacher_id = (select id from public.teachers where full_name = 'Ecrin Aydınlı')
  and start_time = time '12:00'
  and end_time = time '21:00';

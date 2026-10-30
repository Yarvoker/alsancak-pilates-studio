import { supabase } from '../booking/supabaseClient.js'

const KNOWN_MESSAGES = [
  'Yetkisiz',
  'Katılım durumu geçersiz',
  'Katılım bu kayıttan değiştirilemez',
  'Rezervasyon bulunamadı',
  'Rezervasyon iptal edilemez',
  'Geldi işareti ders başladıktan sonra konur',
  'No-show yalnızca derse 24 saatten az kala işaretlenir',
  'Ders türü gerekli',
  'Mevcut rezervasyonlar yeni kapasiteyi aşıyor',
  'Paket seçeneği geçersiz',
  'Özel ders kredisi geçersiz',
  'Üye bulunamadı',
  'Paket bulunamadı',
  'Başlangıç tarihi geçmiş olamaz',
  'Bağlama kararı geçersiz',
  'Bağlama isteği bulunamadı',
  'Bağlama onaylanamadı',
  'Geçersiz tarih aralığı',
  'Antrenör bulunamadı',
  'Paket bulunamadı',
  'Paket zaten aktif',
  'Paket seçeneği geçersiz',
]

export function adminMessage(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`
  return KNOWN_MESSAGES.find((item) => text.includes(item))
    || 'İşlem tamamlanamadı. Lütfen tekrar dene.'
}

export async function adminLogin(username, password) {
  const { data, error } = await supabase.rpc('admin_login', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data === true
}

export async function fetchAdminClients(username, password) {
  const { data, error } = await supabase.rpc('admin_list_clients', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function fetchBookingInquiries(username, password) {
  const { data, error } = await supabase.rpc('admin_list_booking_inquiries', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function fetchLessonHistory(username, password) {
  const { data, error } = await supabase.rpc('admin_lesson_history', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function markAttendance(username, password, reservationId, outcome) {
  const { data, error } = await supabase.rpc('admin_mark_attendance', {
    p_username: username,
    p_password: password,
    p_reservation_id: reservationId,
    p_outcome: outcome,
  })
  if (error) throw error
  return data
}

export async function openStudioWeek(username, password, sessionType) {
  const { data, error } = await supabase.rpc('admin_open_week', {
    p_username: username,
    p_password: password,
    p_session_type: sessionType,
  })
  if (error) throw error
  return data
}

export async function fetchLinkRequests(username, password) {
  const { data, error } = await supabase.rpc('admin_list_link_requests', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function decideLinkRequest(username, password, requestId, decision) {
  const { data, error } = await supabase.rpc('admin_decide_link_request', {
    p_username: username,
    p_password: password,
    p_request_id: requestId,
    p_decision: decision,
  })
  if (error) throw error
  return data
}

export async function fetchAdminMemberDashboard(username, password, memberId) {
  const { data, error } = await supabase.rpc('admin_member_dashboard', {
    p_username: username,
    p_password: password,
    p_member_id: memberId,
  })
  if (error) throw error
  return data
}

export async function fetchDeletionRequests(username, password) {
  const { data, error } = await supabase.rpc('admin_list_deletion_requests', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function fetchInstructorPerformance(username, password, month) {
  const { data, error } = await supabase.rpc('admin_instructor_performance', {
    p_username: username,
    p_password: password,
    p_month: month,
  })
  if (error) throw error
  return data
}

export async function fetchAdminTeachers(username, password) {
  const { data, error } = await supabase.rpc('admin_list_teachers', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function saveTeacherFlags(username, password, teacher) {
  const { data, error } = await supabase.rpc('admin_set_teacher_flags', {
    p_username: username,
    p_password: password,
    p_teacher_id: teacher.id,
    p_gives_group: teacher.gives_group,
    p_gives_private: teacher.gives_private,
    p_active: teacher.active,
  })
  if (error) throw error
  return data
}

export async function fetchAdminShifts(username, password, month) {
  const { data, error } = await supabase.rpc('admin_list_shifts', {
    p_username: username,
    p_password: password,
    p_month: month,
  })
  if (error) throw error
  return data
}

export async function saveTeacherShifts(username, password, teacherId, date, shifts, force = false) {
  const { data, error } = await supabase.rpc('admin_save_teacher_shifts', {
    p_username: username,
    p_password: password,
    p_teacher_id: teacherId,
    p_date: date,
    p_shifts: shifts,
    p_force: force,
  })
  if (error) throw error
  return data
}

export async function copyShiftPattern(username, password, month, mode) {
  const { data, error } = await supabase.rpc('admin_copy_shift_pattern', {
    p_username: username,
    p_password: password,
    p_month: month,
    p_mode: mode,
  })
  if (error) throw error
  return data
}

export async function activateMemberPackage(username, password, purchaseId) {
  const { data, error } = await supabase.rpc('admin_activate_package', {
    p_username: username,
    p_password: password,
    p_purchase_id: purchaseId,
    p_paid_at: new Date().toISOString(),
  })
  if (error) throw error
  return data
}

export async function extendMemberPackage(username, password, purchaseId, days) {
  const { data, error } = await supabase.rpc('admin_extend_package', {
    p_username: username,
    p_password: password,
    p_purchase_id: purchaseId,
    p_days: days,
  })
  if (error) throw error
  return data
}

export async function fetchSiteTexts(username, password) {
  const { data, error } = await supabase.rpc('admin_list_site_content', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  return data ?? []
}

export async function saveSiteText(username, password, key, title, body) {
  const { data, error } = await supabase.rpc('admin_save_site_content', {
    p_username: username,
    p_password: password,
    p_key: key,
    p_title: title,
    p_body: body,
  })
  if (error) throw error
  return data
}

export async function assignPackage(username, password, memberId, kind, startsOn, credits = null) {
  const { data, error } = await supabase.rpc('admin_assign_package', {
    p_username: username,
    p_password: password,
    p_member_id: memberId,
    p_kind: kind,
    p_starts_on: startsOn,
    p_credits: credits,
  })
  if (error) throw error
  return data
}

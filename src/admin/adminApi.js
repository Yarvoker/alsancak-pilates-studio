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

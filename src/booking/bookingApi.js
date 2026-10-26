import { supabase } from './supabaseClient.js'

const KNOWN_MESSAGES = [
  'Telefon numarası geçersiz',
  'Bu telefonla kayıtlı üyelik var',
  'Bu telefon birden fazla üyeye ait',
  'Üye bulunamadı',
  'Kullanılabilir ders kredisi yok',
  'Bu ders türü için kullanılabilir kredi yok',
  'Üyelik başlangıcından önce rezervasyon yapılamaz',
  'Slot dolu',
  'Slot rezervasyona kapalı',
  'Ders başlamış',
  'Rezervasyon bulunamadı',
  'Rezervasyon iptal edilemez',
  'Slot bulunamadı',
  'Geçersiz tarih aralığı',
  'İsim ve soyisim gerekli',
  'Deneme antrenmanı yalnız grup dersine yazılır',
  'Paket seçeneği geçersiz',
  'Paket talebi için kayıtlı üyelik gerekli',
]

export function messageOf(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`
  return KNOWN_MESSAGES.find((item) => text.includes(item))
    || 'İşlem tamamlanamadı. Lütfen tekrar dene.'
}

export async function recordBookingInquiry(selectedOn, phone, source) {
  const { error } = await supabase.rpc('record_booking_inquiry', {
    p_selected_on: selectedOn,
    p_phone: phone || null,
    p_source: source,
  })
  if (error) throw error
}

export async function fetchMemberState(phone) {
  const { data, error } = await supabase.rpc('member_booking_state', { p_phone: phone })
  if (error) throw error
  return data
}

export async function fetchBookableSlots(fromDate, toDate) {
  const { data, error } = await supabase.rpc('list_bookable_slots', {
    p_from: fromDate,
    p_to: toDate,
  })
  if (error) throw error
  return data ?? []
}

export async function bookSession(phone, slotId) {
  const { data, error } = await supabase.rpc('book_session_for_phone', {
    p_phone: phone,
    p_slot_id: slotId,
  })
  if (error) throw error
  return data
}

export async function cancelReservation(phone, reservationId) {
  const { data, error } = await supabase.rpc('cancel_reservation_for_phone', {
    p_phone: phone,
    p_reservation_id: reservationId,
  })
  if (error) throw error
  return data
}

export async function registerMember({ firstName, lastName, phone }) {
  const { data, error } = await supabase.rpc('register_member', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
  })
  if (error) throw error
  return data
}

export async function registerTrialLesson({ firstName, lastName, phone, slotId }) {
  const { data, error } = await supabase.rpc('register_trial_lesson', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone,
    p_slot_id: slotId,
  })
  if (error) throw error
  return data
}

export async function requestMemberPackage(phone, kind, slotId) {
  const { data, error } = await supabase.rpc('request_member_package', {
    p_phone: phone,
    p_kind: kind,
    p_slot_id: slotId,
  })
  if (error) throw error
  return data
}
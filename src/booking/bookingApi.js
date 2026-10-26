import { supabase } from './supabaseClient.js'

const KNOWN_MESSAGES = [
  'Telefon numarası geçersiz',
  'Üye bulunamadı',
  'Bu telefon birden fazla üyeye ait',
  'Kullanılabilir ders kredisi yok',
  'Üyelik başlangıcından önce rezervasyon yapılamaz',
  'Slot dolu',
  'Slot rezervasyona kapalı',
  'Ders başlamış',
  'Rezervasyon bulunamadı',
  'Rezervasyon iptal edilemez',
  'Slot bulunamadı',
  'Geçersiz tarih aralığı',
]

export function messageOf(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`
  return KNOWN_MESSAGES.find((item) => text.includes(item))
    || 'İşlem tamamlanamadı. Lütfen tekrar dene.'
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
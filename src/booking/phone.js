// Mirrors public.normalize_phone in supabase/migrations/20261026183000_public_booking_api.sql.

export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '')

  if (/^90\d{10}$/.test(digits)) return `+${digits}`
  if (/^0\d{10}$/.test(digits)) return `+9${digits}`
  if (/^[1-9]\d{9}$/.test(digits)) return `+90${digits}`
  return null
}
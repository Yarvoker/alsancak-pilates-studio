// Mirrors public.normalize_phone in supabase/migrations/20261026183000_public_booking_api.sql.

export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '')

  if (/^90\d{10}$/.test(digits)) return `+${digits}`
  if (/^0\d{10}$/.test(digits)) return `+9${digits}`
  if (/^[1-9]\d{9}$/.test(digits)) return `+90${digits}`
  return null
}

export function normalizeTrMobile(input) {
  const phone = normalizePhone(input)
  if (!phone || !/^\+905\d{9}$/.test(phone)) return null
  return phone
}

export function maskTrMobile(input) {
  let digits = String(input ?? '').replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.slice(0, 10)

  let out = digits.length ? '0' : ''
  out += digits.slice(0, 3)
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`
  if (digits.length > 6) out += ` ${digits.slice(6, 8)}`
  if (digits.length > 8) out += ` ${digits.slice(8, 10)}`
  return out
}
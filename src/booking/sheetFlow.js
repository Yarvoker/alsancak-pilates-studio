export const TRIAL_PACKAGE_NAME = 'Ücretsiz Deneme Dersi'

export const PACKAGE_OPTIONS = [
  {
    kind: 'pack_8',
    index: '08',
    title: "8'li antrenman",
    detail: 'Grup dersi',
  },
  {
    kind: 'pack_12',
    index: '12',
    title: "12'li antrenman",
    detail: 'Grup dersi',
  },
  {
    kind: 'private_single',
    index: 'ÖZ',
    title: 'Özel antrenman',
    detail: '2 kişi',
  },
]

const CHECKOUT_KEY = 'alsancak-checkout'

export function packageFitsSlot(item, sessionType) {
  if (!sessionType || !item?.session_type) return true
  return item.session_type === sessionType
}

function expiryDate(item) {
  if (item?.expires_on) return item.expires_on
  if (item?.expires_at) return String(item.expires_at).slice(0, 10)
  return null
}

function packageActiveOn(item, isoDate, sessionType) {
  if (!item || item.credits_remaining <= 0) return false
  if (item.activated_at === null) return false
  if (item.starts_on && item.starts_on > isoDate) return false
  const expiry = expiryDate(item)
  if (expiry && isoDate > expiry) return false
  return packageFitsSlot(item, sessionType)
}

export function creditsOnDate(packages, isoDate, sessionType) {
  return (packages ?? [])
    .filter((item) => packageActiveOn(item, isoDate, sessionType))
    .reduce((sum, item) => sum + item.credits_remaining, 0)
}

export function futureCreditPackage(packages, isoDate, sessionType) {
  return (packages ?? []).find((item) => (
    item.activated_at !== null
    && item.starts_on > isoDate
    && item.credits_remaining > 0
    && packageFitsSlot(item, sessionType)
    && (!expiryDate(item) || isoDate <= expiryDate(item))
  )) ?? null
}

export function validPersonName(value) {
  const text = String(value ?? '').trim()
  if (!text || text.length > 40) return false
  if (/[0-9<>]/u.test(text)) return false
  if (!/^[\p{L}\s'’´`-]+$/u.test(text)) return false
  const letters = text.replace(/[^\p{L}]/gu, '')
  return letters.length >= 2
}

export function occupancyLabel(slot, past) {
  if (past) return 'Geçti'
  if (!slot?.session_type || slot.capacity == null) return 'Kapalı'

  const booked = slot.booked_count ?? 0
  const full = slot.status === 'full' || booked >= slot.capacity
  const kind = slot.session_type === 'private' ? 'özel ders' : 'grup dersi'
  if (full) return `${booked}/${slot.capacity} Dolu`
  if (booked === 0) return `${booked}/${slot.capacity} Boş ${kind}`
  return `${booked}/${slot.capacity} ${kind}`
}

export function packageSessionType(kind) {
  if (kind === 'private_single') return 'private'
  if (kind === 'pack_8' || kind === 'pack_12') return 'group'
  return null
}

export function sheetFor(member, isoDate, sessionType, groupSeatOpen = false) {
  if (!member) return groupSeatOpen ? 'trial-offer' : 'packages'

  const credits = creditsOnDate(member.packages, isoDate, sessionType)
  if (credits > 0) return 'credits'
  if (futureCreditPackage(member.packages, isoDate, sessionType)) return 'credits'
  if (!member.trial_used && !member.has_taken_lessons && !member.has_paid_package && groupSeatOpen) {
    return 'trial-offer'
  }
  return 'packages'
}

export function packageSessionLabel(sessionType) {
  if (sessionType === 'private') return 'özel ders, 2 kişilik'
  if (sessionType === 'group') return 'grup dersi'
  return ''
}

export function packageLead(member) {
  if (member?.trial_used && !member?.has_taken_lessons) {
    return 'Deneme antrenmanın kayıtlı. Devam etmek için bir paket seç.'
  }
  return 'Ders almak için paket seçmelisin'
}

export function packageOption(kind) {
  return PACKAGE_OPTIONS.find((item) => item.kind === kind) ?? null
}

export function saveCheckout(order) {
  try {
    sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(order))
  } catch {
    // Private browsing can reject storage. The payment screen then asks for the choice again.
  }
}

export function readCheckout() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || 'null')
    if (!parsed?.title || !parsed?.startsOn || !parsed?.time) return null
    return parsed
  } catch {
    return null
  }
}

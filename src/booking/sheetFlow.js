export const TRIAL_PACKAGE_NAME = 'Ücretsiz Deneme Dersi'

export const PACKAGE_OPTIONS = [
  {
    kind: 'pack_8',
    index: '08',
    title: "8'li Pilates Paketi",
    detail: 'Sekiz ders',
  },
  {
    kind: 'pack_12',
    index: '12',
    title: "12'li Pilates Paketi",
    detail: 'On iki ders',
  },
  {
    kind: 'private_single',
    index: '01',
    title: 'Özel Ders',
    detail: 'Tekli, bireysel',
  },
]

export function packageFitsSlot(item, sessionType) {
  if (!sessionType || !item?.session_type) return true
  return item.session_type === sessionType
}

export function creditsOnDate(packages, isoDate, sessionType) {
  return (packages ?? [])
    .filter((item) => (
      item.starts_on <= isoDate
      && item.credits_remaining > 0
      && packageFitsSlot(item, sessionType)
    ))
    .reduce((sum, item) => sum + item.credits_remaining, 0)
}

export function futureCreditPackage(packages, isoDate, sessionType) {
  return (packages ?? []).find((item) => (
    item.starts_on > isoDate
    && item.credits_remaining > 0
    && packageFitsSlot(item, sessionType)
  )) ?? null
}

export function validPersonName(value) {
  const text = String(value ?? '').trim()
  if (text.length < 2 || text.length > 40) return false
  if (/\d/u.test(text)) return false
  return /\p{L}/u.test(text)
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

export function sheetFor(member, isoDate, sessionType) {
  if (!member) return 'trial-offer'

  const credits = creditsOnDate(member.packages, isoDate, sessionType)
  if (member.has_taken_lessons) return 'packages'
  if (credits > 0) return 'credits'
  if (futureCreditPackage(member.packages, isoDate, sessionType)) return 'credits'
  if (member.trial_used || member.has_paid_package) return 'packages'
  return 'trial-offer'
}

export function packageSessionLabel(sessionType) {
  if (sessionType === 'private') return 'özel ders, 2 kişilik'
  if (sessionType === 'group') return 'grup dersi'
  return ''
}

export function packageLead(member) {
  if (member?.trial_used && !member?.has_taken_lessons) {
    return 'Deneme dersin kayıtlı. Sonraki dersler için paketini seç.'
  }
  return 'Paketini seç. Talebin stüdyoya iletilir.'
}

export function packageOption(kind) {
  return PACKAGE_OPTIONS.find((item) => item.kind === kind) ?? null
}

export function packageWhatsappUrl(whatsappUrl, { title, whenLabel, name }) {
  const origin = String(whatsappUrl || '').split('?')[0]
  const who = name ? `${name}. ` : ''
  const text = `Merhaba, ${who}${title} için talep bırakıyorum. Ders: ${whenLabel}.`
  return `${origin}?text=${encodeURIComponent(text)}`
}

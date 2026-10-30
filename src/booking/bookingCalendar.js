import { addIsoDays } from './slotRules.js'

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa']

export function weekdayLabels() {
  return WEEKDAYS
}

export function monthKeyFromIso(isoDate) {
  return isoDate.slice(0, 7)
}

export function monthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(last).padStart(2, '0')}`,
  }
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + delta, 1))
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function capitalizeTr(value) {
  const text = String(value || '')
  if (!text) return ''
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1)
}

export function formatMonthTitle(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const raw = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return capitalizeTr(raw)
}

export function formatDayHeading(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNum = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', timeZone: 'UTC' }).format(date)
  const monthName = capitalizeTr(new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(date))
  const weekday = capitalizeTr(new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(date))
  return `${dayNum} ${monthName} ${weekday}`
}

export function formatDayAria(isoDate, openCount) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNum = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', timeZone: 'UTC' }).format(date)
  const monthName = capitalizeTr(new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(date))
  const weekday = capitalizeTr(new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(date))
  const count = Number(openCount) || 0
  return `${dayNum} ${monthName} ${year} ${weekday}, ${count} müsait ders`
}

export function monthCells(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const cells = []
  for (let index = 0; index < lead; index += 1) {
    const iso = addIsoDays(`${monthKey}-01`, index - lead)
    cells.push({ iso, inMonth: false })
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let day = 1; day <= last; day += 1) {
    const iso = `${monthKey}-${String(day).padStart(2, '0')}`
    cells.push({ iso, inMonth: true })
  }
  const cursor = cells[cells.length - 1].iso
  let extra = 1
  while (cells.length % 7 !== 0) {
    cells.push({ iso: addIsoDays(cursor, extra), inMonth: false })
    extra += 1
  }
  return cells
}

export function groupSlotsByDate(slots, istanbulDateTime) {
  const grouped = new Map()
  slots.forEach((slot) => {
    const iso = istanbulDateTime(slot.starts_at).date
    const list = grouped.get(iso) || []
    list.push(slot)
    grouped.set(iso, list)
  })
  return grouped
}

export function openSlotCount(slots) {
  return (slots || []).filter((slot) => (
    slot.status === 'open' && (slot.booked_count ?? 0) < (slot.capacity ?? 0)
  )).length
}

// Mirrors supabase/migrations/20261026170000_pilates_booking.sql.
// Europe/Istanbul. Lessons last 50 minutes and must finish by closing time.

export const TIME_ZONE = 'Europe/Istanbul'
export const SESSION_MINUTES = 50
export const CANCEL_WINDOW_HOURS = 24
export const CLOSE_MINUTES = 21 * 60

export const CAPACITY = {
  private: 2,
  group: 14,
}

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function studioWeekday(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day, 9, 0, 0))
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(instant)
  return WEEKDAY_INDEX[label]
}

export function openingMinutes(isoDate) {
  const weekday = studioWeekday(isoDate)
  if (weekday === 0) return null
  if (weekday === 6) return 9 * 60
  return 7 * 60
}

export function formatMinute(minute) {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0')
  const mins = String(minute % 60).padStart(2, '0')
  return `${hours}:${mins}`
}

export function slotStarts(isoDate) {
  const open = openingMinutes(isoDate)
  if (open === null) return []

  const starts = []
  for (let minute = open; minute + SESSION_MINUTES <= CLOSE_MINUTES; minute += SESSION_MINUTES) {
    starts.push(formatMinute(minute))
  }
  return starts
}

export function isLegalSlot(isoDate, hhmm) {
  return slotStarts(isoDate).includes(hhmm)
}

export function capacityFor(sessionType) {
  const capacity = CAPACITY[sessionType]
  if (!capacity) {
    throw new Error('Ders türü gerekli')
  }
  return capacity
}

export function isSlotFull(sessionType, bookedCount) {
  return bookedCount >= capacityFor(sessionType)
}

export function cancellationEffect(now, startsAt) {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const startMs = typeof startsAt === 'number' ? startsAt : new Date(startsAt).getTime()
  if (startMs - nowMs > CANCEL_WINDOW_HOURS * 60 * 60 * 1000) return 'refund'
  return 'burn'
}

export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

export function addIsoDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  const nextYear = utc.getUTCFullYear()
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(utc.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

export function upcomingStudioDates(count = 14, now = new Date()) {
  const dates = []
  let cursor = todayIso(now)

  while (dates.length < count) {
    if (openingMinutes(cursor) !== null) dates.push(cursor)
    cursor = addIsoDays(cursor, 1)
  }

  return dates
}

export function istanbulDateTime(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoTimestamp))
  const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  }
}

export function isPastSlot(isoDate, hhmm, now = Date.now()) {
  const nowDate = typeof now === 'number' ? new Date(now) : now
  const today = todayIso(nowDate)
  if (isoDate < today) return true
  if (isoDate > today) return false
  return hhmm <= istanbulDateTime(nowDate.toISOString()).time
}

export function formatStudioWhen(isoTimestamp) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp))
}

export function formatStudioDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

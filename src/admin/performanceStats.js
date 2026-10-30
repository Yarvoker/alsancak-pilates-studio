// Display helper for admin_instructor_performance.
// Status map lives next to the SQL aggregation in
// supabase/migrations/20261028140000_instructors_and_performance_pool.sql:
// completed = attended, active = booked,
// cancelled = cancelled + late_cancelled, no_show stays Gelmedi.
// Each completed lesson is one 50-minute session.

export const LESSON_MINUTES = 50

export function formatCompleted(count) {
  const lessons = Number(count) || 0
  const hours = (lessons * LESSON_MINUTES) / 60
  const hourLabel = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(hours)
  return `${lessons} ders · ${hourLabel} saat`
}

export function performanceMax(rows) {
  const values = (rows ?? []).flatMap((row) => [row.completed, row.active, row.cancelled])
  return Math.max(1, ...values.map((value) => Number(value) || 0))
}

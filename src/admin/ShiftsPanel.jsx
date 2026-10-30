import { useEffect, useMemo, useState } from 'react'
import { addIsoDays, formatStudioWhen, studioWeekday, todayIso } from '../booking/slotRules.js'
import {
  adminMessage,
  copyShiftPattern,
  fetchAdminShifts,
  fetchAdminTeachers,
  saveTeacherShifts,
} from './adminApi.js'
import { formatMonthTitle, monthBounds, monthKeyFromIso, shiftMonth } from '../booking/bookingCalendar.js'

function monthDays(monthKey) {
  const { from, to } = monthBounds(monthKey)
  const days = []
  let cursor = from
  while (cursor <= to) {
    days.push(cursor)
    cursor = addIsoDays(cursor, 1)
  }
  return days
}

function labelShift(shifts) {
  if (!shifts?.length) return ''
  return shifts.map((item) => `${item.start_time}-${item.end_time}`).join(', ')
}

function ShiftsPanel({ session, onNotice }) {
  const [monthKey, setMonthKey] = useState(() => monthKeyFromIso(todayIso()))
  const [teachers, setTeachers] = useState([])
  const [shifts, setShifts] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [blocked, setBlocked] = useState([])

  const days = useMemo(() => monthDays(monthKey), [monthKey])

  async function load(key = monthKey) {
    const [people, table] = await Promise.all([
      fetchAdminTeachers(session.username, session.password),
      fetchAdminShifts(session.username, session.password, `${key}-01`),
    ])
    setTeachers(people)
    setShifts(table?.shifts || [])
  }

  useEffect(() => {
    let ignore = false
    load(monthKey).catch((loadError) => {
      if (!ignore) setError(adminMessage(loadError))
    })
    return () => {
      ignore = true
    }
  }, [monthKey, session.username, session.password])

  function cellShifts(teacherId, isoDate) {
    return shifts
      .filter((item) => item.teacher_id === teacherId && item.date === isoDate)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  function openCell(teacher, isoDate) {
    const existing = cellShifts(teacher.id, isoDate)
    setBlocked([])
    setEditor({ teacher, date: isoDate })
    setDrafts(existing.length
      ? existing.map((item) => ({ start: item.start_time, end: item.end_time }))
      : [{ start: '07:00', end: '13:00' }])
  }

  async function save(force) {
    if (!editor) return
    setBusy(true)
    setError('')
    try {
      const result = await saveTeacherShifts(
        session.username,
        session.password,
        editor.teacher.id,
        editor.date,
        drafts.filter((item) => item.start && item.end),
        force,
      )
      if (result?.saved === false) {
        setBlocked(result.reservations || [])
        return
      }
      await load()
      setEditor(null)
      setBlocked([])
      onNotice('Mesai kaydedildi.')
    } catch (saveError) {
      setError(adminMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function copy(mode) {
    setBusy(true)
    setError('')
    try {
      const result = await copyShiftPattern(session.username, session.password, `${monthKey}-01`, mode)
      await load()
      const skipped = result?.skipped?.length || 0
      onNotice(skipped
        ? `${result.written} gün yazıldı. ${skipped} gün rezervasyon nedeniyle atlandı.`
        : 'Mesai tablosu güncellendi.')
    } catch (copyError) {
      setError(adminMessage(copyError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-block">
      <h2>Mesai tablosu</h2>
      <div className="month-cal-bar shift-month-bar">
        <button type="button" className="month-cal-arrow" aria-label="Önceki ay" onClick={() => setMonthKey(shiftMonth(monthKey, -1))}>‹</button>
        <h3 className="month-cal-title">{formatMonthTitle(monthKey)}</h3>
        <button type="button" className="month-cal-arrow" aria-label="Sonraki ay" onClick={() => setMonthKey(shiftMonth(monthKey, 1))}>›</button>
      </div>
      <div className="sheet-actions">
        <button type="button" className="cta" disabled={busy} onClick={() => copy('week')}>
          Haftalık şablonu tüm aya uygula
        </button>
        <button type="button" className="cta ghost" disabled={busy} onClick={() => copy('previous')}>
          Önceki ayı kopyala
        </button>
      </div>
      <p className="sheet-copy">
        Haftalık şablon, o ayda her günün ilk dolu örneğini aynı haftanın diğer günlerine yazar. Pazar ve kapalı günler gri görünür.
      </p>
      {error && <p className="booking-error" role="alert">{error}</p>}
      <div className="table-wrap">
        <table className="shift-table">
          <thead>
            <tr>
              <th>Öğretmen</th>
              {days.map((iso) => (
                <th key={iso} className={studioWeekday(iso) === 0 ? 'is-closed' : ''}>{Number(iso.slice(8))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((person) => (
              <tr key={person.id}>
                <th>{person.full_name}</th>
                {days.map((iso) => {
                  const items = cellShifts(person.id, iso)
                  const closed = studioWeekday(iso) === 0
                  return (
                    <td key={iso} className={closed ? 'is-closed' : ''}>
                      <button type="button" className="shift-cell" onClick={() => openCell(person, iso)}>
                        {labelShift(items) || '—'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor && (
        <div className="login-modal-backdrop" onMouseDown={() => setEditor(null)}>
          <div
            className="login-modal shift-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shift-editor-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="shift-editor-title">{editor.teacher.full_name}</h2>
            <p className="sheet-copy">{editor.date}</p>
            {drafts.map((item, index) => (
              <div className="shift-draft" key={`${item.start}-${index}`}>
                <label>
                  Başlangıç
                  <input
                    type="time"
                    value={item.start}
                    onChange={(event) => {
                      const next = drafts.slice()
                      next[index] = { ...item, start: event.target.value }
                      setDrafts(next)
                    }}
                  />
                </label>
                <label>
                  Bitiş
                  <input
                    type="time"
                    value={item.end}
                    onChange={(event) => {
                      const next = drafts.slice()
                      next[index] = { ...item, end: event.target.value }
                      setDrafts(next)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDrafts(drafts.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Sil
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() => setDrafts([...drafts, { start: '13:00', end: '21:00' }])}
            >
              Vardiya ekle
            </button>
            {blocked.length > 0 && (
              <div className="booking-error" role="alert">
                <p>Bu değişiklik rezervasyonlu saatleri dışarıda bırakır.</p>
                <ul>
                  {blocked.map((item) => (
                    <li key={item.id}>{item.full_name} · {formatStudioWhen(item.starts_at)}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="sheet-actions">
              <button type="button" className="cta" disabled={busy} onClick={() => save(false)}>Kaydet</button>
              {blocked.length > 0 && (
                <button type="button" className="cta ghost" disabled={busy} onClick={() => save(true)}>
                  Yine de kaydet
                </button>
              )}
              <button type="button" className="cta ghost" onClick={() => setEditor(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ShiftsPanel

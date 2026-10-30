import { useEffect, useState } from 'react'
import { adminMessage, fetchInstructorPerformance } from './adminApi.js'
import { formatCompleted, performanceMax } from './performanceStats.js'
import { todayIso } from '../booking/slotRules.js'

const BAR_TONE = {
  completed: 'Tamamlanan',
  active: 'Aktif',
  cancelled: 'İptal',
}

function currentMonth() {
  return todayIso().slice(0, 7)
}

function monthDate(value) {
  return `${value}-01`
}

function monthTitle(value) {
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function PerformanceChart({ rows }) {
  const max = performanceMax(rows)
  return (
    <div className="performance-chart" data-ui="instructor-performance" role="img" aria-label="Antrenör performans grafiği">
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <p>{row.full_name}</p>
            {Object.entries(BAR_TONE).map(([key, label]) => {
              const value = Number(row[key]) || 0
              return (
                <div key={key} className={`performance-bar performance-bar--${key}`}>
                  <span>{label}</span>
                  <span className="performance-track" aria-hidden="true">
                    <i style={{ width: `${(value / max) * 100}%` }} />
                  </span>
                  <strong>{value}</strong>
                </div>
              )
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PerformancePool({ session }) {
  const [month, setMonth] = useState(currentMonth)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let ignore = false
    setBusy(true)
    setError('')
    fetchInstructorPerformance(session.username, session.password, monthDate(month))
      .then((next) => {
        if (!ignore) setReport(next)
      })
      .catch((loadError) => {
        if (!ignore) {
          setReport(null)
          setError(adminMessage(loadError))
        }
      })
      .finally(() => {
        if (!ignore) setBusy(false)
      })
    return () => {
      ignore = true
    }
  }, [session, month])

  const rows = report?.instructors ?? []
  const unassigned = report?.unassigned
  const unassignedTotal = unassigned
    ? Number(unassigned.completed) + Number(unassigned.active) + Number(unassigned.cancelled) + Number(unassigned.no_show)
    : 0

  return (
    <section className="admin-block" aria-labelledby="performance-title">
      <h2 id="performance-title">Antrenör Performans Havuzu</h2>
      <label className="performance-month">
        Ay
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>
      <p className="sheet-copy">{monthTitle(month)} dersleri, seçilen antrenörün kendi kayıtlarından sayılır.</p>
      {busy && <p className="sheet-copy">Havuz yükleniyor.</p>}
      {error && <p className="booking-error" role="alert">{error}</p>}
      {!busy && !error && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Antrenör</th>
                  <th>Tamamlanan</th>
                  <th>Aktif ders</th>
                  <th>İptal</th>
                  <th>Gelmedi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.full_name}</td>
                    <td>{formatCompleted(row.completed)}</td>
                    <td>{row.active}</td>
                    <td>{row.cancelled}</td>
                    <td>{row.no_show}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PerformanceChart rows={rows} />
          {unassignedTotal > 0 && (
            <p className="sheet-copy">
              Eğitmeni seçilmeden alınan kayıtlar havuza dağıtılmaz.
              {' '}
              Aktif {unassigned.active}, tamamlanan {unassigned.completed}, iptal {unassigned.cancelled}, gelmedi {unassigned.no_show}.
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default PerformancePool

import { useEffect, useId, useRef, useState } from 'react'
import {
  adminLogin,
  adminMessage,
  assignPackage,
  fetchAdminClients,
  fetchLessonHistory,
  markAttendance,
} from './adminApi.js'
import { formatStudioDate, formatStudioWhen, todayIso } from '../booking/slotRules.js'

const PACKAGE_OPTIONS = [
  { kind: 'pack_8', label: "8'li Paket" },
  { kind: 'pack_12', label: "12'li Paket" },
]

const SESSION_LABEL = {
  private: 'Özel',
  group: 'Grup',
}

function splitName(fullName) {
  const text = String(fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!text) return { firstName: '—', lastName: '—' }
  const parts = text.split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

function packageLabel(client) {
  if (!client.active_package) return '—'
  if (client.package_starts_on && client.package_starts_on > todayIso()) {
    return `${client.active_package} · ${formatStudioDate(client.package_starts_on)}`
  }
  return client.active_package
}

function AdminGate({ onClose }) {
  const titleId = useId()
  const usernameRef = useRef(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [clients, setClients] = useState([])
  const [lessons, setLessons] = useState([])
  const [memberId, setMemberId] = useState('')
  const [kind, setKind] = useState('pack_8')
  const [startsOn, setStartsOn] = useState(() => todayIso())

  useEffect(() => {
    if (session) return undefined
    usernameRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, onClose])

  async function loadDesk(active) {
    const [nextClients, nextLessons] = await Promise.all([
      fetchAdminClients(active.username, active.password),
      fetchLessonHistory(active.username, active.password),
    ])
    setClients(nextClients)
    setLessons(nextLessons)
  }

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const accepted = await adminLogin(username, password)
      if (!accepted) {
        setError('Giriş bilgileri hatalı')
        return
      }
      const next = { username, password }
      await loadDesk(next)
      setSession(next)
      setUsername('')
      setPassword('')
    } catch (loginError) {
      setError(adminMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  async function submitPackage(event) {
    event.preventDefault()
    if (!session) return
    if (!memberId) {
      setError('Danışan seç')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await assignPackage(session.username, session.password, memberId, kind, startsOn)
      await loadDesk(session)
      const label = PACKAGE_OPTIONS.find((item) => item.kind === kind)?.label ?? 'Paket'
      setNotice(`${label} tanımlandı.`)
    } catch (assignError) {
      setError(adminMessage(assignError))
    } finally {
      setBusy(false)
    }
  }

  async function updateAttendance(lesson, outcome) {
    if (!session) return
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await markAttendance(session.username, session.password, lesson.id, outcome)
      await loadDesk(session)
      if (outcome === 'no_show') {
        setNotice(`Gelmedi olarak işaretlendi. Kalan kredi ${result.credits_remaining}.`)
      } else if (outcome === 'attended') {
        setNotice('Katılım geldi olarak kaydedildi.')
      } else if (result.refunded) {
        setNotice('İptal edildi. Kredi iade edildi.')
      } else {
        setNotice('İptal edildi. Kredi düşüldü.')
      }
    } catch (attendanceError) {
      setError(adminMessage(attendanceError))
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <div className="admin-backdrop" onMouseDown={onClose}>
        <form
          key="admin-login"
          className="admin-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={submitLogin}
        >
          <p className="eyebrow">STÜDYO</p>
          <h2 id={titleId}>Admin Girişi</h2>
          <label>
            Kullanıcı adı
            <input
              ref={usernameRef}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <p className="booking-error" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button type="submit" className="cta" disabled={busy}>
              {busy ? 'Kontrol ediliyor' : 'Giriş'}
            </button>
            <button type="button" className="cta ghost" onClick={onClose}>
              Vazgeç
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <div className="admin-bar">
        <div>
          <p className="eyebrow">YÖNETİM</p>
          <h1 id={titleId}>Stüdyo defteri</h1>
        </div>
        <button type="button" className="admin-entry" onClick={onClose}>
          Çıkış
        </button>
      </div>

      {(notice || error) && (
        <div className="admin-feedback">
          {notice && <p className="booking-note" role="status">{notice}</p>}
          {error && <p className="booking-error" role="alert">{error}</p>}
        </div>
      )}

      <section className="admin-block">
        <h2>Danışanlar</h2>
        {clients.length === 0 ? (
          <p className="sheet-copy">Kayıtlı danışan yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Adı</th>
                  <th>Soyadı</th>
                  <th>Telefon</th>
                  <th>Aktif paket</th>
                  <th>Kalan kredi</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const name = splitName(client.full_name)
                  return (
                    <tr key={client.id}>
                      <td>{name.firstName}</td>
                      <td>{name.lastName}</td>
                      <td>{client.phone || '—'}</td>
                      <td>{packageLabel(client)}</td>
                      <td>{client.credits_remaining}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-block">
        <h2>Paket tanımla</h2>
        <form className="admin-assign" onSubmit={submitPackage}>
          <label>
            Danışan
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
              <option value="">Seç</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name} · {client.phone || 'numarasız'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paket
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {PACKAGE_OPTIONS.map((option) => (
                <option key={option.kind} value={option.kind}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Başlangıç
            <input
              type="date"
              value={startsOn}
              min={todayIso()}
              onChange={(event) => setStartsOn(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="cta" disabled={busy || clients.length === 0}>
            {busy ? 'Kaydediliyor' : 'Paketi tanımla'}
          </button>
        </form>
      </section>

      <section className="admin-block">
        <h2>Ders geçmişi</h2>
        <p className="sheet-copy">
          Derse 24 saatten az kala Gelmedi işaretlenince kredi düşülür. Daha erken iptal krediyi iade eder.
        </p>
        {lessons.length === 0 ? (
          <p className="sheet-copy">Ders kaydı yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Danışan</th>
                  <th>Ders</th>
                  <th>Katılım</th>
                  <th>Kredi</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td>
                      {lesson.full_name}
                      <small className="admin-sub">{lesson.phone || '—'}</small>
                    </td>
                    <td>
                      {formatStudioWhen(lesson.starts_at)}
                      <small className="admin-sub">{SESSION_LABEL[lesson.session_type] || 'Ders'}</small>
                    </td>
                    <td>
                      <span className={`attendance attendance-${lesson.status}`}>{lesson.attendance}</span>
                    </td>
                    <td>{lesson.credit_state}</td>
                    <td>
                      {(lesson.can_attend || lesson.can_no_show || lesson.can_cancel) && (
                        <div className="attendance-actions">
                          {lesson.can_attend && (
                            <button type="button" onClick={() => updateAttendance(lesson, 'attended')} disabled={busy}>
                              Geldi
                            </button>
                          )}
                          {lesson.can_no_show && (
                            <button type="button" className="danger" onClick={() => updateAttendance(lesson, 'no_show')} disabled={busy}>
                              Gelmedi
                            </button>
                          )}
                          {lesson.can_cancel && (
                            <button type="button" onClick={() => updateAttendance(lesson, 'cancelled')} disabled={busy}>
                              İptal
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminGate

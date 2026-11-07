import { useEffect, useId, useRef, useState } from 'react'
import {
  adminLogin,
  adminMessage,
  assignPackage,
  fetchAdminClients,
  fetchAdminMemberDashboard,
  fetchDeletionRequests,
  openStudioWeek,
  fetchBookingInquiries,
  fetchLessonHistory,
  fetchLinkRequests,
  decideLinkRequest,
  markAttendance,
  fetchAdminTeachers,
  activateMemberPackage,
  extendMemberPackage,
  setPackageStart,
  setRemainingLessons,
  recordCashPayment,
  fetchCashReceipts,
} from './adminApi.js'
import { formatStudioDate, todayIso } from '../booking/slotRules.js'
import PerformancePool from './PerformancePool.jsx'
import TeachersPanel from './TeachersPanel.jsx'
import ShiftsPanel from './ShiftsPanel.jsx'
import TextsPanel from './TextsPanel.jsx'
import LedgerRest from './LedgerRest.jsx'

const PACKAGE_OPTIONS = [
  { kind: 'pack_8', label: "8'li Pilates Paketi", sessionType: 'group' },
  { kind: 'pack_12', label: "12'li Pilates Paketi", sessionType: 'group' },
  { kind: 'private_pack', label: 'Özel Ders Paketi (Private)', sessionType: 'private' },
]

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

function packageRows(client) {
  if (Array.isArray(client.packages) && client.packages.length > 0) return client.packages
  if (!client.active_package) return []
  return [{
    id: client.id,
    name: client.active_package,
    credits_remaining: client.credits_remaining,
    starts_on: client.package_starts_on,
    session_type: null,
  }]
}

function moneyLabel(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} TL`
}

function packageDetail(item) {
  const parts = [`${item.credits_remaining} kredi`]
  if (item.session_type === 'private') parts.push('özel ders, 2 kişilik')
  if (item.session_type === 'group') parts.push('grup dersi')
  if (item.starts_on && item.starts_on > todayIso()) parts.push(formatStudioDate(item.starts_on))
  return parts.join(' · ')
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
  const [inquiries, setInquiries] = useState([])
  const [linkRequests, setLinkRequests] = useState([])
  const [lessons, setLessons] = useState([])
  const [deletions, setDeletions] = useState([])
  const [detail, setDetail] = useState(null)
  const [memberId, setMemberId] = useState('')
  const [kind, setKind] = useState('pack_8')
  const [credits, setCredits] = useState('1')
  const [startsOn, setStartsOn] = useState(() => todayIso())
  const [deskTab, setDeskTab] = useState('ledger')
  const [teachers, setTeachers] = useState([])
  const [teacherFilter, setTeacherFilter] = useState('')
  const [extendDays, setExtendDays] = useState('30')
  const [packageStartsOn, setPackageStartsOn] = useState('')
  const [balanceMemberId, setBalanceMemberId] = useState('')
  const [balanceTeacherId, setBalanceTeacherId] = useState('')
  const [balanceCount, setBalanceCount] = useState('')
  const [cashMemberId, setCashMemberId] = useState('')
  const [cashTeacherId, setCashTeacherId] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashLessons, setCashLessons] = useState('0')
  const [cashDate, setCashDate] = useState(() => todayIso())
  const [cashNote, setCashNote] = useState('')
  const [receipts, setReceipts] = useState([])

  useEffect(() => {
    if (session) return undefined
    usernameRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, onClose])

  function showDetail(memberId, data) {
    const starts = data?.package?.starts_on
    setDetail(memberId ? { id: memberId, data } : null)
    setPackageStartsOn(starts ? String(starts).slice(0, 10) : '')
  }

  async function loadDesk(active) {
    const [nextClients, nextInquiries, nextLessons, nextLinks, nextDeletions, nextReceipts] = await Promise.all([
      fetchAdminClients(active.username, active.password),
      fetchBookingInquiries(active.username, active.password),
      fetchLessonHistory(active.username, active.password),
      fetchLinkRequests(active.username, active.password),
      fetchDeletionRequests(active.username, active.password),
      fetchCashReceipts(active.username, active.password),
    ])
    setClients(nextClients)
    setInquiries(nextInquiries)
    setLessons(nextLessons)
    setLinkRequests(nextLinks)
    setDeletions(nextDeletions)
    setReceipts(nextReceipts)
    try {
      setTeachers(await fetchAdminTeachers(active.username, active.password))
    } catch {
      setTeachers([])
    }
  }

  async function openClient(client) {
    if (!session) return
    setBusy(true)
    setError('')
    try {
      const next = await fetchAdminMemberDashboard(session.username, session.password, client.id)
      showDetail(client.id, next)
    } catch (detailError) {
      setError(adminMessage(detailError))
    } finally {
      setBusy(false)
    }
  }

  async function decideLink(request, decision) {
    if (!session) return
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await decideLinkRequest(session.username, session.password, request.id, decision)
      await loadDesk(session)
      setNotice(decision === 'approved' ? 'Telefon bağlandı.' : 'Bağlama isteği reddedildi.')
    } catch (decideError) {
      setError(adminMessage(decideError))
    } finally {
      setBusy(false)
    }
  }

  async function openWeek() {
    if (!session) return
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await openStudioWeek(session.username, session.password, 'both')
      setNotice(`${result.hours} saatte özel ders ve grup dersi birlikte açık.`)
    } catch (openError) {
      setError(adminMessage(openError))
    } finally {
      setBusy(false)
    }
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

    const option = PACKAGE_OPTIONS.find((item) => item.kind === kind)
    const creditCount = Number(credits)
    if (option?.sessionType === 'private' && (!Number.isInteger(creditCount) || creditCount < 1 || creditCount > 60)) {
      setError('Özel ders kredisi geçersiz')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await assignPackage(
        session.username,
        session.password,
        memberId,
        kind,
        startsOn,
        option?.sessionType === 'private' ? creditCount : null,
      )
      await loadDesk(session)
      const label = option?.label ?? 'Paket'
      const creditNote = option?.sessionType === 'private' ? ` ${creditCount} özel ders kredisi yazıldı.` : ''
      setNotice(`${label} tanımlandı.${creditNote}`)
    } catch (assignError) {
      setError(adminMessage(assignError))
    } finally {
      setBusy(false)
    }
  }

  function chooseBalanceMember(memberId) {
    setBalanceMemberId(memberId)
    const client = clients.find((item) => item.id === memberId)
    setBalanceCount(client ? String(client.credits_remaining ?? 0) : '')
  }

  async function submitBalance(event) {
    event.preventDefault()
    if (!session) return
    const count = Number(balanceCount)
    if (!balanceMemberId || !Number.isInteger(count) || count < 0 || count > 500) {
      setError('Kalan ders geçersiz')
      return
    }
    if (!balanceTeacherId) {
      setError('Öğretmen seç')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await setRemainingLessons(
        session.username,
        session.password,
        balanceMemberId,
        count,
        balanceTeacherId,
      )
      await loadDesk(session)
      const client = clients.find((item) => item.id === balanceMemberId)
      const teacher = teachers.find((item) => item.id === balanceTeacherId)
      setNotice(`${client?.full_name || 'Danışan'} için kalan ders ${result.credits_remaining} olarak kaydedildi. Öğretmen ${teacher?.full_name || 'seçildi'}.`)
    } catch (balanceError) {
      setError(adminMessage(balanceError))
    } finally {
      setBusy(false)
    }
  }

  async function submitCash(event) {
    event.preventDefault()
    if (!session) return
    const amount = Number(String(cashAmount).trim().replace(/\s/g, '').replace(',', '.'))
    const lessons = Number(cashLessons === '' ? 0 : cashLessons)
    if (!cashMemberId || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      setError('Tutar geçersiz')
      return
    }
    if (!Number.isInteger(lessons) || lessons < 0 || lessons > 500) {
      setError('Ders adedi geçersiz')
      return
    }
    if (!cashTeacherId) {
      setError('Öğretmen seç')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await recordCashPayment(
        session.username,
        session.password,
        cashMemberId,
        amount,
        lessons,
        cashDate,
        cashNote,
        cashTeacherId,
      )
      await loadDesk(session)
      setCashAmount('')
      setCashLessons('0')
      setCashNote('')
      const added = lessons > 0 ? ` ${lessons} ders eklendi.` : ''
      const teacher = teachers.find((item) => item.id === cashTeacherId)
      setNotice(`Nakit ${moneyLabel(result.amount)} kaydedildi.${added} Kalan ders ${result.credits_remaining}. Öğretmen ${teacher?.full_name || 'seçildi'}.`)
    } catch (cashError) {
      setError(adminMessage(cashError))
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

      <div className="admin-tabs" role="tablist" aria-label="Yönetim">
        <button
          type="button"
          role="tab"
          id="admin-tab-ledger"
          aria-selected={deskTab === 'ledger'}
          aria-controls="admin-panel-ledger"
          className={deskTab === 'ledger' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setDeskTab('ledger')}
        >
          Stüdyo defteri
        </button>
        <button
          type="button"
          role="tab"
          id="admin-tab-performance"
          aria-selected={deskTab === 'performance'}
          aria-controls="admin-panel-performance"
          className={deskTab === 'performance' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setDeskTab('performance')}
        >
          Antrenör Performans Havuzu
        </button>
        <button
          type="button"
          role="tab"
          id="admin-tab-teachers"
          aria-selected={deskTab === 'teachers'}
          aria-controls="admin-panel-teachers"
          className={deskTab === 'teachers' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setDeskTab('teachers')}
        >
          Öğretmenler
        </button>
        <button
          type="button"
          role="tab"
          id="admin-tab-shifts"
          aria-selected={deskTab === 'shifts'}
          aria-controls="admin-panel-shifts"
          className={deskTab === 'shifts' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setDeskTab('shifts')}
        >
          Mesai Tablosu
        </button>
        <button
          type="button"
          role="tab"
          id="admin-tab-texts"
          aria-selected={deskTab === 'texts'}
          aria-controls="admin-panel-texts"
          className={deskTab === 'texts' ? 'admin-tab is-active' : 'admin-tab'}
          onClick={() => setDeskTab('texts')}
        >
          Metinler
        </button>
      </div>

      {deskTab === 'teachers' && (
        <div id="admin-panel-teachers" role="tabpanel" aria-labelledby="admin-tab-teachers">
          <TeachersPanel session={session} onNotice={setNotice} />
        </div>
      )}
      {deskTab === 'shifts' && (
        <div id="admin-panel-shifts" role="tabpanel" aria-labelledby="admin-tab-shifts">
          <ShiftsPanel session={session} onNotice={setNotice} />
        </div>
      )}
      {deskTab === 'texts' && (
        <div id="admin-panel-texts" role="tabpanel" aria-labelledby="admin-tab-texts">
          <TextsPanel session={session} onNotice={setNotice} />
        </div>
      )}

      {deskTab === 'performance' && (
        <div id="admin-panel-performance" role="tabpanel" aria-labelledby="admin-tab-performance">
          <PerformancePool session={session} />
        </div>
      )}

      {deskTab === 'ledger' && (
      <div id="admin-panel-ledger" role="tabpanel" aria-labelledby="admin-tab-ledger">
      <section className="admin-block">
        <h2>Haftalık dersler</h2>
        <p className="sheet-copy">
          Bugünden itibaren bir haftalık her saatte özel ders (2 kişi) ve grup dersi (14 kişi) birlikte açılır.
        </p>
        <div className="sheet-actions">
          <button type="button" className="cta" disabled={busy} onClick={openWeek}>
            Özel ve grup dersini aç
          </button>
        </div>
      </section>

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
                  <th>Giriş</th>
                  <th>Aktif paket</th>
                  <th>Kalan kredi</th>
                  <th>Hesap</th>
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
                      <td>{client.sign_in_method || '—'}</td>
                      <td>
                        {packageRows(client).length === 0 ? packageLabel(client) : packageRows(client).map((item) => (
                          <span className="admin-package" key={item.id || `${item.name}-${item.starts_on}`}>
                            {item.name}
                            <small className="admin-sub">{packageDetail(item)}</small>
                          </span>
                        ))}
                      </td>
                      <td>{client.credits_remaining}</td>
                      <td>
                        <div className="attendance-actions">
                          <button type="button" onClick={() => openClient(client)} disabled={busy}>
                            Detay
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {detail?.data && (
          <div className="admin-detail">
            <h3>Hesap özeti</h3>
            <p>
              {(detail.data.profile?.first_name || '')} {(detail.data.profile?.last_name || '')}
              {' · '}
              {detail.data.profile?.email || '—'}
              {' · '}
              {detail.data.profile?.phone || detail.data.profile?.phone_masked || '—'}
              {' · '}
              {detail.data.profile?.sign_in_method || '—'}
            </p>
            <p>
              Paket: {detail.data.package?.status === 'active' ? detail.data.package?.name : 'Aktif paketin yok'}
              {' · '}
              {detail.data.package?.credits_remaining ?? 0} kredi
              {detail.data.package?.expires_on ? ` · Bitiş ${formatStudioDate(detail.data.package.expires_on)}` : ''}
            </p>
            <div className="sheet-actions">
              {detail.data.pending_package?.id && (
                <button
                  type="button"
                  className="cta"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    try {
                      await activateMemberPackage(session.username, session.password, detail.data.pending_package.id)
                      const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                      showDetail(detail.id, next)
                      await loadDesk(session)
                      setNotice('Ödeme alındı. Paket 30 gün için açıldı.')
                    } catch (payError) {
                      setError(adminMessage(payError))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Ödeme alındı
                </button>
              )}
              {detail.data.package?.status === 'active' && detail.data.package?.id && (
                <form
                  className="admin-start-form"
                  style={{ display: 'flex', flex: '1 1 100%', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}
                  onSubmit={async (event) => {
                  event.preventDefault()
                  if (!packageStartsOn) {
                    setError('Başlangıç tarihi geçersiz')
                    return
                  }
                  setBusy(true)
                  setError('')
                  setNotice('')
                  try {
                    await setPackageStart(
                      session.username,
                      session.password,
                      detail.data.package.id,
                      packageStartsOn,
                    )
                    const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                    showDetail(detail.id, next)
                    await loadDesk(session)
                    setNotice('Başlangıç tarihi kaydedildi.')
                  } catch (startError) {
                    setError(adminMessage(startError))
                  } finally {
                    setBusy(false)
                  }
                }}
                >
                  <label>
                    Gün
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={extendDays}
                      onChange={(event) => setExtendDays(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="cta ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      setError('')
                      try {
                        await extendMemberPackage(
                          session.username,
                          session.password,
                          detail.data.package.id,
                          Number(extendDays),
                        )
                        const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                        showDetail(detail.id, next)
                        setNotice('Paket süresi uzatıldı.')
                      } catch (extendError) {
                        setError(adminMessage(extendError))
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Süre uzat
                  </button>
                  <label className="admin-start-date" style={{ minWidth: '11.5rem', letterSpacing: '0.02em', textTransform: 'none' }}>
                    Start date
                    <input
                      type="date"
                      value={packageStartsOn}
                      onChange={(event) => setPackageStartsOn(event.target.value)}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="cta ghost admin-start-date"
                    style={{ flex: '0 0 auto', letterSpacing: '0.02em', textTransform: 'none' }}
                    disabled={busy}
                  >
                    Save start date
                  </button>
                </form>
              )}
            </div>
            <p>
              Katılım {detail.data.stats?.total_attended ?? 0}
              {' · bu ay '}
              {detail.data.stats?.this_month_attended ?? 0}
              {' · seri '}
              {detail.data.stats?.streak_weeks ?? 0}
            </p>
            <p>Yaklaşan: {(detail.data.upcoming ?? []).length}</p>
            <button type="button" className="text-button" onClick={() => showDetail(null, null)}>Kapat</button>
          </div>
        )}
      </section>

      <LedgerRest
        busy={busy}
        clients={clients}
        teachers={teachers}
        receipts={receipts}
        deletions={deletions}
        inquiries={inquiries}
        linkRequests={linkRequests}
        lessons={lessons}
        balanceMemberId={balanceMemberId}
        balanceTeacherId={balanceTeacherId}
        balanceCount={balanceCount}
        setBalanceCount={setBalanceCount}
        setBalanceTeacherId={setBalanceTeacherId}
        chooseBalanceMember={chooseBalanceMember}
        submitBalance={submitBalance}
        cashMemberId={cashMemberId}
        cashTeacherId={cashTeacherId}
        cashAmount={cashAmount}
        cashLessons={cashLessons}
        cashDate={cashDate}
        cashNote={cashNote}
        setCashMemberId={setCashMemberId}
        setCashTeacherId={setCashTeacherId}
        setCashAmount={setCashAmount}
        setCashLessons={setCashLessons}
        setCashDate={setCashDate}
        setCashNote={setCashNote}
        submitCash={submitCash}
        decideLink={decideLink}
        updateAttendance={updateAttendance}
        memberId={memberId}
        setMemberId={setMemberId}
        kind={kind}
        setKind={setKind}
        credits={credits}
        setCredits={setCredits}
        startsOn={startsOn}
        setStartsOn={setStartsOn}
        submitPackage={submitPackage}
        teacherFilter={teacherFilter}
        setTeacherFilter={setTeacherFilter}
      />

      </div>
      )}
    </div>
  )
}

export default AdminGate

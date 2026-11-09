import { useEffect, useId, useRef, useState } from 'react'
import {
  adminLogin,
  adminMessage,
  assignPackage,
  fetchAdminClients,
  fetchAdminMemberDashboard,
  fetchDeletionRequests,
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
  addExistingClient,
} from './adminApi.js'
import { addIsoDays, formatStudioDate, todayIso } from '../booking/slotRules.js'
import PerformancePool from './PerformancePool.jsx'
import TeachersPanel from './TeachersPanel.jsx'
import ShiftsPanel from './ShiftsPanel.jsx'
import TextsPanel from './TextsPanel.jsx'
import LedgerRest from './LedgerRest.jsx'
import './ledger-filters.css'

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

function storedExpiry(item) {
  const value = item?.expires_on ? String(item.expires_on).slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function lessonExpiryIso(startsOn) {
  const value = startsOn ? String(startsOn).slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  return addIsoDays(value, 30)
}

function expiryLabel(startsOn) {
  const expiry = lessonExpiryIso(startsOn)
  return expiry ? `Bitiş ${formatStudioDate(expiry)}` : ''
}

function resolvedExpiry(item) {
  return storedExpiry(item) || lessonExpiryIso(item?.starts_on)
}

function isOpenLesson(item) {
  const expiry = resolvedExpiry(item)
  return Boolean(expiry) && expiry >= todayIso()
}

function packageDetail(item) {
  const parts = [`${item.credits_remaining} kredi`]
  if (item.session_type === 'private') parts.push('özel ders, 2 kişilik')
  if (item.session_type === 'group') parts.push('grup dersi')
  if (item.starts_on && item.starts_on > todayIso()) parts.push(formatStudioDate(item.starts_on))
  const expiry = resolvedExpiry(item)
  if (expiry) parts.push(`Bitiş ${formatStudioDate(expiry)}`)
  return parts.join(' · ')
}

function LessonGroup({ title, items }) {
  const credits = items.reduce((sum, item) => sum + Number(item.credits_remaining || 0), 0)
  return (
    <div className="admin-lesson-group">
      <p className="admin-lesson-heading">
        {title}
        <small>{credits} kredi</small>
      </p>
      {items.length === 0 ? (
        <span className="admin-sub">Yok</span>
      ) : items.map((item) => (
        <span className="admin-package" key={item.id || `${item.name}-${item.starts_on}`}>
          {item.name}
          <small className="admin-sub">{packageDetail(item)}</small>
        </span>
      ))}
    </div>
  )
}

function LessonGroups({ packages }) {
  const open = []
  const ended = []
  for (const item of packages || []) {
    if (isOpenLesson(item)) open.push(item)
    else ended.push(item)
  }
  return (
    <div className="admin-lesson-groups">
      <LessonGroup title="Yeni dersler" items={open} />
      <LessonGroup title="Biten dersler" items={ended} />
    </div>
  )
}

const LEDGER_VIEWS = [
  { id: 'nakit', label: 'Nakit Giriş' },
  { id: 'aktif', label: 'Aktif Ders Alanlar' },
  { id: 'pasif', label: 'Pasif müşteriler' },
  { id: 'kart', label: 'Kartla Ödeme Yapan Üyeler' },
  { id: 'harici', label: 'Harici Kartla ödeme yapanlar' },
]

function paymentVisible(client) {
  return Boolean(client.has_cash || client.has_site_card || client.has_external_card)
}

function inLedgerView(client, view) {
  const credits = Number(client.credits_remaining) || 0
  if (view === 'nakit') return Boolean(client.has_cash)
  if (view === 'aktif') return credits > 0
  if (view === 'pasif') return credits === 0 || !paymentVisible(client)
  if (view === 'kart') return Boolean(client.has_site_card)
  if (view === 'harici') return Boolean(client.has_external_card)
  return false
}

function summaryPackages(data) {
  if (Array.isArray(data?.packages) && data.packages.length > 0) return data.packages
  if (data?.package?.name) return [data.package]
  return []
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
  const [ledgerView, setLedgerView] = useState('aktif')
  const [teachers, setTeachers] = useState([])
  const [teacherFilter, setTeacherFilter] = useState('')
  const [extendDays, setExtendDays] = useState('30')
  const [packageStartsOn, setPackageStartsOn] = useState('')
  const [balanceMemberId, setBalanceMemberId] = useState('')
  const [balanceTeacherId, setBalanceTeacherId] = useState('')
  const [balanceCount, setBalanceCount] = useState('')
  const [balanceStartsOn, setBalanceStartsOn] = useState('')
  const [cashMemberId, setCashMemberId] = useState('')
  const [cashTeacherId, setCashTeacherId] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashLessons, setCashLessons] = useState('0')
  const [cashDate, setCashDate] = useState(() => todayIso())
  const [cashNote, setCashNote] = useState('')
  const [cashSession, setCashSession] = useState('group')
  const [receipts, setReceipts] = useState([])
  const [existingFirst, setExistingFirst] = useState('')
  const [existingLast, setExistingLast] = useState('')
  const [existingPhone, setExistingPhone] = useState('')
  const [existingTeacherId, setExistingTeacherId] = useState('')
  const [existingCount, setExistingCount] = useState('')
  const [existingStartsOn, setExistingStartsOn] = useState(() => todayIso())
  const [existingAmount, setExistingAmount] = useState('')
  const [existingPaidOn, setExistingPaidOn] = useState(() => todayIso())
  const [existingNote, setExistingNote] = useState('')

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

  async function submitExisting(event) {
    event.preventDefault()
    if (!session) return
    const count = Number(existingCount)
    const amountText = String(existingAmount).trim().replace(/\s/g, '').replace(',', '.')
    const amount = amountText === '' ? null : Number(amountText)
    if (!Number.isInteger(count) || count < 0 || count > 500) {
      setError('Kalan ders geçersiz')
      return
    }
    if (count > 0 && !lessonExpiryIso(existingStartsOn)) {
      setError('Başlangıç tarihi geçersiz')
      return
    }
    if ((count > 0 || amount !== null) && !existingTeacherId) {
      setError('Öğretmen seç')
      return
    }
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000)) {
      setError('Tutar geçersiz')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await addExistingClient(
        session.username,
        session.password,
        existingFirst,
        existingLast,
        existingPhone,
        count,
        existingTeacherId,
        count > 0 ? existingStartsOn : null,
        amount,
        amount === null ? null : existingPaidOn,
        existingNote,
      )
      await loadDesk(session)
      setExistingFirst('')
      setExistingLast('')
      setExistingPhone('')
      setExistingCount('')
      setExistingAmount('')
      setExistingNote('')
      const expiry = result.expires_on ? ` Bitiş ${formatStudioDate(result.expires_on)}.` : ''
      const paid = result.amount ? ` Nakit ${moneyLabel(result.amount)} kaydedildi.` : ''
      setNotice(`${result.full_name} eklendi. Kalan ders ${result.credits_remaining}.${expiry}${paid}`)
    } catch (existingError) {
      setError(adminMessage(existingError))
    } finally {
      setBusy(false)
    }
  }

  function chooseBalanceMember(memberId) {
    setBalanceMemberId(memberId)
    const client = clients.find((item) => item.id === memberId)
    setBalanceCount(client ? String(client.credits_remaining ?? 0) : '')
    const packs = client ? packageRows(client) : []
    const manual = packs.find((item) => item.name === 'Elle giriş') || packs[0]
    const start = manual?.starts_on || client?.package_starts_on || (memberId ? todayIso() : '')
    setBalanceStartsOn(start ? String(start).slice(0, 10) : '')
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
    if (!lessonExpiryIso(balanceStartsOn)) {
      setError('Başlangıç tarihi geçersiz')
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
        balanceStartsOn,
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
    if (cashSession !== 'group' && cashSession !== 'private') {
      setError('Grup veya özel ders seç')
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
        cashSession,
      )
      await loadDesk(session)
      setCashAmount('')
      setCashLessons('0')
      setCashNote('')
      const added = lessons > 0 ? ` ${lessons} ${cashSession === 'private' ? 'özel' : 'grup'} ders eklendi.` : ''
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
        <button type="button" role="tab" id="admin-tab-ledger" aria-selected={deskTab === 'ledger'} aria-controls="admin-panel-ledger" className={deskTab === 'ledger' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setDeskTab('ledger')}>Stüdyo defteri</button>
        <button type="button" role="tab" id="admin-tab-performance" aria-selected={deskTab === 'performance'} aria-controls="admin-panel-performance" className={deskTab === 'performance' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setDeskTab('performance')}>Antrenör Performans Havuzu</button>
        <button type="button" role="tab" id="admin-tab-teachers" aria-selected={deskTab === 'teachers'} aria-controls="admin-panel-teachers" className={deskTab === 'teachers' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setDeskTab('teachers')}>Öğretmenler</button>
        <button type="button" role="tab" id="admin-tab-shifts" aria-selected={deskTab === 'shifts'} aria-controls="admin-panel-shifts" className={deskTab === 'shifts' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setDeskTab('shifts')}>Mesai Tablosu</button>
        <button type="button" role="tab" id="admin-tab-texts" aria-selected={deskTab === 'texts'} aria-controls="admin-panel-texts" className={deskTab === 'texts' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setDeskTab('texts')}>Metinler</button>
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
        <h2>Danışanlar</h2>
        <div className="ledger-filters" role="tablist" aria-label="Danışan grupları">
          {LEDGER_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={ledgerView === view.id}
              className={ledgerView === view.id ? 'admin-tab is-active' : 'admin-tab'}
              onClick={() => setLedgerView(view.id)}
            >
              {view.label}
              <span className="ledger-count">{clients.filter((client) => inLedgerView(client, view.id)).length}</span>
            </button>
          ))}
        </div>
        <p className="sheet-copy">
          {ledgerView === 'nakit' && 'Nakit giriş ekranı ve nakit kaydı olan öğrenciler. İsim arayıp kaydı olan öğrenciye yeni tahsilat eklenir.'}
          {ledgerView === 'aktif' && 'Ders sayısı girilmiş danışanlar.'}
          {ledgerView === 'pasif' && 'Ders sayısı 0 olanlar ve ödemesi görünmeyenler. Önceden kayıt alıp ödeme yapmayanlar burada durur.'}
          {ledgerView === 'kart' && 'Yalnızca siteden kendi girişi ile kartla ödeyen üyeler.'}
          {ledgerView === 'harici' && 'Kartla ödeyip sitede kendi hesabıyla giriş yapmamış olanlar.'}
        </p>
        {ledgerView !== 'nakit' && (clients.filter((client) => inLedgerView(client, ledgerView)).length === 0 ? (
          <p className="sheet-copy">Bu bölümde danışan yok.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Adı</th>
                  <th>Soyadı</th>
                  <th>Telefon</th>
                  <th>Giriş</th>
                  <th>Dersler</th>
                  <th>Kalan kredi</th>
                  <th>Hesap</th>
                </tr>
              </thead>
              <tbody>
                {clients.filter((client) => inLedgerView(client, ledgerView)).map((client) => {
                  const name = splitName(client.full_name)
                  return (
                    <tr key={client.id}>
                      <td>{name.firstName}</td>
                      <td>{name.lastName}</td>
                      <td>{client.phone || '—'}</td>
                      <td>{client.sign_in_method || '—'}</td>
                      <td>
                        {packageRows(client).length === 0 ? packageLabel(client) : (
                          <LessonGroups packages={packageRows(client)} />
                        )}
                      </td>
                      <td>{client.credits_remaining}</td>
                      <td>
                        <div className="attendance-actions">
                          <button type="button" onClick={() => openClient(client)} disabled={busy}>Detay</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
        {ledgerView !== 'nakit' && detail?.data && (
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
            <LessonGroups packages={summaryPackages(detail.data)} />
            <div className="sheet-actions">
              {detail.data.pending_package?.id && (
                <button type="button" className="cta" disabled={busy} onClick={async () => {
                    setBusy(true)
                    setError('')
                    try {
                      await activateMemberPackage(session.username, session.password, detail.data.pending_package.id)
                      const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                      showDetail(detail.id, next)
                      await loadDesk(session)
                      setNotice('Ödeme alındı. Paket başlangıç tarihinden itibaren 30 gün açık.')
                    } catch (payError) {
                      setError(adminMessage(payError))
                    } finally {
                      setBusy(false)
                    }
                  }}>Ödeme alındı</button>
              )}
              {detail.data.package?.status === 'active' && detail.data.package?.id && (
                <form className="admin-start-form" style={{ display: 'flex', flex: '1 1 100%', flexWrap: 'wrap', gap: 10, alignItems: 'end' }} onSubmit={async (event) => {
                  event.preventDefault()
                  if (!packageStartsOn) {
                    setError('Başlangıç tarihi geçersiz')
                    return
                  }
                  setBusy(true)
                  setError('')
                  setNotice('')
                  try {
                    await setPackageStart(session.username, session.password, detail.data.package.id, packageStartsOn)
                    const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                    showDetail(detail.id, next)
                    await loadDesk(session)
                    setNotice('Başlangıç tarihi kaydedildi.')
                  } catch (startError) {
                    setError(adminMessage(startError))
                  } finally {
                    setBusy(false)
                  }
                }}>
                  <label>
                    Gün
                    <input type="number" min={1} max={365} value={extendDays} onChange={(event) => setExtendDays(event.target.value)} />
                  </label>
                  <button type="button" className="cta ghost" disabled={busy} onClick={async () => {
                      setBusy(true)
                      setError('')
                      try {
                        await extendMemberPackage(session.username, session.password, detail.data.package.id, Number(extendDays))
                        const next = await fetchAdminMemberDashboard(session.username, session.password, detail.id)
                        showDetail(detail.id, next)
                        setNotice('Paket süresi uzatıldı.')
                      } catch (extendError) {
                        setError(adminMessage(extendError))
                      } finally {
                        setBusy(false)
                      }
                    }}>Süre uzat</button>
                  <label className="admin-start-date" style={{ minWidth: '11.5rem', letterSpacing: '0.02em', textTransform: 'none' }}>
                    Start date
                    <input type="date" value={packageStartsOn} onChange={(event) => setPackageStartsOn(event.target.value)} required />
                  </label>
                  {expiryLabel(packageStartsOn) && (
                    <p className="admin-expiry" style={{ flex: '1 1 12rem', margin: 0 }}>
                      {expiryLabel(packageStartsOn)}
                    </p>
                  )}
                  <button type="submit" className="cta ghost admin-start-date" style={{ flex: '0 0 auto', letterSpacing: '0.02em', textTransform: 'none' }} disabled={busy}>Save start date</button>
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
        balanceStartsOn={balanceStartsOn}
        balanceExpiryLabel={expiryLabel(balanceStartsOn)}
        setBalanceCount={setBalanceCount}
        setBalanceStartsOn={setBalanceStartsOn}
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
        cashSession={cashSession}
        setCashSession={setCashSession}
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
        existingFirst={existingFirst}
        existingLast={existingLast}
        existingPhone={existingPhone}
        existingTeacherId={existingTeacherId}
        existingCount={existingCount}
        existingStartsOn={existingStartsOn}
        existingAmount={existingAmount}
        existingPaidOn={existingPaidOn}
        existingNote={existingNote}
        existingExpiryLabel={Number(existingCount) > 0 ? expiryLabel(existingStartsOn) : ''}
        setExistingFirst={setExistingFirst}
        setExistingLast={setExistingLast}
        setExistingPhone={setExistingPhone}
        setExistingTeacherId={setExistingTeacherId}
        setExistingCount={setExistingCount}
        setExistingStartsOn={setExistingStartsOn}
        setExistingAmount={setExistingAmount}
        setExistingPaidOn={setExistingPaidOn}
        setExistingNote={setExistingNote}
        submitExisting={submitExisting}
        ledgerView={ledgerView}
      />

      </div>
      )}
    </div>
  )
}

export default AdminGate

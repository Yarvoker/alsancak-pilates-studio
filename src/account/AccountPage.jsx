import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelReservation, messageOf } from '../booking/bookingApi.js'
import {
  fetchMemberExport,
  fetchMemberHistory,
  contactAlreadyStored,
  notifyMemberChanged,
  requestAccountDeletion,
  updateMemberProfile,
} from '../booking/dashboardApi.js'
import EmailOtpCard from '../booking/EmailOtpCard.jsx'
import { maskTrMobile, normalizeTrMobile } from '../booking/phone.js'
import { validPersonName } from '../booking/sheetFlow.js'
import { formatStudioDate, istanbulDateTime } from '../booking/slotRules.js'
import { supabase } from '../booking/supabaseClient.js'
import { useMemberDashboard } from '../booking/useMemberDashboard.js'
import './AccountPage.css'

const TYPE_LABEL = {
  group: 'Grup',
  private: 'Özel',
  trial: 'Deneme',
}

const SESSION_LABEL = {
  group: 'Grup',
  private: 'Özel',
}

const ATTENDANCE_LABEL = {
  attended: 'Katıldı',
  auto_attended: 'Otomatik katıldı sayıldı',
  cancelled_refunded: 'İptal edildi · kredi iade',
  late_cancel: 'Geç iptal · kredi düştü',
  no_show: 'Gelmedi',
}

const ATTENDED = new Set(['attended', 'auto_attended'])
const CANCELLED = new Set(['cancelled_refunded', 'late_cancel'])

function formatLongDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatStudioDate(String(value))
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDeadline(value) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatLesson(startsAt) {
  const parts = istanbulDateTime(startsAt)
  return `${formatStudioDate(parts.date)} · ${parts.time}`
}

function monthKey(startsAt) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date(startsAt)).slice(0, 7)
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

function creditText(effect) {
  const value = Number(effect)
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

function AccountSkeleton() {
  return (
    <div className="account-skeleton" aria-busy="true" aria-label="Yükleniyor">
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

function AccountPage({ user, onUser }) {
  const navigate = useNavigate()
  const { data, status, reload } = useMemberDashboard(user)
  const [filter, setFilter] = useState('all')
  const [month, setMonth] = useState('')
  const [extra, setExtra] = useState([])
  const [exhausted, setExhausted] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [signBusy, setSignBusy] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [changingPhone, setChangingPhone] = useState(false)
  const [formError, setFormError] = useState('')
  const [formNotice, setFormNotice] = useState('')
  const dirty = useRef(false)

  useEffect(() => {
    const previousTitle = document.title
    let meta = document.querySelector('meta[name="robots"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      document.head.appendChild(meta)
    }
    const previousRobots = created ? null : meta.getAttribute('content')
    document.title = 'Hesabım · Alsancak Pilates Studio'
    meta.setAttribute('content', 'noindex')
    return () => {
      document.title = previousTitle
      if (created) meta.remove()
      else if (previousRobots == null) meta.removeAttribute('content')
      else meta.setAttribute('content', previousRobots)
    }
  }, [])

  useEffect(() => {
    if (!user || data?.profile_complete !== true) return undefined
    let pending = null
    try {
      pending = JSON.parse(sessionStorage.getItem('pending_slot') || 'null')
    } catch {
      pending = null
    }
    if (!pending?.slot_id) return undefined
    navigate({ pathname: '/', hash: '#iletisim' })
    return undefined
  }, [user, data?.profile_complete, navigate])

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        onUser?.(null)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        onUser?.(session?.user ?? null)
        reload()
      }
    })
    return () => subscription.subscription.unsubscribe()
  }, [onUser, reload])

  useEffect(() => {
    if (!data?.profile || dirty.current) return
    setFirstName(data.profile.first_name || '')
    setLastName(data.profile.last_name || '')
  }, [data])

  useEffect(() => {
    setExtra([])
    setExhausted((data?.history?.length ?? 0) < 50)
  }, [data])

  const history = useMemo(() => {
    const seen = new Set()
    return [...(data?.history ?? []), ...extra].filter((row) => {
      if (!row?.reservation_id || seen.has(row.reservation_id)) return false
      seen.add(row.reservation_id)
      return true
    })
  }, [data, extra])

  const months = useMemo(() => {
    const keys = new Set(history.map((row) => monthKey(row.starts_at)))
    return [...keys].sort().reverse()
  }, [history])

  const visibleHistory = history.filter((row) => {
    if (filter === 'attended' && !ATTENDED.has(row.attendance)) return false
    if (filter === 'cancelled' && !CANCELLED.has(row.attendance)) return false
    if (month && monthKey(row.starts_at) !== month) return false
    return true
  })

  function chooseLesson() {
    navigate({ pathname: '/', hash: '#iletisim' })
  }

  async function signOut() {
    setSignBusy(true)
    await supabase.auth.signOut()
    onUser?.(null)
    navigate('/')
  }

  async function confirmCancel() {
    if (!cancelTarget?.can_cancel) return
    setCancelBusy(true)
    setFormError('')
    try {
      await cancelReservation(cancelTarget.reservation_id)
      setCancelTarget(null)
      notifyMemberChanged()
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setCancelBusy(false)
    }
  }

  async function loadMore() {
    const oldest = history[history.length - 1]
    if (!oldest || moreBusy) return
    setMoreBusy(true)
    setFormError('')
    try {
      const rows = await fetchMemberHistory(oldest.starts_at, 50)
      const list = Array.isArray(rows) ? rows : []
      setExtra((current) => [...current, ...list])
      if (list.length < 50) setExhausted(true)
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setMoreBusy(false)
    }
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!validPersonName(firstName) || !validPersonName(lastName)) {
      setFormError('İsim ve soyisim gerekli')
      setFormNotice('')
      return
    }
    const phoneStored = contactAlreadyStored(data?.profile, user?.email).phoneStored
    const editingPhone = !phoneStored || changingPhone
    const phone = editingPhone ? normalizeTrMobile(phoneInput) : ''
    if (editingPhone && !phone) {
      setFormError('Geçerli bir cep telefonu gir (05xx xxx xx xx)')
      setFormNotice('')
      return
    }

    setSaveBusy(true)
    setFormError('')
    setFormNotice('')
    try {
      await updateMemberProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
      })
      dirty.current = false
      notifyMemberChanged()
      setPhoneInput('')
      setChangingPhone(false)
      setFormNotice('Profilin güncellendi.')
    } catch (error) {
      const text = messageOf(error)
      setFormError(text === 'Telefon numarası geçersiz'
        ? 'Geçerli bir cep telefonu gir (05xx xxx xx xx)'
        : text)
    } finally {
      setSaveBusy(false)
    }
  }

  async function downloadData() {
    setExportBusy(true)
    setFormError('')
    try {
      const payload = await fetchMemberExport()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'alsancak-verilerim.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setExportBusy(false)
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true)
    setFormError('')
    try {
      await requestAccountDeletion()
      setDeleteOpen(false)
      setFormNotice('Silme talebin stüdyoya iletildi. Hesabın hemen silinmez.')
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  const profile = data?.profile
  const profileComplete = data?.profile_complete === true
  const storedContact = contactAlreadyStored(profile, user?.email)
  const profileFilled = storedContact.complete
  const phoneStored = storedContact.phoneStored
  const editingPhone = !phoneStored || changingPhone
  const pack = data?.package
  const activePackage = pack?.status === 'active'
  const remaining = pack?.credits_remaining ?? 0
  const total = pack?.credits_total ?? 0
  const progress = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0
  const greetingName = String(profile?.first_name || '').trim()

  return (
    <div className="account-page">
      {!user && <EmailOtpCard visible scrollOnLink={false} onUser={onUser} />}

      {user && data && !profileComplete && (
        <EmailOtpCard
          visible={false}
          showProfile
          profile={profile}
          authUser={user}
          onUser={onUser}
          onProfileDone={() => {
            notifyMemberChanged()
            let pending = null
            try {
              pending = JSON.parse(sessionStorage.getItem('pending_slot') || 'null')
            } catch {
              pending = null
            }
            if (pending?.slot_id) {
              navigate({ pathname: '/', hash: '#iletisim' })
              return
            }
            reload()
          }}
        />
      )}

      {user && status === 'loading' && !data && <AccountSkeleton />}

      {user && status === 'error' && !data && (
        <div className="account-card" role="alert">
          <h1>Hesabım</h1>
          <p>Bilgiler yüklenemedi, tekrar dene</p>
          <button type="button" className="account-button" onClick={reload}>Tekrar dene</button>
        </div>
      )}

      {user && data && profileComplete && (
        <>
          <header className="account-hero">
            <div>
              <p className="eyebrow">HESABIM</p>
              <h1>{greetingName ? `Merhaba, ${greetingName}` : 'Merhaba'}</h1>
              {profile?.member_since && (
                <p className="account-lead">Üyelik başlangıcı {formatLongDate(profile.member_since)}</p>
              )}
            </div>
            <button
              type="button"
              className="account-button account-button--quiet"
              onClick={signOut}
              disabled={signBusy}
              aria-busy={signBusy}
            >
              Çıkış yap
            </button>
          </header>

          <section className="account-card" aria-labelledby="package-title">
            <div className="account-card-head">
              <h2 id="package-title">Paket</h2>
              {activePackage && pack.type && (
                <span className="account-badge">{TYPE_LABEL[pack.type] || pack.type}</span>
              )}
            </div>
            {activePackage ? (
              <>
                {pack.name && <p className="account-package-name">{pack.name}</p>}
                <p className="account-credits">{remaining} / {total} ders kaldı</p>
                <div
                  className="account-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={remaining}
                  aria-label="Kalan ders"
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                {pack.expires_on && (
                  <p className="account-meta">
                    Paket bitiş: {formatLongDate(pack.expires_on)} · Kalan {remaining} ders
                  </p>
                )}
                {pack.days_left != null && pack.days_left <= 5 && pack.days_left >= 0 && (
                  <p className="booking-error" role="status">
                    Paketin bitmesine {pack.days_left} gün kaldı. Kullanılmayan dersler süre sonunda yanar.
                  </p>
                )}
              </>
            ) : (
              <p className="account-credits account-credits--empty">
                {pack?.status === 'pending' ? 'Paket talebin alındı. Ödeme onaylanınca ders hakkın açılır.' : 'Aktif paketin yok'}
              </p>
            )}
          </section>

          <section className="account-card" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title">Yaklaşan dersler</h2>
            {(data.upcoming ?? []).length === 0 ? (
              <div className="account-empty">
                <p>Yaklaşan dersin yok</p>
                <button type="button" className="account-button" onClick={chooseLesson}>Ders seç</button>
              </div>
            ) : (
              <ul className="account-list">
                {data.upcoming.map((item) => (
                  <li key={item.reservation_id} className="account-row">
                    <div>
                      <strong>{formatLesson(item.starts_at)}</strong>
                      <small>{SESSION_LABEL[item.session_type] || 'Ders'}</small>
                      <small>Ücretsiz iptal için son: {formatDeadline(item.cancel_deadline)}</small>
                    </div>
                    {item.can_cancel ? (
                      <button
                        type="button"
                        className="account-button"
                        onClick={() => setCancelTarget(item)}
                      >
                        İptal et
                      </button>
                    ) : (
                      <div className="account-lock">
                        <button type="button" className="account-button cancel-locked" disabled>
                          İptal et
                        </button>
                        <small>İptal süresi geçti — ders hakkın kullanıldı</small>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="account-card" aria-labelledby="history-title">
            <h2 id="history-title">Geçmiş</h2>
            <div className="account-filters">
              {[
                ['all', 'Tümü'],
                ['attended', 'Katıldıklarım'],
                ['cancelled', 'İptaller'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filter === key ? 'account-chip active' : 'account-chip'}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
              <label className="account-month">
                Ay
                <select value={month} onChange={(event) => setMonth(event.target.value)}>
                  <option value="">Tümü</option>
                  {months.map((key) => (
                    <option key={key} value={key}>{monthLabel(key)}</option>
                  ))}
                </select>
              </label>
            </div>
            {visibleHistory.length === 0 ? (
              <p className="account-meta">Bu filtrede ders yok.</p>
            ) : (
              <ul className="account-list">
                {visibleHistory.map((item) => (
                  <li key={item.reservation_id} className="account-row">
                    <div>
                      <strong>{formatLesson(item.starts_at)}</strong>
                      <small>{SESSION_LABEL[item.session_type] || 'Ders'}</small>
                    </div>
                    <div className="account-row-meta">
                      <span className="account-badge account-badge--text">
                        {ATTENDANCE_LABEL[item.attendance] || item.attendance}
                      </span>
                      <span className="account-credit">{creditText(item.credit_effect)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!exhausted && (
              <button
                type="button"
                className="account-button"
                onClick={loadMore}
                disabled={moreBusy}
                aria-busy={moreBusy}
              >
                {moreBusy ? 'Yükleniyor' : 'Daha fazla göster'}
              </button>
            )}
          </section>

          <section className="account-card" aria-labelledby="stats-title">
            <h2 id="stats-title">Özet</h2>
            <div className="account-stats">
              <article>
                <strong>{data.stats?.total_attended ?? 0}</strong>
                <span>Toplam katılım</span>
              </article>
              <article>
                <strong>{data.stats?.this_month_attended ?? 0}</strong>
                <span>Bu ay</span>
              </article>
              <article>
                <strong>{data.stats?.streak_weeks ?? 0}</strong>
                <span>Hafta serisi</span>
              </article>
            </div>
          </section>

          <section className="account-card" aria-labelledby="profile-title">
            <h2 id="profile-title">Profil</h2>
            <form onSubmit={saveProfile}>
              {!profileFilled && (
                <div className="account-fields">
                  <label>
                    İsim
                    <input
                      name="given-name"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => {
                        dirty.current = true
                        setFirstName(event.target.value)
                      }}
                      required
                    />
                  </label>
                  <label>
                    Soyisim
                    <input
                      name="family-name"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => {
                        dirty.current = true
                        setLastName(event.target.value)
                      }}
                      required
                    />
                  </label>
                </div>
              )}
              <label>
                E-posta
                <input value={profile?.email || user.email || ''} readOnly />
              </label>
              {editingPhone ? (
                <label>
                  Telefon
                  <input
                    type="tel"
                    name="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="05xx xxx xx xx"
                    value={phoneInput}
                    onChange={(event) => {
                      dirty.current = true
                      setPhoneInput(maskTrMobile(event.target.value))
                    }}
                    required
                  />
                </label>
              ) : (
                <label>
                  Telefon
                  <input value={profile.phone_masked} readOnly />
                </label>
              )}
              {phoneStored && !changingPhone && (
                <div className="account-actions">
                  <button
                    type="button"
                    className="account-button account-button--quiet"
                    onClick={() => {
                      setChangingPhone(true)
                      setPhoneInput('')
                      setFormError('')
                      setFormNotice('')
                    }}
                  >
                    Numarayı değiştir
                  </button>
                </div>
              )}
              {(editingPhone || !profileFilled) && (
                <div className="account-actions">
                  <button type="submit" className="account-button" disabled={saveBusy} aria-busy={saveBusy}>
                    {saveBusy ? 'Kaydediliyor' : 'Kaydet'}
                  </button>
                  {changingPhone && (
                    <button
                      type="button"
                      className="account-button account-button--quiet"
                      onClick={() => {
                        setChangingPhone(false)
                        setPhoneInput('')
                        setFormError('')
                      }}
                      disabled={saveBusy}
                    >
                      Vazgeç
                    </button>
                  )}
                </div>
              )}
            </form>
          </section>

          <section className="account-card" aria-labelledby="kvkk-title">
            <h2 id="kvkk-title">KVKK</h2>
            <p className="account-meta">Verilerin sana aittir. Silme talebi stüdyoya gider; hesap hemen silinmez.</p>
            <div className="account-actions">
              <button
                type="button"
                className="account-button"
                onClick={downloadData}
                disabled={exportBusy}
                aria-busy={exportBusy}
              >
                Verilerimi indir
              </button>
              <button type="button" className="account-button account-button--quiet" onClick={() => setDeleteOpen(true)}>
                Hesabımı silme talebi
              </button>
            </div>
          </section>
        </>
      )}

      {(formNotice || formError) && (
        <div className="account-feedback">
          {formNotice && <p className="booking-note" role="status">{formNotice}</p>}
          {formError && <p className="booking-error" role="alert">{formError}</p>}
        </div>
      )}

      {cancelTarget && (
        <div className="account-modal-backdrop" onMouseDown={() => { if (!cancelBusy) setCancelTarget(null) }}>
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="cancel-title">Dersi iptal et</h2>
            <p>Derse 24 saatten fazla var, ders kredin iade edilecek.</p>
            <div className="account-actions">
              <button type="button" className="account-button" onClick={confirmCancel} disabled={cancelBusy} aria-busy={cancelBusy}>
                İptal et
              </button>
              <button type="button" className="account-button account-button--quiet" onClick={() => setCancelTarget(null)} disabled={cancelBusy}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="account-modal-backdrop" onMouseDown={() => { if (!deleteBusy) setDeleteOpen(false) }}>
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-title">Hesabımı silme talebi</h2>
            <p>Talebin stüdyoya iletilecek. Hesabın hemen silinmez.</p>
            <div className="account-actions">
              <button type="button" className="account-button" onClick={confirmDelete} disabled={deleteBusy} aria-busy={deleteBusy}>
                Talebi gönder
              </button>
              <button type="button" className="account-button account-button--quiet" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountPage

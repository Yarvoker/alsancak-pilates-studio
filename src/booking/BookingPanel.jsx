import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bookSession,
  claimMemberPhone,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
  recordBookingInquiry,
  registerMember,
  registerTrialLesson,
} from './bookingApi.js'
import { notifyMemberChanged } from './dashboardApi.js'
import EmailOtpCard from './EmailOtpCard.jsx'
import MemberSummary from './MemberSummary.jsx'
import { normalizePhone } from './phone.js'
import {
  PACKAGE_OPTIONS,
  creditsOnDate,
  futureCreditPackage,
  occupancyLabel,
  packageLead,
  packageOption,
  packageSessionType,
  saveCheckout,
  sheetFor,
  validPersonName,
} from './sheetFlow.js'
import {
  formatStudioDate,
  formatStudioWhen,
  istanbulDateTime,
  isPastSlot,
  isSlotFull,
  openingMinutes,
  slotStarts,
  studioDatesForWeek,
} from './slotRules.js'

const initialClock = Date.now()

try {
  sessionStorage.removeItem('alsancak-booking-phone')
} catch {
  // Private browsing can reject storage. Auth still lives in the Supabase session.
}

function dayChipLabel(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function slotsAt(slots, isoDate, time) {
  return slots.filter((slot) => {
    const parts = istanbulDateTime(slot.starts_at)
    return parts.date === isoDate && parts.time === time
  })
}

function groupSeatOpen(slot) {
  return Boolean(slot)
    && slot.session_type === 'group'
    && slot.status === 'open'
    && (slot.booked_count ?? 0) < (slot.capacity ?? 0)
}

function BookingPanel({ authUser = null, onAuthUser }) {
  const dates = useMemo(() => studioDatesForWeek(), [])
  const [phone, setPhone] = useState('')
  const [authPrompt, setAuthPrompt] = useState(false)
  const [memberState, setMemberState] = useState(null)
  const [selectedDate, setSelectedDate] = useState(dates[0])
  const [slots, setSlots] = useState([])
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [sheet, setSheet] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [slotsBusy, setSlotsBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [clock, setClock] = useState(initialClock)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [trialPhone, setTrialPhone] = useState('')
  const [checkoutKind, setCheckoutKind] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startSlots, setStartSlots] = useState([])
  const [startBusy, setStartBusy] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [trialSlotId, setTrialSlotId] = useState('')
  const sheetRef = useRef(null)
  const lookupSeq = useRef(0)
  const authUserRef = useRef(authUser)
  const pendingSlotRef = useRef(null)
  authUserRef.current = authUser

  const member = memberState?.member ?? null
  const times = slotStarts(selectedDate)
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null
  const sessionType = selectedSlot?.session_type ?? null
  const usableCredits = creditsOnDate(member?.packages, selectedDate, sessionType)
  const datedCredits = creditsOnDate(member?.packages, selectedDate)

  useEffect(() => {
    let ignore = false

    fetchBookableSlots(selectedDate, selectedDate)
      .then((rows) => {
        if (ignore) return
        setSlots(rows)
        setClock(Date.now())
      })
      .catch((lookupError) => {
        if (!ignore) setError(messageOf(lookupError))
      })
      .finally(() => {
        if (ignore) return
        setSlotsBusy(false)
      })

    return () => {
      ignore = true
    }
  }, [selectedDate])

  useEffect(() => {
    if (!sheet) return undefined
    sheetRef.current?.focus()
    return undefined
  }, [sheet, selectedSlotId])

  function requireAuth() {
    if (authUserRef.current) return true
    setAuthPrompt(true)
    setError('Devam etmek için e-posta kodunu doğrula.')
    return false
  }

  function handleUser(user) {
    const previousId = authUserRef.current?.id ?? null
    const nextId = user?.id ?? null
    authUserRef.current = user
    onAuthUser?.(user)
    if (!nextId) {
      setMemberState(null)
      return
    }
    if (!previousId && pendingSlotRef.current) {
      const slot = pendingSlotRef.current
      pendingSlotRef.current = null
      setAuthPrompt(false)
      setError('')
      setSheet('checking')
      identify(slot.session_type)
    }
  }

  async function refreshMember() {
    const next = await fetchMemberState()
    setMemberState(next)
    setClock(Date.now())
    return next
  }

  async function applyClaim(normalized) {
    if (!normalized) return null
    const result = await claimMemberPhone(normalized)
    const status = result?.status || null
    if (status === 'pending') {
      setRegisterOpen(false)
      setSheet(null)
      setNotice('Bu telefonun hesabına bağlanması için stüdyo onayı gerekiyor.')
    }
    return status
  }

  async function reloadSlots() {
    const rows = await fetchBookableSlots(selectedDate, selectedDate)
    setSlots(rows)
    setClock(Date.now())
    return rows
  }

  function rememberInquiry(isoDate, phoneValue, source) {
    const raw = String(phoneValue ?? '').trim().slice(0, 40)
    if (!isoDate && !raw) return
    recordBookingInquiry(isoDate, raw, source).catch(() => {})
  }

  function updatePhone(value) {
    setPhone(value)
    setNotice('')
    setError('')
  }

  function closeSheet() {
    setSheet(null)
    setSelectedSlotId('')
    setError('')
  }

  async function identify(sessionType = selectedSlot?.session_type) {
    if (!requireAuth()) return null
    const seq = lookupSeq.current + 1
    lookupSeq.current = seq
    setLookupBusy(true)
    setError('')

    try {
      const normalized = normalizePhone(phone)
      const status = normalized ? await applyClaim(normalized) : null
      if (lookupSeq.current !== seq) return null
      if (status === 'pending') return null
      const next = await refreshMember()
      if (lookupSeq.current !== seq) return next
      setSheet(sheetFor(next.member, selectedDate, sessionType, groupSeatOpen(selectedSlot)))
      setNotice(next.member ? '' : 'Bu telefonla kayıtlı üyelik yok.')
      return next
    } catch (lookupError) {
      if (lookupSeq.current === seq) {
        const text = messageOf(lookupError)
        setError(text)
        setRegisterOpen(false)
        setSheet(text === 'Çok fazla bağlama denemesi' || text === 'Devam etmek için e-posta kodunu doğrula.'
          ? null
          : 'trial-offer')
      }
      return null
    } finally {
      if (lookupSeq.current === seq) setLookupBusy(false)
    }
  }

  function checkTypedPhone() {
    lookupMember()
  }

  async function onSlotClick(slot) {
    setSelectedSlotId(slot.id)
    setNotice('')
    setError('')

    if (String(phone).trim()) rememberInquiry(selectedDate, phone, 'phone')
    if (!authUserRef.current) {
      pendingSlotRef.current = slot
      setAuthPrompt(true)
      setError('Devam etmek için e-posta kodunu doğrula.')
      return
    }

    pendingSlotRef.current = null
    setSheet('checking')
    await identify(slot.session_type)
  }

  async function lookupMember() {
    if (!requireAuth()) return
    rememberInquiry(selectedDate, phone, 'phone')
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError('Telefon numarası geçersiz')
      return
    }

    setLookupBusy(true)
    setError('')
    setNotice('')

    try {
      const status = await applyClaim(normalized)
      if (status === 'pending') return
      const next = await refreshMember()
      if (!next.member) {
        setRegisterOpen(true)
        setNotice('Bu telefonla kayıtlı üyelik yok.')
      } else {
        setRegisterOpen(false)
        setNotice('')
      }
    } catch (lookupError) {
      setRegisterOpen(false)
      setError(messageOf(lookupError))
    } finally {
      setLookupBusy(false)
    }
  }

  async function declineTrial() {
    if (!requireAuth()) return

    setLookupBusy(true)
    setError('')
    try {
      const normalized = normalizePhone(phone)
      const status = normalized ? await applyClaim(normalized) : null
      if (status === 'pending') return
      const next = await refreshMember()
      const credits = creditsOnDate(next.member?.packages, selectedDate, selectedSlot?.session_type)
      setSheet(credits > 0 ? 'credits' : 'packages')
    } catch (lookupError) {
      setError(messageOf(lookupError))
      setSheet('packages')
    } finally {
      setLookupBusy(false)
    }
  }

  function openTrialForm() {
    setTrialPhone(phone)
    setNotice('')
    setError('')
    setSheet('trial-form')
  }

  function selectTrial() {
    setCheckoutKind('trial')
    setTrialSlotId('')
    setError('')
    setNotice('')
    pickStartDay(selectedDate)
  }

  function chooseHour(item) {
    if (checkoutKind !== 'trial') {
      continueToPayment(item.time)
      return
    }
    setTrialSlotId(item.slot.id)
    setTrialPhone(phone)
    setError('')
    setNotice('')
    setSheet('trial-form')
  }

  async function submitRegistration(event) {
    event.preventDefault()
    if (!requireAuth()) return
    const normalized = normalizePhone(phone)
    if (!validPersonName(firstName) || !validPersonName(lastName)) {
      setError('İsim ve soyisim gerekli')
      return
    }
    if (!normalized) {
      setError('Telefon numarası geçersiz')
      return
    }

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await registerMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalized,
      })
      setPhone(normalized)
      await refreshMember()
      setRegisterOpen(false)
      setNotice('Kaydın oluşturuldu.')
    } catch (registerError) {
      setError(messageOf(registerError))
    } finally {
      setActionBusy(false)
    }
  }

  async function submitTrial(event) {
    event.preventDefault()
    if (!requireAuth()) return
    const bookedSlot = startSlots.find((item) => item.id === trialSlotId) || selectedSlot
    const groupOpen = bookedSlot?.session_type === 'group'
      && bookedSlot.status === 'open'
      && (bookedSlot.booked_count ?? 0) < (bookedSlot.capacity ?? 0)
    if (!groupOpen) {
      setError('Deneme antrenmanı yalnız boş grup saatine yazılır')
      return
    }

    const normalized = normalizePhone(trialPhone)
    if (!validPersonName(firstName) || !validPersonName(lastName)) {
      setError('İsim ve soyisim gerekli')
      return
    }
    if (!normalized) {
      setError('Telefon numarası geçersiz')
      return
    }

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await registerTrialLesson({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalized,
        slotId: bookedSlot.id,
      })
      setPhone(normalized)
      await refreshMember()
      await reloadSlots()
      setSheet(null)
      setSelectedSlotId('')
      setTrialSlotId('')
      setRegisterOpen(false)
      setFirstName('')
      setLastName('')
      notifyMemberChanged()
      setNotice('Deneme antrenmanın bu grup saatine kaydedildi.')
    } catch (trialError) {
      const text = messageOf(trialError)
      if (text === 'Bu telefonla kayıtlı üyelik var') {
        setPhone(normalized)
        const next = await identify()
        const returning = next?.member?.has_taken_lessons
          || next?.member?.trial_used
          || next?.member?.has_paid_package
        setNotice(returning ? 'Kaydın bulundu. Paketini seçebilirsin.' : 'Kaydın bulundu.')
      } else {
        setError(text)
      }
    } finally {
      setActionBusy(false)
    }
  }

  function selectPackage(kind) {
    if (!packageOption(kind)) return
    setCheckoutKind(kind)
    setError('')
    setNotice('')
    pickStartDay(selectedDate)
  }

  async function pickStartDay(isoDate) {
    setStartDate(isoDate)
    setSheet('start-time')
    setStartBusy(true)
    setError('')

    try {
      const rows = await fetchBookableSlots(isoDate, isoDate)
      setStartSlots(rows)
      setClock(Date.now())
    } catch (loadError) {
      setStartSlots([])
      setError(messageOf(loadError))
    } finally {
      setStartBusy(false)
    }
  }

  function continueToPayment(time) {
    const option = packageOption(checkoutKind)
    if (!option || !startDate || !time) return
    saveCheckout({
      kind: option.kind,
      title: option.title,
      startsOn: startDate,
      time,
      sessionType: packageSessionType(option.kind),
    })
    window.location.hash = 'odeme'
  }

  async function holdSeat() {
    if (!requireAuth() || !selectedSlot) return

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await bookSession(selectedSlot.id)
      setSelectedSlotId('')
      setSheet(null)
      await refreshMember()
      await reloadSlots()
      notifyMemberChanged()
      setNotice('Yerin tutuldu.')
    } catch (bookError) {
      const text = messageOf(bookError)
      if (text === 'Üye bulunamadı') {
        setSheet('trial-offer')
        setNotice('Bu telefonla kayıtlı üyelik yok.')
      } else {
        setError(text)
      }
    } finally {
      setActionBusy(false)
    }
  }

  const futurePackage = futureCreditPackage(member?.packages, selectedDate, sessionType)
  const wrongType = Boolean(sessionType) && usableCredits === 0 && datedCredits > 0
  let holdBlock = ''
  if (member && usableCredits === 0 && futurePackage) {
    holdBlock = 'Üyelik başlangıcından önce rezervasyon yapılamaz'
  } else if (member && wrongType) {
    holdBlock = 'Bu ders türü için kullanılabilir kredi yok'
  } else if (member && usableCredits === 0 && sheet === 'credits') {
    holdBlock = 'Kullanılabilir ders kredisi yok'
  }

  const checkoutOption = checkoutKind === 'trial'
    ? { kind: 'trial', title: 'Deneme antrenmanı' }
    : packageOption(checkoutKind)
  const sessionForPackage = checkoutKind === 'trial' ? 'group' : packageSessionType(checkoutKind)
  const openHours = startDate
    ? slotStarts(startDate).flatMap((time) => {
      if (isPastSlot(startDate, time, clock)) return []
      const slot = startSlots.find((item) => {
        const parts = istanbulDateTime(item.starts_at)
        return parts.date === startDate && parts.time === time && item.session_type === sessionForPackage
      })
      if (!slot || slot.status !== 'open' || (slot.booked_count ?? 0) >= (slot.capacity ?? 0)) return []
      return [{ time, slot, detail: occupancyLabel(slot, false) }]
    })
    : []

  const savedNotice = notice === 'Yerin tutuldu.'
    || notice === 'Deneme antrenmanın bu grup saatine kaydedildi.'

  return (
    <div className="booking-form">
      <MemberSummary user={authUser} />
      <div className="day-row" role="listbox" aria-label="Gün seç">
        {dates.map((isoDate) => (
          <button
            key={isoDate}
            type="button"
            className={isoDate === selectedDate ? 'day-chip active' : 'day-chip'}
            onClick={() => {
              if (isoDate === selectedDate) return
              setSelectedDate(isoDate)
              setSelectedSlotId('')
              setSlotsBusy(true)
              rememberInquiry(isoDate, phone, 'day')
              if (checkoutKind === 'trial' && (sheet === 'start-time' || sheet === 'trial-form')) {
                pickStartDay(isoDate)
                return
              }
              setSheet(null)
            }}
          >
            {dayChipLabel(isoDate)}
          </button>
        ))}
      </div>

      <div className="time-grid" aria-busy={slotsBusy}>
        {times.map((time) => {
          const pair = slotsAt(slots, selectedDate, time)
          const past = isPastSlot(selectedDate, time, clock)

          return (
            <div key={time} className="time-slot" role="group" aria-label={time}>
              <strong>{time}</strong>
              {past ? <small>Geçti</small> : ['private', 'group'].map((kind) => {
                const slot = pair.find((item) => item.session_type === kind)
                const bookable = Boolean(slot) && (slot.status === 'open' || slot.status === 'full')
                const open = bookable
                  && slot.status === 'open'
                  && !isSlotFull(slot.session_type, slot.booked_count)
                const detail = occupancyLabel(bookable ? slot : null, false)

                return (
                  <button
                    key={kind}
                    type="button"
                    className={slot?.id === selectedSlotId ? 'time-kind active' : 'time-kind'}
                    disabled={!open || actionBusy}
                    onClick={() => onSlotClick(slot)}
                  >
                    {detail}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <EmailOtpCard
        visible={!authUser && authPrompt}
        scrollOnLink
        onUser={handleUser}
        onLinkError={(message) => {
          if (!message) return
          setError(message)
          setAuthPrompt(true)
        }}
      />

      {sheet !== 'trial-form' && (
        <div className="field-row booking-phone">
          <label>
            Telefon
            <input
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="05xx xxx xx xx"
              value={phone}
              onChange={(event) => updatePhone(event.target.value)}
              onBlur={() => {
                if (String(phone).trim()) rememberInquiry(selectedDate, phone, 'phone')
              }}
            />
          </label>
        </div>
      )}

      {selectedSlot && sheet && (
        <section
          ref={sheetRef}
          className="slot-sheet"
          tabIndex={-1}
          aria-labelledby="slot-sheet-title"
          aria-busy={lookupBusy || actionBusy}
        >
          <p className="sheet-kicker">
            {checkoutKind === 'trial' && (sheet === 'start-time' || sheet === 'trial-form')
              ? 'Deneme antrenmanı'
              : occupancyLabel(selectedSlot, false)}
          </p>
          <h3 id="slot-sheet-title">
            {checkoutKind === 'trial' && (sheet === 'start-time' || sheet === 'trial-form')
              ? formatStudioDate(startDate || selectedDate)
              : formatStudioWhen(selectedSlot.starts_at)}
          </h3>

          {sheet === 'checking' && <p className="sheet-copy">Kayıt kontrol ediliyor.</p>}

          {sheet === 'trial-offer' && (
            <div className="sheet-block">
              <p className="sheet-kicker">Deneme antrenmanı</p>
              <p className="sheet-copy">Bu grup saatinde yer var. İstersen deneme antrenmanına doğrudan kaydolabilirsin.</p>
              <div className="sheet-actions">
                <button type="button" className="cta" onClick={openTrialForm} disabled={lookupBusy}>
                  Deneme antrenmanına kaydol
                </button>
                <button type="button" className="cta ghost" onClick={declineTrial} disabled={lookupBusy}>
                  Deneme istemiyorum
                </button>
              </div>
              <button
                type="button"
                className="text-button sheet-check"
                onClick={checkTypedPhone}
                disabled={lookupBusy || actionBusy}
              >
                {lookupBusy ? 'Bakılıyor' : 'Kaydı kontrol et'}
              </button>
            </div>
          )}

          {sheet === 'trial-form' && (
            <form className="sheet-block" onSubmit={submitTrial}>
              <p className="sheet-copy">İsim, soyisim ve telefon kaydedilir. Deneme antrenmanı seçtiğin grup saatine yazılır.</p>
              <div className="two-col">
                <label>
                  İsim
                  <input
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Soyisim
                  <input
                    name="family-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Telefon
                <input
                  type="tel"
                  name="trial-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05xx xxx xx xx"
                  value={trialPhone}
                  onChange={(event) => setTrialPhone(event.target.value)}
                  required
                />
              </label>
              <div className="sheet-actions">
                <button type="submit" className="cta" disabled={actionBusy}>
                  {actionBusy ? 'Kaydediliyor' : 'Onayla'}
                </button>
                <button
                  type="button"
                  className="cta ghost"
                  onClick={() => setSheet(checkoutKind === 'trial' ? 'start-time' : 'trial-offer')}
                  disabled={actionBusy}
                >
                  Vazgeç
                </button>
              </div>
            </form>
          )}

          {sheet === 'packages' && (
            <div className="sheet-block">
              <p className="sheet-copy">{packageLead(member)}</p>
              {member?.full_name && <p className="member-name">{member.full_name}</p>}
              <div className="choice-list">
                {PACKAGE_OPTIONS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    className="choice-card"
                    onClick={() => selectPackage(option.kind)}
                  >
                    <span className="choice-index">{option.index}</span>
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                ))}
                {!member && (
                  <button type="button" className="choice-card" onClick={selectTrial}>
                    <span className="choice-index">01</span>
                    <span>
                      <strong>Deneme antrenmanı</strong>
                      <small>Grup dersi, ücretsiz</small>
                    </span>
                  </button>
                )}
              </div>
              <button type="button" className="text-button sheet-check" onClick={closeSheet}>
                Kapat
              </button>
            </div>
          )}

          {sheet === 'start-time' && checkoutOption && (
            <div className="sheet-block">
              <p className="sheet-copy">
                {checkoutOption.title}, {startDate ? formatStudioDate(startDate) : ''}.
                {' '}
                {checkoutKind === 'trial' ? 'Günü yukarıdan değiştirip saati onayla.' : 'Saatini seç.'}
              </p>
              {startBusy && <p className="sheet-copy">Saatler yükleniyor.</p>}
              {!startBusy && openHours.length === 0 && (
                <p className="sheet-copy">
                  {openingMinutes(startDate) === null
                    ? 'Bu gün stüdyo kapalı.'
                    : 'Bu günde seçilebilir saat yok.'}
                </p>
              )}
              {openHours.length > 0 && (
                <div className="choice-list">
                  {openHours.map((item) => (
                    <button
                      key={item.time}
                      type="button"
                      className="choice-card"
                      onClick={() => chooseHour(item)}
                    >
                      <span className="choice-index">{item.time}</span>
                      <span>
                        <strong>{item.detail}</strong>
                        <small>{checkoutKind === 'trial' ? 'Onayla' : 'Ödemeye geç'}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="text-button sheet-check" onClick={() => setSheet('packages')}>
                Geri
              </button>
            </div>
          )}

          {sheet === 'credits' && (
            <div className="sheet-block">
              {usableCredits > 0 ? (
                <p className="sheet-copy">
                  {member?.full_name ? `${member.full_name}, ` : ''}
                  bu tarih için {usableCredits} kredin hazır.
                </p>
              ) : (
                <p className="booking-error">{holdBlock || 'Kullanılabilir ders kredisi yok'}</p>
              )}
              <div className="sheet-actions">
                <button
                  type="button"
                  className="cta"
                  onClick={holdSeat}
                  disabled={actionBusy || Boolean(holdBlock)}
                >
                  {actionBusy ? 'Kaydediliyor' : 'Yerini tut'}
                </button>
                <button type="button" className="cta ghost" onClick={closeSheet}>
                  Vazgeç
                </button>
              </div>
              <button type="button" className="text-button sheet-check" onClick={() => setSheet('packages')}>
                Yeni paket al
              </button>
            </div>
          )}
        </section>
      )}

      {holdBlock && sheet !== 'credits' && <p className="booking-error">{holdBlock}</p>}

      {registerOpen && !member && !sheet && (
        <form className="slot-sheet register-card" onSubmit={submitRegistration}>
          <p className="sheet-kicker">Kayıt ol</p>
          <p className="sheet-copy">İsim, soyisim ve telefon sisteme kaydedilir.</p>
          <div className="two-col">
            <label>
              İsim
              <input
                name="given-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label>
              Soyisim
              <input
                name="family-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Telefon
            <input
              type="tel"
              name="register-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="05xx xxx xx xx"
              value={phone}
              onChange={(event) => updatePhone(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="cta cta-form" disabled={actionBusy}>
            {actionBusy ? 'Kaydediliyor' : 'Kayıt ol'}
          </button>
        </form>
      )}

      {notice && (
        <p className="booking-note" role="status">
          {notice}
          {savedNotice && (
            <>
              {' '}
              <a href="/hesabim">Hesabım'da gör</a>
            </>
          )}
        </p>
      )}
      {error && <p className="booking-error" role="alert">{error}</p>}
    </div>
  )
}

export default BookingPanel

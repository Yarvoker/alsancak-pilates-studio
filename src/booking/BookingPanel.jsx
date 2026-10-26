import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bookSession,
  cancelReservation,
  claimMemberPhone,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
  recordBookingInquiry,
  registerMember,
  registerTrialLesson,
} from './bookingApi.js'
import { normalizePhone } from './phone.js'
import { supabase } from './supabaseClient.js'
import {
  PACKAGE_OPTIONS,
  creditsOnDate,
  futureCreditPackage,
  occupancyLabel,
  packageLead,
  packageOption,
  packageSessionLabel,
  packageSessionType,
  saveCheckout,
  sheetFor,
  validPersonName,
} from './sheetFlow.js'
import {
  cancellationEffect,
  capacityFor,
  formatStudioDate,
  formatStudioWhen,
  istanbulDateTime,
  isPastSlot,
  isSlotFull,
  openingMinutes,
  slotStarts,
  studioDatesForWeek,
} from './slotRules.js'

const SESSION_LABEL = {
  private: 'Özel',
  group: 'Grup',
}

const initialClock = Date.now()

try {
  sessionStorage.removeItem('alsancak-booking-phone')
} catch {
  // Private browsing can reject storage. Auth still lives in the Supabase session.
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function mapAuthError(error, phase) {
  const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase()
  if (phase === 'verify' && (text.includes('expired') || text.includes('invalid') || text.includes('otp'))) {
    return 'Kod hatalı veya süresi geçmiş.'
  }
  if (text.includes('rate') || text.includes('too many') || text.includes('over_email')) {
    return 'Bu e-posta için çok fazla kod istendi. Bir saat sonra tekrar dene.'
  }
  if (text.includes('not authorized') || text.includes('email_address_not_authorized')) {
    return 'Bu e-posta adresine doğrulama gönderilemedi.'
  }
  if (phase === 'send') return 'Kod gönderilemedi. Lütfen tekrar dene.'
  return 'Doğrulama tamamlanamadı. Lütfen tekrar dene.'
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

function BookingPanel() {
  const dates = useMemo(() => studioDatesForWeek(), [])
  const [phone, setPhone] = useState('')
  const [authUser, setAuthUser] = useState(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [authBusy, setAuthBusy] = useState(false)
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
  const [confirmBurnId, setConfirmBurnId] = useState('')
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
  const emailRef = useRef(null)
  const lookupSeq = useRef(0)

  const member = memberState?.member ?? null
  const reservations = memberState?.reservations ?? []
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
    let ignore = false
    supabase.auth.getSession().then(({ data }) => {
      if (!ignore) setAuthUser(data.session?.user ?? null)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => {
      ignore = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  useEffect(() => {
    if (!authUser) {
      setMemberState(null)
      return undefined
    }

    let ignore = false
    fetchMemberState()
      .then((next) => {
        if (!ignore) setMemberState(next)
      })
      .catch((lookupError) => {
        if (!ignore) setError(messageOf(lookupError))
      })

    return () => {
      ignore = true
    }
  }, [authUser])

  useEffect(() => {
    if (!sheet) return undefined
    sheetRef.current?.focus()
    return undefined
  }, [sheet, selectedSlotId])

  function requireAuth() {
    if (authUser) return true
    setError('Devam etmek için e-posta kodunu doğrula.')
    emailRef.current?.focus()
    return false
  }

  async function refreshMember() {
    const next = await fetchMemberState()
    setMemberState(next)
    setClock(Date.now())
    return next
  }

  async function attachPhone(normalized) {
    if (!normalized) return null
    return claimMemberPhone(normalized)
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
    setConfirmBurnId('')
  }

  async function sendCode() {
    const nextEmail = email.trim().toLowerCase()
    if (!validEmail(nextEmail)) {
      setError('E-posta geçersiz.')
      return
    }

    setAuthBusy(true)
    setError('')
    setNotice('')
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: nextEmail,
      options: { shouldCreateUser: true },
    })
    setAuthBusy(false)

    if (sendError) {
      setError(mapAuthError(sendError, 'send'))
      return
    }

    setEmail(nextEmail)
    setCodeSent(true)
    setCode('')
    setResendIn(60)
    setNotice('Doğrulama kodu e-postana gönderildi.')
  }

  async function verifyCode() {
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) {
      setError('Kod hatalı veya süresi geçmiş.')
      return
    }

    setAuthBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    })
    setAuthBusy(false)

    if (verifyError) {
      setError(mapAuthError(verifyError, 'verify'))
      return
    }

    setCode('')
    setCodeSent(false)
    setResendIn(0)
    setNotice('')
  }

  async function signOutMember() {
    await supabase.auth.signOut()
    setMemberState(null)
    setCode('')
    setCodeSent(false)
    setResendIn(0)
    setRegisterOpen(false)
    setSheet(null)
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
      if (normalized) await attachPhone(normalized)
      const next = await refreshMember()
      if (lookupSeq.current !== seq) return next
      setSheet(sheetFor(next.member, selectedDate, sessionType, groupSeatOpen(selectedSlot)))
      setNotice(next.member ? '' : 'Bu telefonla kayıtlı üyelik yok.')
      return next
    } catch (lookupError) {
      if (lookupSeq.current === seq) {
        setError(messageOf(lookupError))
        setSheet('trial-offer')
      }
      return null
    } finally {
      if (lookupSeq.current === seq) setLookupBusy(false)
    }
  }

  async function onSlotClick(slot) {
    setSelectedSlotId(slot.id)
    setNotice('')
    setError('')
    setConfirmBurnId('')

    if (String(phone).trim()) rememberInquiry(selectedDate, phone, 'phone')
    if (!requireAuth()) return

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
      await attachPhone(normalized)
      const next = await refreshMember()
      if (!next.member) {
        setRegisterOpen(true)
        setNotice('Bu telefonla kayıtlı üyelik yok.')
      } else {
        setRegisterOpen(false)
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
      if (normalized) await attachPhone(normalized)
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

  async function cancelSeat(reservation) {
    if (!requireAuth()) return

    const effect = cancellationEffect(Date.now(), reservation.starts_at)
    if (effect === 'burn' && confirmBurnId !== reservation.id) {
      setConfirmBurnId(reservation.id)
      return
    }

    const creditsBefore = member?.credits_remaining ?? 0
    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await cancelReservation(reservation.id)
      const next = await refreshMember()
      await reloadSlots()
      setConfirmBurnId('')
      const refunded = (next.member?.credits_remaining ?? 0) > creditsBefore
      setNotice(refunded ? 'İptal edildi. Kredi iade edildi.' : 'İptal edildi. Kredi yandı.')
    } catch (cancelError) {
      setError(messageOf(cancelError))
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

  return (
    <div className="booking-form">
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
              setConfirmBurnId('')
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

      <section className="member-auth" aria-label="Üye girişi">
        {authUser ? (
          <div className="auth-bar">
            <p className="auth-email">{authUser.email}</p>
            <button type="button" className="text-button" onClick={signOutMember} disabled={authBusy}>
              Çıkış
            </button>
          </div>
        ) : (
          <div className="field-row">
            <label>
              E-posta
              <input
                ref={emailRef}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="ornek@eposta.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setError('')
                }}
              />
            </label>
            <button
              type="button"
              className="cta cta-form"
              onClick={sendCode}
              disabled={authBusy || resendIn > 0}
            >
              {codeSent && resendIn === 0 ? 'Tekrar gönder' : 'Kod gönder'}
            </button>
            {resendIn > 0 && (
              <p className="booking-note">Tekrar göndermek için {resendIn} sn</p>
            )}
            {codeSent && (
              <>
                <label>
                  Doğrulama kodu
                  <input
                    name="email-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6 haneli kod"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
                <button
                  type="button"
                  className="cta cta-form"
                  onClick={verifyCode}
                  disabled={authBusy || code.length !== 6}
                >
                  {authBusy ? 'Doğrulanıyor' : 'Doğrula'}
                </button>
              </>
            )}
          </div>
        )}
      </section>

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

      {member && (
        <div className="member-card">
          <p className="member-name">{member.full_name}</p>
          <p className="member-meta">
            {usableCredits} kredi
            {' '}
            {sessionType === 'private' ? 'özel ders' : sessionType === 'group' ? 'grup dersi' : 'bu tarih'}
            {' '}
            için kullanılabilir
          </p>
          <ul className="package-list">
            {member.packages.map((item) => {
              const use = packageSessionLabel(item.session_type)
              return (
                <li key={item.id || `${item.name}-${item.starts_on}`}>
                  {item.name}
                  {' · '}
                  {item.credits_remaining}/{item.credits_total} kredi
                  {use ? ` · ${use}` : ''}
                  {' · başlangıç '}
                  {formatStudioDate(item.starts_on)}
                </li>
              )
            })}
          </ul>

          {reservations.length > 0 && (
            <div className="reservation-list">
              <p className="member-meta">Yaklaşan dersler</p>
              {reservations.map((reservation) => {
                const effect = cancellationEffect(clock, reservation.starts_at)
                const burning = effect === 'burn'
                const armed = confirmBurnId === reservation.id
                let label = 'İptal et, kredi iade edilir'
                if (burning && armed) label = 'Kredi yanacak, onayla'
                else if (burning) label = 'İptal et, kredi yanar'

                return (
                  <div key={reservation.id} className="reservation-item">
                    <div>
                      <strong>{formatStudioWhen(reservation.starts_at)}</strong>
                      <small>
                        {SESSION_LABEL[reservation.session_type] || 'Ders'}
                        {' · '}
                        {reservation.session_type ? `${capacityFor(reservation.session_type)} kişilik` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => cancelSeat(reservation)}
                      disabled={actionBusy}
                    >
                      {label}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {holdBlock && sheet !== 'credits' && <p className="booking-error">{holdBlock}</p>}

      {!selectedSlot && (
        <button
          type="button"
          className="cta cta-form"
          onClick={lookupMember}
          disabled={lookupBusy || actionBusy}
        >
          {lookupBusy ? 'Bakılıyor' : 'Derslerimi göster'}
        </button>
      )}

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

      {notice && <p className="booking-note" role="status">{notice}</p>}
      {error && <p className="booking-error" role="alert">{error}</p>}
    </div>
  )
}

export default BookingPanel

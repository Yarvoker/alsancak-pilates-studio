import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bookSession,
  cancelReservation,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
  registerTrialLesson,
  requestMemberPackage,
} from './bookingApi.js'
import { normalizePhone } from './phone.js'
import {
  PACKAGE_OPTIONS,
  creditsOnDate,
  occupancyLabel,
  packageLead,
  packageOption,
  packageWhatsappUrl,
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
  slotStarts,
  upcomingStudioDates,
} from './slotRules.js'

const SESSION_LABEL = {
  private: 'Özel',
  group: 'Grup',
}

const SESSION_PHONE_KEY = 'alsancak-booking-phone'
const initialClock = Date.now()

function readSessionPhone() {
  try {
    return normalizePhone(sessionStorage.getItem(SESSION_PHONE_KEY))
  } catch {
    return null
  }
}

function writeSessionPhone(phone) {
  try {
    if (phone) sessionStorage.setItem(SESSION_PHONE_KEY, phone)
    else sessionStorage.removeItem(SESSION_PHONE_KEY)
  } catch {
    // Private browsing can reject storage. The form still works for this visit.
  }
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

function slotOnDate(slots, isoDate, time) {
  return slots.find((slot) => {
    const parts = istanbulDateTime(slot.starts_at)
    return parts.date === isoDate && parts.time === time
  })
}

function BookingPanel({ whatsappUrl }) {
  const dates = useMemo(() => upcomingStudioDates(14), [])
  const [phone, setPhone] = useState(() => readSessionPhone() ?? '')
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
  const [sentKind, setSentKind] = useState('')
  const sheetRef = useRef(null)
  const lookupSeq = useRef(0)

  const member = memberState?.member ?? null
  const reservations = memberState?.reservations ?? []
  const times = slotStarts(selectedDate)
  const usableCredits = creditsOnDate(member?.packages, selectedDate)
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null
  const sentOption = packageOption(sentKind)

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
    const saved = readSessionPhone()
    if (!saved) return undefined

    let ignore = false
    fetchMemberState(saved)
      .then((next) => {
        if (!ignore) setMemberState(next)
      })
      .catch((lookupError) => {
        if (!ignore) setError(messageOf(lookupError))
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!sheet) return undefined
    sheetRef.current?.focus()
    return undefined
  }, [sheet, selectedSlotId])

  async function refreshMember(activePhone) {
    const next = await fetchMemberState(activePhone)
    setMemberState(next)
    setClock(Date.now())
    return next
  }

  async function reloadSlots() {
    const rows = await fetchBookableSlots(selectedDate, selectedDate)
    setSlots(rows)
    setClock(Date.now())
    return rows
  }

  function updatePhone(value) {
    setPhone(value)
    setMemberState(null)
    setNotice('')
    setError('')
    setConfirmBurnId('')
    setSentKind('')
    writeSessionPhone(null)
    if (selectedSlotId && sheet !== 'trial-form') setSheet('trial-offer')
  }

  function closeSheet() {
    setSheet(null)
    setSelectedSlotId('')
    setSentKind('')
    setError('')
  }

  async function identify(activePhone) {
    const seq = lookupSeq.current + 1
    lookupSeq.current = seq
    setLookupBusy(true)
    setError('')

    try {
      const next = await refreshMember(activePhone)
      if (lookupSeq.current !== seq) return next
      writeSessionPhone(activePhone)
      setSheet(sheetFor(next.member, selectedDate))
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
    setSentKind('')
    setNotice('')
    setError('')
    setConfirmBurnId('')

    const normalized = normalizePhone(phone) || readSessionPhone()
    if (!normalized) {
      setSheet('trial-offer')
      return
    }

    if (!normalizePhone(phone)) setPhone(normalized)
    setSheet('checking')
    await identify(normalized)
  }

  async function checkTypedPhone() {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError('Telefon numarası geçersiz')
      return
    }
    setNotice('')
    await identify(normalized)
  }

  async function lookupMember() {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError('Telefon numarası geçersiz')
      return
    }

    setLookupBusy(true)
    setError('')
    setNotice('')

    try {
      const next = await refreshMember(normalized)
      writeSessionPhone(normalized)
      if (!next.member) setNotice('Bu telefonla kayıtlı üyelik yok.')
    } catch (lookupError) {
      setError(messageOf(lookupError))
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

  async function submitTrial(event) {
    event.preventDefault()
    if (!selectedSlot) return

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
        slotId: selectedSlot.id,
      })
      setPhone(normalized)
      writeSessionPhone(normalized)
      await refreshMember(normalized)
      await reloadSlots()
      setSheet(null)
      setSelectedSlotId('')
      setFirstName('')
      setLastName('')
      setNotice('Ücretsiz deneme dersin kaydedildi.')
    } catch (trialError) {
      const text = messageOf(trialError)
      if (text === 'Bu telefonla kayıtlı üyelik var') {
        setPhone(normalized)
        const next = await identify(normalized)
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

  async function choosePackage(kind) {
    const normalized = normalizePhone(phone)
    const option = packageOption(kind)
    if (!normalized || !selectedSlot || !option) return

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await requestMemberPackage(normalized, kind, selectedSlot.id)
      setSentKind(kind)
      setNotice(`${option.title} talebin stüdyoya iletildi.`)
    } catch (requestError) {
      setError(messageOf(requestError))
    } finally {
      setActionBusy(false)
    }
  }

  async function holdSeat() {
    const normalized = normalizePhone(phone)
    if (!normalized || !selectedSlot) return

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await bookSession(normalized, selectedSlot.id)
      setSelectedSlotId('')
      setSheet(null)
      await refreshMember(normalized)
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
    const normalized = normalizePhone(phone)
    if (!normalized) return

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
      await cancelReservation(normalized, reservation.id)
      const next = await refreshMember(normalized)
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

  const futurePackage = (member?.packages ?? []).find((item) => item.starts_on > selectedDate)
  let holdBlock = ''
  if (member && usableCredits === 0 && futurePackage) {
    holdBlock = 'Üyelik başlangıcından önce rezervasyon yapılamaz'
  } else if (member && usableCredits === 0 && sheet === 'credits') {
    holdBlock = 'Kullanılabilir ders kredisi yok'
  }

  const whatsappHref = sentOption && selectedSlot
    ? packageWhatsappUrl(whatsappUrl, {
      title: sentOption.title,
      whenLabel: formatStudioWhen(selectedSlot.starts_at),
      name: member?.full_name,
    })
    : ''

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
              setSheet(null)
              setSentKind('')
              setConfirmBurnId('')
              setSlotsBusy(true)
            }}
          >
            {dayChipLabel(isoDate)}
          </button>
        ))}
      </div>

      <div className="time-grid" aria-busy={slotsBusy}>
        {times.map((time) => {
          const slot = slotOnDate(slots, selectedDate, time)
          const past = isPastSlot(selectedDate, time, clock)
          const bookable = Boolean(slot) && (slot.status === 'open' || slot.status === 'full')
          const open = bookable
            && slot.status === 'open'
            && Boolean(slot.session_type)
            && !isSlotFull(slot.session_type, slot.booked_count)
          const detail = occupancyLabel(bookable ? slot : null, past)

          return (
            <button
              key={time}
              type="button"
              className={slot?.id === selectedSlotId ? 'time-slot active' : 'time-slot'}
              disabled={!open || past || actionBusy}
              onClick={() => onSlotClick(slot)}
            >
              <strong>{time}</strong>
              <small>{detail}</small>
            </button>
          )
        })}
      </div>

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
          <p className="sheet-kicker">{occupancyLabel(selectedSlot, false)}</p>
          <h3 id="slot-sheet-title">{formatStudioWhen(selectedSlot.starts_at)}</h3>

          {sheet === 'checking' && <p className="sheet-copy">Kayıt kontrol ediliyor.</p>}

          {sheet === 'trial-offer' && (
            <div className="sheet-block">
              <p className="sheet-kicker">Deneme Dersi Al</p>
              <p className="sheet-copy">Bu saat için ücretsiz deneme dersi ayrılsın mı?</p>
              <p className="sheet-copy">Kayıtlıysan numarayı yazıp kaydı kontrol et.</p>
              <div className="sheet-actions">
                <button type="button" className="cta" onClick={openTrialForm} disabled={lookupBusy}>
                  Evet
                </button>
                <button type="button" className="cta ghost" onClick={closeSheet}>
                  Vazgeç
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
              <p className="sheet-copy">Ücretsiz deneme dersi için adını ve telefonunu yaz.</p>
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
                  {actionBusy ? 'Kaydediliyor' : 'Deneme dersini kaydet'}
                </button>
                <button type="button" className="cta ghost" onClick={() => setSheet('trial-offer')} disabled={actionBusy}>
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
                    className={sentKind === option.kind ? 'choice-card sent' : 'choice-card'}
                    aria-pressed={sentKind === option.kind}
                    onClick={() => choosePackage(option.kind)}
                    disabled={actionBusy}
                  >
                    <span className="choice-index">{option.index}</span>
                    <span>
                      <strong>{option.title}</strong>
                      <small>{sentKind === option.kind ? 'Talep iletildi' : option.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
              {usableCredits > 0 && (
                <button
                  type="button"
                  className="cta ghost cta-form"
                  onClick={holdSeat}
                  disabled={actionBusy || Boolean(holdBlock)}
                >
                  Bu dersi kredinle tut
                </button>
              )}
              {whatsappHref && (
                <a className="booking-link sheet-link" href={whatsappHref} target="_blank" rel="noreferrer">
                  WhatsApp ile de gönder
                </a>
              )}
              <button type="button" className="text-button sheet-check" onClick={closeSheet}>
                Kapat
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
            </div>
          )}
        </section>
      )}

      {member && (
        <div className="member-card">
          <p className="member-name">{member.full_name}</p>
          <p className="member-meta">{usableCredits} kredi bu tarih için kullanılabilir</p>
          <ul className="package-list">
            {member.packages.map((item) => (
              <li key={`${item.name}-${item.starts_on}`}>
                {item.name} · {item.credits_remaining}/{item.credits_total} kredi · başlangıç {formatStudioDate(item.starts_on)}
              </li>
            ))}
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

      {notice && <p className="booking-note" role="status">{notice}</p>}
      {error && <p className="booking-error" role="alert">{error}</p>}
    </div>
  )
}

export default BookingPanel

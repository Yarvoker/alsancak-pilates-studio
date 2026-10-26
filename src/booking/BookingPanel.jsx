import { useEffect, useMemo, useState } from 'react'
import {
  bookSession,
  cancelReservation,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
} from './bookingApi.js'
import { normalizePhone } from './phone.js'
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

const initialClock = Date.now()

function dayChipLabel(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function creditsOnDate(packages, isoDate) {
  return (packages ?? [])
    .filter((item) => item.starts_on <= isoDate && item.credits_remaining > 0)
    .reduce((sum, item) => sum + item.credits_remaining, 0)
}

function slotOnDate(slots, isoDate, time) {
  return slots.find((slot) => {
    const parts = istanbulDateTime(slot.starts_at)
    return parts.date === isoDate && parts.time === time
  })
}

function BookingPanel({ whatsappUrl }) {
  const dates = useMemo(() => upcomingStudioDates(14), [])
  const [phone, setPhone] = useState('')
  const [memberState, setMemberState] = useState(null)
  const [selectedDate, setSelectedDate] = useState(dates[0])
  const [slots, setSlots] = useState([])
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [slotsBusy, setSlotsBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [confirmBurnId, setConfirmBurnId] = useState('')
  const [clock, setClock] = useState(initialClock)

  const member = memberState?.member ?? null
  const reservations = memberState?.reservations ?? []
  const times = slotStarts(selectedDate)
  const usableCredits = creditsOnDate(member?.packages, selectedDate)
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null

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

  async function refreshMember(activePhone) {
    const next = await fetchMemberState(activePhone)
    setMemberState(next)
    setClock(Date.now())
    return next
  }

  function updatePhone(value) {
    setPhone(value)
    setMemberState(null)
    setNotice('')
    setError('')
    setConfirmBurnId('')
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
      if (!next.member) {
        setNotice('Bu telefonla kayıtlı üyelik yok. Paket stüdyoda tanımlanır.')
      }
    } catch (lookupError) {
      setError(messageOf(lookupError))
    } finally {
      setLookupBusy(false)
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
      await refreshMember(normalized)
      const rows = await fetchBookableSlots(selectedDate, selectedDate)
      setSlots(rows)
      setNotice('Yerin tutuldu.')
    } catch (bookError) {
      const text = messageOf(bookError)
      if (text === 'Üye bulunamadı') {
        setNotice('Bu telefonla kayıtlı üyelik yok. Paket stüdyoda tanımlanır.')
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
      const rows = await fetchBookableSlots(selectedDate, selectedDate)
      setSlots(rows)
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
  } else if (member && usableCredits === 0) {
    holdBlock = 'Kullanılabilir ders kredisi yok'
  }

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
          const open = Boolean(slot) && slot.status === 'open' && !isSlotFull(slot.session_type, slot.booked_count)
          const full = Boolean(slot) && (slot.status === 'full' || isSlotFull(slot.session_type, slot.booked_count))
          let detail = 'Kapalı'
          if (past) detail = 'Geçti'
          else if (open) {
            const left = capacityFor(slot.session_type) - slot.booked_count
            detail = `${SESSION_LABEL[slot.session_type]} · ${left} yer`
          } else if (full) detail = 'Dolu'

          return (
            <button
              key={time}
              type="button"
              className={slot?.id === selectedSlotId ? 'time-slot active' : 'time-slot'}
              disabled={!open || past || actionBusy}
              onClick={() => setSelectedSlotId(slot.id)}
            >
              <strong>{time}</strong>
              <small>{detail}</small>
            </button>
          )
        })}
      </div>

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
            required
          />
        </label>
      </div>

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

      {holdBlock && <p className="booking-error">{holdBlock}</p>}

      <button
        type="button"
        className="cta cta-form"
        onClick={selectedSlot ? holdSeat : lookupMember}
        disabled={lookupBusy || actionBusy || (Boolean(selectedSlot) && Boolean(holdBlock))}
      >
        {actionBusy ? 'Kaydediliyor' : lookupBusy ? 'Bakılıyor' : selectedSlot ? 'Yerini tut' : 'Derslerimi göster'}
      </button>

      {!member && notice && (
        <p className="booking-note">
          {notice}{' '}
          <a className="booking-link" href={whatsappUrl} target="_blank" rel="noreferrer">
            Deneme seansı için WhatsApp
          </a>
        </p>
      )}

      {notice && member && <p className="booking-note" role="status">{notice}</p>}
      {error && <p className="booking-error" role="alert">{error}</p>}
    </div>
  )
}

export default BookingPanel

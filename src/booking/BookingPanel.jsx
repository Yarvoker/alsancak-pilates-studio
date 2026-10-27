import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bookSession,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
  recordBookingInquiry,
  registerTrialLesson,
} from './bookingApi.js'
import { notifyMemberChanged } from './dashboardApi.js'
import MemberSummary from './MemberSummary.jsx'
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
} from './sheetFlow.js'
import {
  addIsoDays,
  formatStudioDate,
  formatStudioWhen,
  istanbulDateTime,
  isPastSlot,
  isSlotFull,
  openingMinutes,
  slotStarts,
  todayIso,
} from './slotRules.js'

const initialClock = Date.now()

try {
  sessionStorage.removeItem('alsancak-booking-phone')
} catch {
  // Private browsing can reject storage. Auth still lives in the Supabase session.
}

function dayChipParts(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return {
    weekday: new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(date),
    date: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date),
  }
}

function dayIsEmpty(isoDate, now) {
  return !slotStarts(isoDate).some((time) => !isPastSlot(isoDate, time, now))
}

function centerDay(row, chip, behavior) {
  if (!row || !chip) return false
  const rowRect = row.getBoundingClientRect()
  const chipRect = chip.getBoundingClientRect()
  const delta = (chipRect.left + chipRect.width / 2) - (rowRect.left + rowRect.width / 2)
  const max = Math.max(0, row.scrollWidth - row.clientWidth)
  const left = Math.min(max, Math.max(0, row.scrollLeft + delta))
  if (Math.abs(row.scrollLeft - left) < 2) return false
  row.scrollTo({ left, behavior })
  return true
}

function centeredIso(row, chips) {
  const mid = row.getBoundingClientRect().left + row.clientWidth / 2
  let best = ''
  let bestDist = Infinity
  chips.forEach((chip, isoDate) => {
    const rect = chip.getBoundingClientRect()
    const dist = Math.abs(rect.left + rect.width / 2 - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = isoDate
    }
  })
  return best
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

function readPendingSlot() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('pending_slot') || 'null')
    if (!parsed?.slot_id || !parsed?.starts_at) return null
    return { slot_id: parsed.slot_id, starts_at: parsed.starts_at }
  } catch {
    return null
  }
}

function writePendingSlot(slot) {
  try {
    sessionStorage.setItem('pending_slot', JSON.stringify({
      slot_id: slot.id,
      starts_at: slot.starts_at,
    }))
  } catch {
    // Private browsing can reject storage. The login page then opens the account panel.
  }
}

function clearPendingSlot() {
  try {
    sessionStorage.removeItem('pending_slot')
  } catch {
    // Ignore storage failures. The sheet can still open for this visit.
  }
}

function BookingPanel({ authUser = null }) {
  const dates = useMemo(() => {
    const start = todayIso()
    return Array.from({ length: 7 }, (_, index) => addIsoDays(start, index))
  }, [])
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [memberState, setMemberState] = useState(null)
  const [selectedDate, setSelectedDate] = useState(
    () => dates.find((isoDate) => openingMinutes(isoDate) !== null) ?? dates[0],
  )
  const [slots, setSlots] = useState([])
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [sheet, setSheet] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [slotsBusy, setSlotsBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [clock, setClock] = useState(initialClock)
  const [checkoutKind, setCheckoutKind] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startSlots, setStartSlots] = useState([])
  const [startBusy, setStartBusy] = useState(false)
  const [trialSlotId, setTrialSlotId] = useState('')
  const sheetRef = useRef(null)
  const authUserRef = useRef(authUser)
  const loginLinkRef = useRef(null)
  const dayRowRef = useRef(null)
  const dayChipRefs = useRef(new Map())
  const selectedDateRef = useRef(selectedDate)
  const chooseDayRef = useRef(() => {})
  const programmaticScroll = useRef(false)
  const didCenter = useRef(false)
  authUserRef.current = authUser
  selectedDateRef.current = selectedDate

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
    if (!authUser) {
      setMemberState(null)
      return undefined
    }
    let active = true
    fetchMemberState()
      .then((next) => {
        if (active) setMemberState(next)
      })
      .catch((lookupError) => {
        if (active) setError(messageOf(lookupError))
      })
    return () => {
      active = false
    }
  }, [authUser?.id])

  useEffect(() => {
    if (!sheet) return undefined
    sheetRef.current?.focus()
    return undefined
  }, [sheet, selectedSlotId])

  useEffect(() => {
    if (!loginPrompt) return undefined
    loginLinkRef.current?.focus()
    return undefined
  }, [loginPrompt])

  useEffect(() => {
    const row = dayRowRef.current
    const chip = dayChipRefs.current.get(selectedDate)
    const behavior = didCenter.current ? 'smooth' : 'auto'
    didCenter.current = true
    const moved = centerDay(row, chip, behavior)
    if (!moved) {
      programmaticScroll.current = false
      return undefined
    }
    programmaticScroll.current = true
    const release = window.setTimeout(() => {
      programmaticScroll.current = false
    }, behavior === 'smooth' ? 480 : 80)
    return () => window.clearTimeout(release)
  }, [selectedDate])

  useEffect(() => {
    const row = dayRowRef.current
    if (!row) return undefined
    let timer = 0
    const settle = () => {
      const isoDate = centeredIso(row, dayChipRefs.current)
      if (!isoDate || isoDate === selectedDateRef.current) return
      chooseDayRef.current(isoDate)
    }
    const queueSettle = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 120)
    }
    const onScroll = () => {
      if (programmaticScroll.current) return
      queueSettle()
    }
    const onScrollEnd = () => {
      if (programmaticScroll.current) {
        programmaticScroll.current = false
        return
      }
      queueSettle()
    }
    row.addEventListener('scroll', onScroll, { passive: true })
    row.addEventListener('scrollend', onScrollEnd)
    return () => {
      row.removeEventListener('scroll', onScroll)
      row.removeEventListener('scrollend', onScrollEnd)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!authUser || !memberState || slotsBusy) return undefined
    const pending = readPendingSlot()
    if (!pending) return undefined
    const when = istanbulDateTime(pending.starts_at)
    if (!dates.includes(when.date)) {
      clearPendingSlot()
      return undefined
    }
    if (selectedDate !== when.date) {
      setSelectedDate(when.date)
      setSlotsBusy(true)
      return undefined
    }
    const slot = slots.find((item) => item.id === pending.slot_id)
    if (!slot) {
      clearPendingSlot()
      return undefined
    }
    if (memberState.profile_complete !== true) return undefined
    queueMicrotask(() => clearPendingSlot())
    setLoginPrompt(false)
    setSelectedSlotId(slot.id)
    setError('')
    setSheet(sheetFor(memberState.member, when.date, slot.session_type, groupSeatOpen(slot)))
    return undefined
  }, [authUser, memberState, slots, slotsBusy, selectedDate, dates])

  async function refreshMember() {
    const next = await fetchMemberState()
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

  function rememberInquiry(isoDate, source) {
    if (!isoDate) return
    recordBookingInquiry(isoDate, '', source).catch(() => {})
  }

  function closeSheet() {
    setSheet(null)
    setSelectedSlotId('')
    setError('')
  }

  function openSheet(slot, state) {
    const when = istanbulDateTime(slot.starts_at)
    setSheet(sheetFor(state?.member, when.date, slot.session_type, groupSeatOpen(slot)))
  }

  async function onSlotClick(slot) {
    setSelectedSlotId(slot.id)
    setNotice('')
    setError('')
    setLoginPrompt(false)

    if (!authUserRef.current || memberState?.profile_complete !== true) {
      writePendingSlot(slot)
      if (!authUserRef.current) {
        setLoginPrompt(true)
        return
      }
      window.location.assign('/hesabim?next=book')
      return
    }

    clearPendingSlot()
    setSheet('checking')
    try {
      const next = await refreshMember()
      if (next?.profile_complete !== true) {
        writePendingSlot(slot)
        window.location.assign('/hesabim?next=book')
        return
      }
      openSheet(slot, next)
    } catch (lookupError) {
      setSheet(null)
      setError(messageOf(lookupError))
    }
  }

  function declineTrial() {
    const credits = creditsOnDate(member?.packages, selectedDate, selectedSlot?.session_type)
    setSheet(credits > 0 ? 'credits' : 'packages')
  }

  function openTrialForm() {
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      if (selectedSlot) writePendingSlot(selectedSlot)
      if (!authUserRef.current) {
        setLoginPrompt(true)
        return
      }
      window.location.assign('/hesabim?next=book')
      return
    }
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
    setError('')
    setNotice('')
    setSheet('trial-form')
  }

  async function submitTrial(event) {
    event.preventDefault()
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      if (selectedSlot) writePendingSlot(selectedSlot)
      window.location.assign('/hesabim?next=book')
      return
    }
    const bookedSlot = startSlots.find((item) => item.id === trialSlotId) || selectedSlot
    const groupOpen = bookedSlot?.session_type === 'group'
      && bookedSlot.status === 'open'
      && (bookedSlot.booked_count ?? 0) < (bookedSlot.capacity ?? 0)
    if (!groupOpen) {
      setError('Deneme antrenmanı yalnız boş grup saatine yazılır')
      return
    }

    setActionBusy(true)
    setError('')
    setNotice('')

    try {
      await registerTrialLesson({
        firstName: '',
        lastName: '',
        phone: '',
        slotId: bookedSlot.id,
      })
      await refreshMember()
      await reloadSlots()
      setSheet(null)
      setSelectedSlotId('')
      setTrialSlotId('')
      notifyMemberChanged()
      setNotice('Deneme antrenmanın bu grup saatine kaydedildi.')
    } catch (trialError) {
      const text = messageOf(trialError)
      if (text === 'Bu telefonla kayıtlı üyelik var') {
        const next = await refreshMember()
        const returning = next?.member?.has_taken_lessons
          || next?.member?.trial_used
          || next?.member?.has_paid_package
        setSheet('packages')
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
    if (!selectedSlot) return
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      writePendingSlot(selectedSlot)
      if (!authUserRef.current) {
        setLoginPrompt(true)
        return
      }
      window.location.assign('/hesabim?next=book')
      return
    }

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
      if (text === 'Üye bulunamadı' || text === 'Önce bilgilerini tamamla') {
        writePendingSlot(selectedSlot)
        window.location.assign('/hesabim?next=book')
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

  function chooseDay(isoDate) {
    if (!dates.includes(isoDate)) return
    if (isoDate === selectedDateRef.current) {
      const moved = centerDay(dayRowRef.current, dayChipRefs.current.get(isoDate), 'smooth')
      programmaticScroll.current = moved
      if (moved) window.setTimeout(() => { programmaticScroll.current = false }, 480)
      return
    }
    selectedDateRef.current = isoDate
    setSelectedDate(isoDate)
    setSelectedSlotId('')
    setSlotsBusy(true)
    rememberInquiry(isoDate, 'day')
    if (checkoutKind === 'trial' && (sheet === 'start-time' || sheet === 'trial-form')) {
      pickStartDay(isoDate)
      return
    }
    setSheet(null)
  }
  chooseDayRef.current = chooseDay

  function moveDay(step) {
    const index = dates.indexOf(selectedDateRef.current)
    const next = dates[index + step]
    if (!next) return
    chooseDay(next)
    dayChipRefs.current.get(next)?.focus({ preventScroll: true })
  }

  function onDayKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveDay(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveDay(-1)
    }
  }

  const selectedIndex = Math.max(0, dates.indexOf(selectedDate))

  return (
    <div className="booking-form">
      <MemberSummary user={authUser} />
      <div className="day-scroller">
        <button
          type="button"
          className="day-arrow day-arrow--prev"
          aria-label="Önceki gün"
          disabled={selectedIndex === 0}
          onClick={() => moveDay(-1)}
        >
          ‹
        </button>
        <div
          ref={dayRowRef}
          className="day-row"
          role="tablist"
          aria-label="Gün seç"
          onKeyDown={onDayKeyDown}
        >
          {dates.map((isoDate) => {
            const parts = dayChipParts(isoDate)
            const empty = dayIsEmpty(isoDate, clock)
            const selected = isoDate === selectedDate
            return (
              <button
                key={isoDate}
                ref={(node) => {
                  if (node) dayChipRefs.current.set(isoDate, node)
                  else dayChipRefs.current.delete(isoDate)
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-date={isoDate}
                className={`day-chip${selected ? ' active' : ''}${empty ? ' is-empty' : ''}`}
                onClick={() => chooseDay(isoDate)}
              >
                <span className="day-chip-name">{parts.weekday}</span>
                <span className="day-chip-date">{parts.date}</span>
                {empty && <span className="day-chip-note">Ders yok</span>}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="day-arrow day-arrow--next"
          aria-label="Sonraki gün"
          disabled={selectedIndex === dates.length - 1}
          onClick={() => moveDay(1)}
        >
          ›
        </button>
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

      {selectedSlot && sheet && (
        <section
          ref={sheetRef}
          className="slot-sheet"
          tabIndex={-1}
          aria-labelledby="slot-sheet-title"
          aria-busy={actionBusy}
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
                <button type="button" className="cta" onClick={openTrialForm} disabled={actionBusy}>
                  Deneme antrenmanına kaydol
                </button>
                <button type="button" className="cta ghost" onClick={declineTrial} disabled={actionBusy}>
                  Deneme istemiyorum
                </button>
              </div>
            </div>
          )}

          {sheet === 'trial-form' && (
            <form className="sheet-block" onSubmit={submitTrial}>
              <p className="sheet-copy">Deneme antrenmanın bu grup saatine yazılacak.</p>
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
      {error && <p className="field-error" role="alert">{error}</p>}

      {loginPrompt && (
        <div
          className="login-modal-backdrop"
          onMouseDown={() => {
            clearPendingSlot()
            setLoginPrompt(false)
          }}
        >
          <div
            className="login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-prompt-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="login-prompt-title">Bu dersi ayırmak için giriş yap</h2>
            <div className="sheet-actions">
              <a ref={loginLinkRef} className="cta cta-primary" href="/hesabim?next=book">
                Giriş yap / Kayıt ol
              </a>
              <button
                type="button"
                className="cta ghost"
                onClick={() => {
                  clearPendingSlot()
                  setLoginPrompt(false)
                }}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BookingPanel

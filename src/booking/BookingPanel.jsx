import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bookSession,
  fetchAvailableTeachers,
  fetchBookableSlots,
  fetchMemberState,
  messageOf,
  recordBookingInquiry,
  registerTrialLesson,
  requestPackagePurchase,
} from './bookingApi.js'
import MonthCalendar from './MonthCalendar.jsx'
import PackageTerms from './PackageTerms.jsx'
import {
  groupSlotsByDate,
  monthBounds,
  monthKeyFromIso,
  openSlotCount,
  shiftMonth,
  formatDayHeading,
} from './bookingCalendar.js'
import { notifyMemberChanged } from './dashboardApi.js'
import MemberSummary from './MemberSummary.jsx'
import {
  PACKAGE_OPTIONS,
  creditsOnDate,
  futureCreditPackage,
  occupancyLabel,
  packageLead,
  sheetFor,
} from './sheetFlow.js'
import {
  addIsoDays,
  formatStudioWhen,
  istanbulDateTime,
  isSlotFull,
  todayIso,
} from './slotRules.js'

async function fetchSpan(from, to) {
  try {
    return await fetchBookableSlots(from, to)
  } catch (error) {
    if (!String(error?.message || '').includes('Geçersiz tarih aralığı')) throw error
    const rows = []
    let cursor = from
    while (cursor <= to) {
      const end = addIsoDays(cursor, 14)
      const chunkTo = end > to ? to : end
      rows.push(...await fetchBookableSlots(cursor, chunkTo))
      cursor = addIsoDays(chunkTo, 1)
    }
    return rows
  }
}

const STEPS = ['Gün', 'Saat', 'Öğretmen', 'Onay']

const PACKAGE_CARDS = [
  { kind: 'pack_8', title: "8'li", price: '8.000 TL', detail: 'Grup dersi' },
  { kind: 'pack_12', title: "12'li", price: '11.500 TL', detail: 'Grup dersi' },
  { kind: 'private_single', title: 'Özel ders', price: '', detail: '2 kişi' },
]

try {
  sessionStorage.removeItem('alsancak-booking-phone')
} catch {
  // Private browsing can reject storage. Auth still lives in the Supabase session.
}

function readPendingSlot() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('pending_slot') || 'null')
    if (!parsed?.slot_id || !parsed?.starts_at) return null
    const teacherId = parsed.teacher_id || parsed.instructor_id || ''
    return {
      slot_id: parsed.slot_id,
      starts_at: parsed.starts_at,
      teacher_id: teacherId,
    }
  } catch {
    return null
  }
}

function writePendingSlot(slot, teacherId) {
  try {
    sessionStorage.setItem('pending_slot', JSON.stringify({
      slot_id: slot.id,
      starts_at: slot.starts_at,
      instructor_id: teacherId || null,
      teacher_id: teacherId || null,
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

function slotsOn(rows, isoDate) {
  return (rows || []).filter((slot) => istanbulDateTime(slot.starts_at).date === isoDate)
}

function BookingPanel({ authUser = null }) {
  const initialMonth = monthKeyFromIso(todayIso())
  const [monthKey, setMonthKey] = useState(initialMonth)
  const [slotCache, setSlotCache] = useState(() => new Map())
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [teachers, setTeachers] = useState([])
  const [teachersBusy, setTeachersBusy] = useState(false)
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [memberState, setMemberState] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [slotsBusy, setSlotsBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [termsAccepted, setTermsAccepted] = useState(false)
  const cacheRef = useRef(new Map())
  const pickedInitial = useRef(false)
  const authUserRef = useRef(authUser)
  const sheetRef = useRef(null)
  const timesRef = useRef(null)
  const loginLinkRef = useRef(null)
  const autoBooked = useRef(false)
  authUserRef.current = authUser

  const monthSlots = slotCache.get(monthKey) || []
  const grouped = useMemo(
    () => groupSlotsByDate(monthSlots, istanbulDateTime),
    [monthSlots],
  )
  const slotCounts = useMemo(() => {
    const counts = new Map()
    grouped.forEach((list, iso) => counts.set(iso, list.length))
    return counts
  }, [grouped])
  const openCounts = useMemo(() => {
    const counts = new Map()
    grouped.forEach((list, iso) => counts.set(iso, openSlotCount(list)))
    return counts
  }, [grouped])

  const daySlots = slotsOn(monthSlots, selectedDate)
  const times = [...new Set(daySlots.map((slot) => istanbulDateTime(slot.starts_at).time))].sort()
  const selectedSlot = daySlots.find((slot) => slot.id === selectedSlotId)
    || (slotCache.size
      ? [...slotCache.values()].flat().find((slot) => slot.id === selectedSlotId)
      : null)
    || null
  const member = memberState?.member ?? null
  const sessionType = selectedSlot?.session_type ?? null
  const usableCredits = creditsOnDate(member?.packages, selectedDate, sessionType)
  const datedCredits = creditsOnDate(member?.packages, selectedDate)
  const step = !selectedDate ? 1 : !selectedSlotId ? 2 : !teacherId ? 3 : 4
  const canPrev = (slotCache.get(shiftMonth(monthKey, -1)) || []).length > 0
  const canNext = (slotCache.get(shiftMonth(monthKey, 1)) || []).length > 0

  useEffect(() => {
    let ignore = false
    const keys = [shiftMonth(monthKey, -1), monthKey, shiftMonth(monthKey, 1)]
    setSlotsBusy(true)
    Promise.all(keys.map(async (key) => {
      if (cacheRef.current.has(key)) return
      const { from, to } = monthBounds(key)
      const rows = await fetchSpan(from, to)
      cacheRef.current.set(key, rows)
    }))
      .then(() => {
        if (ignore) return
        setSlotCache(new Map(cacheRef.current))
        setClock(Date.now())
      })
      .catch((lookupError) => {
        if (!ignore) setError(messageOf(lookupError))
      })
      .finally(() => {
        if (!ignore) setSlotsBusy(false)
      })
    return () => {
      ignore = true
    }
  }, [monthKey])

  useEffect(() => {
    if (pickedInitial.current || slotsBusy) return undefined
    if (!cacheRef.current.has(monthKey) || !cacheRef.current.has(shiftMonth(monthKey, 1))) return undefined
    const pending = readPendingSlot()
    if (pending?.starts_at) {
      const when = istanbulDateTime(pending.starts_at)
      pickedInitial.current = true
      setMonthKey(monthKeyFromIso(when.date))
      setSelectedDate(when.date)
      return undefined
    }
    const keys = [monthKey, shiftMonth(monthKey, 1)]
    for (const key of keys) {
      const dates = [...new Set((cacheRef.current.get(key) || [])
        .map((slot) => istanbulDateTime(slot.starts_at).date))].sort()
      if (dates[0]) {
        pickedInitial.current = true
        if (key !== monthKey) setMonthKey(key)
        setSelectedDate(dates[0])
        return undefined
      }
    }
    pickedInitial.current = true
    return undefined
  }, [slotsBusy, slotCache, monthKey])

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
    if (!selectedSlotId) {
      setTeachers([])
      return undefined
    }
    let ignore = false
    setTeachersBusy(true)
    fetchAvailableTeachers(selectedSlotId)
      .then((rows) => {
        if (!ignore) setTeachers(rows)
      })
      .catch((lookupError) => {
        if (!ignore) setError(messageOf(lookupError))
      })
      .finally(() => {
        if (!ignore) setTeachersBusy(false)
      })
    return () => {
      ignore = true
    }
  }, [selectedSlotId])

  useEffect(() => {
    if (!sheet) return undefined
    sheetRef.current?.focus({ preventScroll: true })
    return undefined
  }, [sheet, selectedSlotId, teacherId])

  useEffect(() => {
    if (!loginPrompt) return undefined
    loginLinkRef.current?.focus()
    return undefined
  }, [loginPrompt])

  async function refreshMember() {
    const next = await fetchMemberState()
    setMemberState(next)
    setClock(Date.now())
    return next
  }

  async function reloadMonth(key = monthKey) {
    const { from, to } = monthBounds(key)
    const rows = await fetchSpan(from, to)
    cacheRef.current.set(key, rows)
    setSlotCache(new Map(cacheRef.current))
    setClock(Date.now())
    return rows
  }

  function rememberInquiry(isoDate) {
    if (!isoDate) return
    recordBookingInquiry(isoDate, '', 'day').catch(() => {})
  }

  function chooseDay(isoDate) {
    const rows = cacheRef.current.get(monthKeyFromIso(isoDate)) || []
    if (!slotsOn(rows, isoDate).length) return
    setSelectedDate(isoDate)
    setSelectedSlotId('')
    setTeacherId('')
    setSheet(null)
    setError('')
    setNotice('')
    rememberInquiry(isoDate)
    if (window.matchMedia('(max-width: 768px)').matches) {
      window.setTimeout(() => {
        timesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 40)
    }
  }

  function chooseTime(slot) {
    if (!slot || isSlotFull(slot.session_type, slot.booked_count) || slot.status !== 'open') return
    setSelectedSlotId(slot.id)
    setTeacherId('')
    setSheet(null)
    setError('')
    setNotice('')
    setLoginPrompt(false)
  }

  function clearTime() {
    setSelectedSlotId('')
    setTeacherId('')
    setSheet(null)
    setError('')
  }

  function openSheet(slot, state) {
    const when = istanbulDateTime(slot.starts_at)
    const groupOpen = slot.session_type === 'group'
      && slot.status === 'open'
      && (slot.booked_count ?? 0) < (slot.capacity ?? 0)
    setSheet(sheetFor(state?.member, when.date, slot.session_type, groupOpen))
  }

  async function chooseTeacher(person) {
    if (!selectedSlot || !person?.id) return
    setTeacherId(person.id)
    setNotice('')
    setError('')
    setLoginPrompt(false)

    if (!authUserRef.current || memberState?.profile_complete !== true) {
      writePendingSlot(selectedSlot, person.id)
      if (!authUserRef.current) {
        setLoginPrompt(true)
        setSheet(null)
        return
      }
      window.location.assign('/hesabim?next=book')
      return
    }

    setSheet('checking')
    try {
      const next = await refreshMember()
      if (next?.profile_complete !== true) {
        writePendingSlot(selectedSlot, person.id)
        window.location.assign('/hesabim?next=book')
        return
      }
      clearPendingSlot()
      openSheet(selectedSlot, next)
    } catch (lookupError) {
      setSheet(null)
      setError(messageOf(lookupError))
    }
  }

  useEffect(() => {
    if (autoBooked.current || !authUser || !memberState || slotsBusy || teachersBusy) return undefined
    const pending = readPendingSlot()
    if (!pending?.teacher_id) return undefined
    const when = istanbulDateTime(pending.starts_at)
    if (selectedDate !== when.date) return undefined
    const slot = slotsOn(cacheRef.current.get(monthKeyFromIso(when.date)) || [], when.date)
      .find((item) => item.id === pending.slot_id)
    if (!slot) return undefined
    if (memberState.profile_complete !== true) return undefined
    if (selectedSlotId !== slot.id) {
      setSelectedSlotId(slot.id)
      return undefined
    }
    if (!teachers.some((person) => person.id === pending.teacher_id)) return undefined
    if (teacherId !== pending.teacher_id) {
      setTeacherId(pending.teacher_id)
      return undefined
    }
    const credits = creditsOnDate(memberState.member?.packages, when.date, slot.session_type)
    if (credits > 0) {
      autoBooked.current = true
      clearPendingSlot()
      setActionBusy(true)
      bookSession(slot.id, pending.teacher_id)
        .then(async () => {
          await refreshMember()
          await reloadMonth(monthKeyFromIso(when.date))
          notifyMemberChanged()
          setSheet(null)
          setSelectedSlotId('')
          setTeacherId('')
          setNotice('Yerin tutuldu.')
        })
        .catch((bookError) => {
          setError(messageOf(bookError))
          setSheet('packages')
        })
        .finally(() => setActionBusy(false))
      return undefined
    }
    clearPendingSlot()
    openSheet(slot, memberState)
    return undefined
  }, [
    authUser,
    memberState,
    slotsBusy,
    teachersBusy,
    teachers,
    selectedDate,
    selectedSlotId,
    teacherId,
  ])

  function declineTrial() {
    const credits = creditsOnDate(member?.packages, selectedDate, selectedSlot?.session_type)
    setSheet(credits > 0 ? 'credits' : 'packages')
  }

  function openTrialForm() {
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      if (selectedSlot) writePendingSlot(selectedSlot, teacherId)
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

  async function submitTrial(event) {
    event.preventDefault()
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      if (selectedSlot) writePendingSlot(selectedSlot, teacherId)
      window.location.assign('/hesabim?next=book')
      return
    }
    const groupOpen = selectedSlot?.session_type === 'group'
      && selectedSlot.status === 'open'
      && (selectedSlot.booked_count ?? 0) < (selectedSlot.capacity ?? 0)
    if (!teacherId || !selectedSlot || !groupOpen) {
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
        slotId: selectedSlot.id,
        instructorId: teacherId,
      })
      await refreshMember()
      await reloadMonth()
      setSheet(null)
      setSelectedSlotId('')
      setTeacherId('')
      notifyMemberChanged()
      setNotice('Deneme antrenmanın bu grup saatine kaydedildi.')
    } catch (trialError) {
      const text = messageOf(trialError)
      if (text === 'Bu telefonla kayıtlı üyelik var') {
        setSheet('packages')
        setNotice('Kaydın bulundu. Paketini seçebilirsin.')
      } else {
        setError(text)
      }
    } finally {
      setActionBusy(false)
    }
  }

  async function selectPackage(kind) {
    if (!PACKAGE_OPTIONS.some((option) => option.kind === kind) && kind !== 'private_single') return
    if (!termsAccepted) {
      setError('Paket koşullarını kabul etmelisin')
      return
    }
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      if (selectedSlot) writePendingSlot(selectedSlot, teacherId)
      if (!authUserRef.current) {
        setLoginPrompt(true)
        return
      }
      window.location.assign('/hesabim?next=book')
      return
    }
    if (selectedSlot) writePendingSlot(selectedSlot, teacherId)
    setActionBusy(true)
    setError('')
    try {
      await requestPackagePurchase(kind, true)
      setNotice('Paket talebin alındı. Ödeme onaylanınca bu ders yazılır.')
      setSheet(null)
    } catch (purchaseError) {
      setError(messageOf(purchaseError))
    } finally {
      setActionBusy(false)
    }
  }

  async function holdSeat() {
    if (!selectedSlot || !teacherId) {
      setError('Bu saatte müsait öğretmen yok, başka saat seç')
      return
    }
    if (!authUserRef.current || memberState?.profile_complete !== true) {
      writePendingSlot(selectedSlot, teacherId)
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
      await bookSession(selectedSlot.id, teacherId)
      clearPendingSlot()
      setSelectedSlotId('')
      setTeacherId('')
      setSheet(null)
      await refreshMember()
      await reloadMonth()
      notifyMemberChanged()
      setNotice('Yerin tutuldu.')
    } catch (bookError) {
      const text = messageOf(bookError)
      if (text === 'Üye bulunamadı' || text === 'Önce bilgilerini tamamla') {
        writePendingSlot(selectedSlot, teacherId)
        window.location.assign('/hesabim?next=book')
      } else if (text === 'Ders almak için paket seçmelisin') {
        writePendingSlot(selectedSlot, teacherId)
        setSheet('packages')
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

  const savedNotice = notice === 'Yerin tutuldu.'
    || notice === 'Deneme antrenmanın bu grup saatine kaydedildi.'
  const badge = selectedSlot?.session_type === 'private' ? 'Özel ders' : 'Grup'

  return (
    <div className="booking-form">
      <MemberSummary user={authUser} />
      <ol className="booking-steps" aria-label="Rezervasyon adımları">
        {STEPS.map((label, index) => {
          const number = index + 1
          const className = number === step ? 'is-current' : number < step ? 'is-done' : ''
          return (
            <li key={label} className={className}>
              <span>{number}</span>
              {label}
            </li>
          )
        })}
      </ol>

      <div className="booking-schedule">
        <MonthCalendar
          monthKey={monthKey}
          selectedDate={selectedDate}
          today={todayIso(clock)}
          slotCounts={slotCounts}
          openCounts={openCounts}
          canPrev={canPrev}
          canNext={canNext}
          onMonth={(delta) => {
            const next = shiftMonth(monthKey, delta)
            const rows = slotCache.get(next) || []
            if (!rows.length) return
            setMonthKey(next)
            setSelectedSlotId('')
            setTeacherId('')
            setSheet(null)
          }}
          onSelect={chooseDay}
        />

        <div ref={timesRef} className="booking-times" aria-busy={slotsBusy}>
          <h3 className="booking-times-title">
            {selectedDate ? formatDayHeading(selectedDate) : 'Gün seç'}
          </h3>
          {!selectedDate && <p className="sheet-copy">Takvimden müsait bir gün seç.</p>}
          {selectedDate && !slotsBusy && times.length === 0 && (
            <p className="sheet-copy">Bu gün için açık ders yok</p>
          )}
          {times.length > 0 && (
            <div className="time-grid">
              {times.map((time) => {
                const pair = daySlots.filter((slot) => istanbulDateTime(slot.starts_at).time === time)
                return (
                  <div key={time} className="time-slot" role="group" aria-label={time}>
                    <strong>{time}</strong>
                    {['private', 'group'].map((kind) => {
                      const slot = pair.find((item) => item.session_type === kind)
                      const bookable = Boolean(slot) && (slot.status === 'open' || slot.status === 'full')
                      const open = bookable
                        && slot.status === 'open'
                        && !isSlotFull(slot.session_type, slot.booked_count)
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={slot?.id === selectedSlotId ? 'time-kind active' : 'time-kind'}
                          disabled={!open || actionBusy}
                          onClick={() => chooseTime(slot)}
                        >
                          {occupancyLabel(bookable ? slot : null, false)}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {selectedSlot && (
        <section className="teacher-step" aria-labelledby="teacher-step-title">
          <h3 id="teacher-step-title">Öğretmen seç</h3>
          {teachersBusy && <p className="sheet-copy">Öğretmenler yükleniyor.</p>}
          {!teachersBusy && teachers.length === 0 && (
            <div className="sheet-block">
              <p className="sheet-copy">Bu saatte müsait öğretmen yok, başka saat seç</p>
              <button type="button" className="cta ghost" onClick={clearTime}>Başka saat seç</button>
            </div>
          )}
          {teachers.length > 0 && (
            <div className="teacher-grid">
              {teachers.map((person) => {
                const selected = person.id === teacherId
                return (
                  <button
                    key={person.id}
                    type="button"
                    className={selected ? 'teacher-card is-selected' : 'teacher-card'}
                    aria-pressed={selected}
                    onClick={() => chooseTeacher(person)}
                    disabled={actionBusy}
                  >
                    <strong>{person.full_name}</strong>
                    <span className="teacher-badge">{badge}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {selectedSlot && teacherId && sheet && (
        <section
          ref={sheetRef}
          className="slot-sheet"
          tabIndex={-1}
          aria-labelledby="slot-sheet-title"
          aria-busy={actionBusy}
        >
          <p className="sheet-kicker">{occupancyLabel(selectedSlot, false)}</p>
          <h3 id="slot-sheet-title">{formatStudioWhen(selectedSlot.starts_at)}</h3>
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
                <button type="submit" className="cta" disabled={actionBusy || !teacherId}>
                  {actionBusy ? 'Kaydediliyor' : 'Onayla'}
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
                {PACKAGE_CARDS.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    className="choice-card"
                    onClick={() => selectPackage(option.kind)}
                    disabled={actionBusy || !termsAccepted}
                  >
                    <span className="choice-index">{option.price || 'ÖZ'}</span>
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.detail}{option.price ? ` · ${option.price}` : ''}</small>
                    </span>
                  </button>
                ))}
                {!member?.trial_used && !member?.has_taken_lessons && !member?.has_paid_package && (
                  <button type="button" className="choice-card" onClick={openTrialForm}>
                    <span className="choice-index">01</span>
                    <span>
                      <strong>Deneme dersi</strong>
                      <small>Grup dersi, ücretsiz</small>
                    </span>
                  </button>
                )}
              </div>
              <a className="text-button" href="#fiyatlar">Fiyat kartlarına git</a>
              <PackageTerms />
              <label className="terms-check">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                />
                <span>Paket koşullarını okudum, kabul ediyorum</span>
              </label>
              <button type="button" className="text-button sheet-check" onClick={() => setSheet(null)}>
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
                  disabled={actionBusy || Boolean(holdBlock) || !teacherId}
                >
                  {actionBusy ? 'Kaydediliyor' : 'Yerini tut'}
                </button>
                <button type="button" className="cta ghost" onClick={() => setSheet(null)}>
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

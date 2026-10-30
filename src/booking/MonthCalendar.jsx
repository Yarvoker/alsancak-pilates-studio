import { useEffect, useState } from 'react'
import { addIsoDays } from './slotRules.js'
import {
  formatDayAria,
  formatMonthTitle,
  monthCells,
  weekdayLabels,
} from './bookingCalendar.js'

function MonthCalendar({
  monthKey,
  selectedDate,
  today,
  slotCounts,
  openCounts,
  canPrev,
  canNext,
  onMonth,
  onSelect,
}) {
  const cells = monthCells(monthKey)
  const [focused, setFocused] = useState(selectedDate || today || '')

  useEffect(() => {
    if (selectedDate) setFocused(selectedDate)
  }, [selectedDate])

  function moveFocus(isoDate) {
    if (!cells.some((cell) => cell.iso === isoDate)) return
    setFocused(isoDate)
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-cal="${isoDate}"]`)?.focus()
    })
  }

  function onKeyDown(event, isoDate) {
    const step = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }[event.key]
    if (!step) return
    event.preventDefault()
    moveFocus(addIsoDays(isoDate, step))
  }

  return (
    <div className="month-cal">
      <div className="month-cal-bar">
        <button
          type="button"
          className="month-cal-arrow"
          aria-label="Önceki ay"
          disabled={!canPrev}
          onClick={() => onMonth(-1)}
        >
          ‹
        </button>
        <h3 className="month-cal-title">{formatMonthTitle(monthKey)}</h3>
        <button
          type="button"
          className="month-cal-arrow"
          aria-label="Sonraki ay"
          disabled={!canNext}
          onClick={() => onMonth(1)}
        >
          ›
        </button>
      </div>
      <div
        className="month-cal-grid"
        role="grid"
        aria-label={`${formatMonthTitle(monthKey)} takvimi`}
      >
        <div className="month-cal-week" role="row">
          {weekdayLabels().map((label) => (
            <div key={label} className="month-cal-dow" role="columnheader">
              {label}
            </div>
          ))}
        </div>
        {Array.from({ length: cells.length / 7 }, (_, week) => (
          <div className="month-cal-week" role="row" key={cells[week * 7].iso}>
            {cells.slice(week * 7, week * 7 + 7).map((cell) => {
              const any = slotCounts?.get(cell.iso) || 0
              const open = openCounts?.get(cell.iso) || 0
              const bookable = cell.inMonth && any > 0
              const selected = cell.iso === selectedDate
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  data-cal={cell.iso}
                  className={[
                    'month-cal-day',
                    cell.inMonth ? '' : 'is-outside',
                    cell.iso === today ? 'is-today' : '',
                    selected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={bookable ? formatDayAria(cell.iso, open) : `${formatDayAria(cell.iso, 0).replace(/, 0 müsait ders$/, '')}, kapalı`}
                  aria-selected={selected}
                  aria-disabled={!bookable}
                  tabIndex={cell.iso === focused ? 0 : -1}
                  onKeyDown={(event) => onKeyDown(event, cell.iso)}
                  onClick={() => {
                    if (bookable) onSelect(cell.iso)
                  }}
                >
                  {Number(cell.iso.slice(8))}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default MonthCalendar

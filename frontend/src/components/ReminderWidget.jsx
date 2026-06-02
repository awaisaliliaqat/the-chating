/**
 * ReminderWidget — create and manage personal reminders.
 *
 * Props:
 *   reminders   {Array}    — controlled list: [{ id, message, datetime }]
 *   onAdd       {Function} — (reminder) => void — called with new reminder object
 *   onDelete    {Function} — (id) => void
 *
 * All persistence is handled by the parent; this component is purely presentational
 * + form logic. Use localStorage or a backend endpoint in the parent.
 */
import { useState, useId } from 'react'
import s from './ReminderWidget.module.css'

/** Formats a stored ISO datetime string into a readable label. */
function formatDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()

  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${timePart}`

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth()    === tomorrow.getMonth()    &&
    d.getDate()     === tomorrow.getDate()
  if (isTomorrow) return `Tomorrow at ${timePart}`

  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${timePart}`
}

/** Returns true when the reminder datetime is in the past. */
function isPast(iso) {
  return iso && new Date(iso).getTime() < Date.now()
}

/** Min value for the datetime-local input (now, rounded to the next minute). */
function nowInputValue() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  // datetime-local format: "YYYY-MM-DDTHH:MM"
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ReminderWidget({ reminders = [], onAdd, onDelete }) {
  const formId = useId()
  const [message, setMessage]   = useState('')
  const [datetime, setDatetime] = useState('')
  const [error, setError]       = useState('')

  const upcoming = reminders
    .filter(r => !isPast(r.datetime))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))

  const past = reminders
    .filter(r => isPast(r.datetime))
    .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const trimmed = message.trim()
    if (!trimmed) { setError('Please enter a reminder message.'); return }
    if (!datetime) { setError('Please pick a date and time.'); return }
    if (new Date(datetime).getTime() <= Date.now()) {
      setError('Please choose a time in the future.'); return
    }

    onAdd?.({
      id:       crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      message:  trimmed,
      datetime, // ISO string as returned by datetime-local input
    })

    setMessage('')
    setDatetime('')
  }

  return (
    <section className={s.widget} aria-label="Reminders">
      <header className={s.header}>
        <span className={s.headerIcon} aria-hidden="true">🔔</span>
        <h3 className={s.title}>Reminders</h3>
        {upcoming.length > 0 && (
          <span className={s.countBadge}>{upcoming.length}</span>
        )}
      </header>

      {/* Add form */}
      <form className={s.form} onSubmit={handleSubmit} id={formId} noValidate>
        <textarea
          className={s.textarea}
          placeholder="Remind me to…"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          maxLength={280}
          aria-label="Reminder message"
        />
        <div className={s.formRow}>
          <input
            type="datetime-local"
            className={s.dateInput}
            value={datetime}
            min={nowInputValue()}
            onChange={e => setDatetime(e.target.value)}
            aria-label="Reminder date and time"
          />
          <button type="submit" className={s.addBtn} title="Add reminder">
            + Add
          </button>
        </div>
        {error && <p className={s.error} role="alert">{error}</p>}
      </form>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <ul className={s.list} aria-label="Upcoming reminders">
          {upcoming.map(r => (
            <ReminderItem key={r.id} reminder={r} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <p className={s.empty}>No reminders yet. Add one above.</p>
      )}

      {/* Past reminders (collapsed visually) */}
      {past.length > 0 && (
        <details className={s.pastSection}>
          <summary className={s.pastSummary}>
            Past reminders ({past.length})
          </summary>
          <ul className={s.list} aria-label="Past reminders">
            {past.map(r => (
              <ReminderItem key={r.id} reminder={r} onDelete={onDelete} past />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function ReminderItem({ reminder, onDelete, past = false }) {
  return (
    <li className={`${s.item} ${past ? s.pastItem : ''}`}>
      <span className={s.itemIcon} aria-hidden="true">{past ? '✓' : '⏰'}</span>
      <div className={s.itemBody}>
        <p className={s.itemMessage}>{reminder.message}</p>
        <time
          className={s.itemTime}
          dateTime={reminder.datetime}
          title={new Date(reminder.datetime).toLocaleString()}
        >
          {formatDatetime(reminder.datetime)}
        </time>
      </div>
      <button
        className={s.deleteBtn}
        onClick={() => onDelete?.(reminder.id)}
        title="Delete reminder"
        aria-label={`Delete reminder: ${reminder.message}`}
      >
        ✕
      </button>
    </li>
  )
}

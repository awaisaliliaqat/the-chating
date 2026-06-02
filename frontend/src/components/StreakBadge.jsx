/**
 * StreakBadge — compact streak indicator shown next to friend names.
 *
 * Props:
 *   streak      {number}  — consecutive days both sides sent a message (default 0)
 *   lastActivity{Date|string|null} — timestamp of the last message in the thread
 *   size        {'sm'|'md'} — 'sm' for conversation list, 'md' for chat header
 */
import s from './StreakBadge.module.css'

/** Returns milliseconds remaining until the 24-hour window closes, or null. */
function msUntilBreak(lastActivity) {
  if (!lastActivity) return null
  const last = new Date(lastActivity).getTime()
  const expiry = last + 24 * 60 * 60 * 1000
  const remaining = expiry - Date.now()
  return remaining > 0 ? remaining : null
}

/** Format remaining time as a short human string, e.g. "4h 12m". */
function formatRemaining(ms) {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function StreakBadge({ streak = 0, lastActivity = null, size = 'sm' }) {
  // No badge at all if streak hasn't started
  if (streak < 1) return null

  const remaining = msUntilBreak(lastActivity)
  const isWarning = remaining !== null && remaining < 4 * 60 * 60 * 1000 // < 4 h
  const isCritical = remaining !== null && remaining < 60 * 60 * 1000    // < 1 h
  const isExpired = lastActivity && remaining === null && streak > 0

  const cls = [
    s.badge,
    s[size],
    isWarning ? s.warning : '',
    isCritical ? s.critical : '',
    isExpired ? s.expired : '',
  ].filter(Boolean).join(' ')

  const label = isExpired
    ? `${streak} day streak — send a message to keep it!`
    : isWarning
    ? `${streak} day streak — ${formatRemaining(remaining)} left!`
    : `${streak} day streak`

  return (
    <span className={cls} title={label} role="img" aria-label={label}>
      <span className={s.fire} aria-hidden="true">🔥</span>
      <span className={s.count}>{streak}</span>
      {isWarning && (
        <span className={s.clock} aria-hidden="true">⏰</span>
      )}
    </span>
  )
}

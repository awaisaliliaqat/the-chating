import { useState, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './PollCard.module.css'

export default function PollCard({ poll: initialPoll, compact = false }) {
  const { api } = useContext(AppContext)
  const [poll, setPoll] = useState(initialPoll)
  const [voting, setVoting] = useState(false)

  async function vote(idx) {
    if (poll.is_closed || voting) return
    setVoting(true)
    try {
      const r = await api(`/polls/${poll.id}/vote`, { method:'POST', data:{ option_idx: idx } })
      setPoll(r.data)
    } catch { /* ignore */ }
    finally { setVoting(false) }
  }

  const options  = Array.isArray(poll.options) ? poll.options : JSON.parse(poll.options || '[]')
  const total    = poll.total_votes || 0
  const myVotes  = poll.my_votes   || []
  const counts   = poll.vote_counts || {}

  return (
    <div className={s.card}>
      <div className={s.header}>
        <span className={s.icon}>📊</span>
        <div>
          <div className={s.question}>{poll.question}</div>
          <div className={s.meta}>{total} vote{total !== 1 ? 's' : ''} {poll.is_closed ? '· Closed' : ''}</div>
        </div>
      </div>
      <div className={s.options}>
        {options.map((opt, i) => {
          const count   = counts[i] || 0
          const pct     = total > 0 ? Math.round((count / total) * 100) : 0
          const isVoted = myVotes.includes(i)
          return (
            <button key={i} className={`${s.option} ${isVoted?s.voted:''}`}
              onClick={() => vote(i)} disabled={poll.is_closed || voting}>
              <div className={s.optionBar} style={{width:`${pct}%`}} />
              <span className={s.optionText}>{opt}</span>
              <span className={s.optionPct}>{pct}%</span>
              {isVoted && <span className={s.check}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

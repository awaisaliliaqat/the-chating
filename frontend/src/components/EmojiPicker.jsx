import { useState, useRef, useEffect } from 'react'
import s from './EmojiPicker.module.css'

const CATEGORIES = {
  '😀': ['😀','😂','🤣','😍','🥰','😎','🤔','😮','😢','😡','🥺','😴','🤯','🥳','😇','🤗','😏','🙄','😤','😭','😱','😈','👻','💀','🤖','👽','🎃','💩'],
  '👋': ['👍','👎','👏','🙌','🤝','✌️','🤞','💪','🦾','🤜','🤛','👊','✊','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦋','🐝','🌹','🌺','🌸','🌼','🌻','🍀','🌈','⭐','🌟','💫','✨'],
  '🍕': ['🍕','🍔','🍟','🌮','🌯','🍜','🍣','🍩','🍪','🎂','🍦','🧁','🍫','🍬','🍭','☕','🧃','🍺','🥂','🎉','🎊','🎁','🎈','🎀','🏆','🥇','🎮','🎲'],
}

const QUICK = ['👍','❤️','😂','😮','😢','😡']

export function QuickReact({ onReact, onMore }) {
  return (
    <div className={s.quick}>
      {QUICK.map(e => (
        <button key={e} className={s.qBtn} onClick={() => onReact(e)}>{e}</button>
      ))}
      <button className={s.qMore} onClick={onMore}>+</button>
    </div>
  )
}

export default function EmojiPicker({ onPick, onClose }) {
  const [cat,    setCat]    = useState('😀')
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const allEmojis = Object.values(CATEGORIES).flat()
  const display   = search
    ? allEmojis.filter(e => e.includes(search))
    : CATEGORIES[cat] || []

  return (
    <div ref={ref} className={s.picker}>
      <input
        className={s.search}
        placeholder="Search emoji…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      {!search && (
        <div className={s.cats}>
          {Object.keys(CATEGORIES).map(c => (
            <button key={c} className={`${s.catBtn} ${cat===c?s.catActive:''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className={s.grid}>
        {display.map((e,i) => (
          <button key={i} className={s.eBtn} onClick={() => onPick(e)}>{e}</button>
        ))}
        {display.length === 0 && <div className={s.noResult}>No results</div>}
      </div>
    </div>
  )
}

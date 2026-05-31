import { useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './Toast.module.css'

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }

export default function Toast() {
  const { toasts, removeToast } = useContext(AppContext)
  return (
    <div className={s.container}>
      {toasts.map(t => (
        <div key={t.id} className={`${s.toast} ${s[t.type]}`} onClick={() => removeToast(t.id)}>
          <span className={s.icon}>{ICONS[t.type] || 'ℹ'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

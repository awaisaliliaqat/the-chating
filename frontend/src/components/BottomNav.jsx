import { useContext } from 'react'
import { NavLink } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import s from './BottomNav.module.css'

export default function BottomNav() {
  const { user } = useContext(AppContext)
  const unread  = user?.unread_count     || 0
  const pending = user?.pending_requests || 0

  return (
    <nav className={s.nav}>
      <NavLink to="/"               end className={({isActive})=>`${s.item} ${isActive?s.active:''}`}>
        <span className={s.icon}>⊞</span>
        <span className={s.label}>Home</span>
      </NavLink>

      <NavLink to="/messages"       className={({isActive})=>`${s.item} ${isActive?s.active:''}`}>
        <span className={s.iconWrap}>
          <span className={s.icon}>💬</span>
          {unread > 0 && <span className={s.badge}>{unread > 9 ? '9+' : unread}</span>}
        </span>
        <span className={s.label}>Chats</span>
      </NavLink>

      <NavLink to="/friends"        className={({isActive})=>`${s.item} ${isActive?s.active:''}`}>
        <span className={s.iconWrap}>
          <span className={s.icon}>👥</span>
          {pending > 0 && <span className={s.badge}>{pending}</span>}
        </span>
        <span className={s.label}>Friends</span>
      </NavLink>

      <NavLink to="/call-directory" className={({isActive})=>`${s.item} ${isActive?s.active:''}`}>
        <span className={s.icon}>📡</span>
        <span className={s.label}>Call</span>
      </NavLink>

      <NavLink to="/profile"        className={({isActive})=>`${s.item} ${isActive?s.active:''}`}>
        <span className={s.icon}>👤</span>
        <span className={s.label}>Profile</span>
      </NavLink>
    </nav>
  )
}

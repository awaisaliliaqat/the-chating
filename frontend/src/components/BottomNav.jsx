import { useContext } from 'react'
import { NavLink } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import s from './BottomNav.module.css'

const ADMIN_EMAILS = ['aariz123awais@gmail.com']

export default function BottomNav() {
  const { user } = useContext(AppContext)
  const unread  = user?.unread_count     || 0
  const pending = user?.pending_requests || 0
  const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase())

  const items = [
    { path: '/',              icon: '⊞',  label: 'Home',      end: true },
    { path: '/messages',      icon: '💬', label: 'Chats',     badge: unread },
    { path: '/friends',       icon: '👥', label: 'Friends',   badge: pending },
    { path: '/groups',        icon: '🫂', label: 'Groups' },
    { path: '/rooms',         icon: '🌐', label: 'Rooms' },
    { path: '/call-directory',icon: '📡', label: 'Call' },
    { path: '/contacts',      icon: '📒', label: 'Contacts' },
    { path: '/calls',         icon: '📞', label: 'History' },
    { path: '/profile',       icon: '👤', label: 'Profile' },
    { path: '/settings',      icon: '⚙️', label: 'Settings' },
    ...(isAdmin ? [{ path: '/admin', icon: '🛡️', label: 'Admin' }] : []),
  ]

  return (
    <nav className={s.nav}>
      {items.map(({ path, icon, label, badge, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          className={({ isActive }) => `${s.item} ${isActive ? s.active : ''}`}
        >
          <span className={s.iconWrap}>
            <span className={s.icon}>{icon}</span>
            {badge > 0 && (
              <span className={s.badge}>{badge > 9 ? '9+' : badge}</span>
            )}
          </span>
          <span className={s.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

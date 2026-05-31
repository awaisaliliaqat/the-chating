import { useContext } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from './Avatar'
import s from './Sidebar.module.css'

const NAV = [
  { path: '/',         icon: '⊞',  label: 'Home'     },
  { path: '/messages', icon: '💬', label: 'Messages'  },
  { path: '/friends',  icon: '👥', label: 'Friends'   },
  { path: '/contacts', icon: '📒', label: 'Contacts'  },
  { path: '/calls',    icon: '📞', label: 'Calls'     },
]

export default function Sidebar() {
  const { user, logout, onlineUsers, theme, toggleTheme } = useContext(AppContext)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const pendingReq = user?.pending_requests || 0
  const unread     = user?.unread_count     || 0

  return (
    <aside className={s.sidebar}>
      {/* Brand */}
      <div className={s.brand}>
        <span className={s.logo}>💬</span>
        <span className={s.brandName}>THE CHATING</span>
      </div>

      {/* Nav */}
      <nav className={s.nav}>
        {NAV.map(({ path, icon, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}
          >
            <span className={s.icon}>{icon}</span>
            <span className={s.label}>{label}</span>
            {label === 'Messages' && unread > 0 && (
              <span className={s.badge}>{unread > 99 ? '99+' : unread}</span>
            )}
            {label === 'Friends' && pendingReq > 0 && (
              <span className={s.badge}>{pendingReq}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className={s.bottom}>
        <button className={s.themeBtn} onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <NavLink to="/profile" className={({ isActive }) => `${s.profileLink} ${isActive ? s.active : ''}`}>
          <Avatar user={user} size={36} online={onlineUsers.has(user?.id)} />
          <div className={s.profileInfo}>
            <div className={s.profileName}>{user?.name}</div>
            <div className={s.profileStatus}>
              <span className={s.dot} />
              Online
            </div>
          </div>
        </NavLink>

        <button className={s.logoutBtn} onClick={handleLogout} title="Logout">⎋</button>
      </div>
    </aside>
  )
}

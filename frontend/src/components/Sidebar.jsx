import { useContext } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import Avatar from './Avatar'
import s from './Sidebar.module.css'

const NAV = [
  // ── Main ──
  { path: '/',         icon: '⊞',  label: 'Home'        },
  { path: '/feed',     icon: '📸', label: 'Feed'        },
  { path: '/messages', icon: '💬', label: 'Messages'    },
  { path: '/friends',  icon: '🤝', label: 'Friends'     },
  // ── Chat ──
  { path: '/groups',   icon: '👥', label: 'Groups'      },
  { path: '/rooms',    icon: '🌐', label: 'Rooms'       },
  { path: '/contacts', icon: '📒', label: 'Contacts'    },
  // ── Calls ──
  { path: '/call-directory', icon: '📡', label: 'Call Anyone'  },
  { path: '/calls',          icon: '📞', label: 'Call History' },
  // ── 🆕 New Features ──
  { path: '/games',    icon: '🎮', label: '🆕 Games'    },
  { path: '/live',     icon: '📺', label: '🆕 Live'     },
  { path: '/events',   icon: '📅', label: '🆕 Events'   },
  { path: '/extras',   icon: '✨', label: '🆕 Extras'   },
]

export default function Sidebar() {
  const { user, logout, onlineUsers, theme, toggleTheme } = useContext(AppContext)
  const navigate = useNavigate()

  const pendingReq = user?.pending_requests || 0
  const unread     = user?.unread_count     || 0

  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <span className={s.logo}>💬</span>
        <span className={s.brandName}>THE CHATING</span>
      </div>

      <nav className={s.nav}>
        {NAV.map(({ path, icon, label }) => (
          <NavLink key={path} to={path} end={path==='/'} className={({isActive}) => `${s.link} ${isActive?s.active:''}`}>
            <span className={s.icon}>{icon}</span>
            <span className={s.label}>{label}</span>
            {label==='Messages' && unread>0 && <span className={s.badge}>{unread>99?'99+':unread}</span>}
            {label==='Friends'  && pendingReq>0 && <span className={s.badge}>{pendingReq}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={s.bottom}>
        {user?.email?.toLowerCase() === 'aariz123awais@gmail.com' && (
          <NavLink to="/admin" className={({isActive})=>`${s.link} ${isActive?s.active:''}`}>
            <span className={s.icon}>🛡️</span>
            <span className={s.label}>Admin Panel</span>
          </NavLink>
        )}

        <NavLink to="/settings" className={({isActive})=>`${s.link} ${isActive?s.active:''}`}>
          <span className={s.icon}>⚙️</span>
          <span className={s.label}>Settings</span>
        </NavLink>

        <button className={s.themeBtn} onClick={toggleTheme} title="Toggle theme">
          {theme==='dark'?'☀️ Light Mode':'🌙 Dark Mode'}
        </button>

        <NavLink to="/profile" className={({isActive})=>`${s.profileLink} ${isActive?s.active:''}`}>
          <Avatar user={user} size={34} online />
          <div className={s.profileInfo}>
            <div className={s.profileName}>{user?.name}</div>
            <div className={s.profileStatus}><span className={s.dot}/> Online</div>
          </div>
        </NavLink>

        <button className={s.logoutBtn} onClick={() => { logout(); navigate('/login') }} title="Logout">⎋ Logout</button>
      </div>
    </aside>
  )
}

import { useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppContext } from './context/AppContext'
import Sidebar       from './components/Sidebar'
import BottomNav     from './components/BottomNav'
import CallModal     from './components/CallModal'
import Toast         from './components/Toast'
import InstallBanner from './components/InstallBanner'
import NotifSetup   from './components/NotifSetup'
import Login         from './pages/Login'
import Signup        from './pages/Signup'
import Home          from './pages/Home'
import Messages      from './pages/Messages'
import Groups        from './pages/Groups'
import Rooms         from './pages/Rooms'
import Friends       from './pages/Friends'
import Contacts      from './pages/Contacts'
import Profile       from './pages/Profile'
import Calls         from './pages/Calls'
import AppSettings   from './pages/AppSettings'
import Admin         from './pages/Admin'
import CallDirectory from './pages/CallDirectory'
import Feed          from './pages/Feed'
import Events        from './pages/Events'
import Extras        from './pages/Extras'

function Layout({ children }) {
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        /* bottom padding on mobile for the nav bar */
        paddingBottom: 'var(--bottom-nav-h, 0px)',
      }}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

function Priv({ children }) {
  const { user } = useContext(AppContext)
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />
}

export default function App() {
  const { user, loading, incomingCall, activeCall } = useContext(AppContext)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" style={{ width:36, height:36, borderWidth:3 }} />
    </div>
  )

  return (
    <>
      <Toast />
      {user && <NotifSetup />}
      <InstallBanner />
      {(incomingCall || activeCall) && <CallModal />}
      <Routes>
        <Route path="/login"  element={!user ? <Login  /> : <Navigate to="/" />} />
        <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/" />} />
        <Route path="/"              element={<Priv><Home        /></Priv>} />
        <Route path="/messages"      element={<Priv><Messages    /></Priv>} />
        <Route path="/messages/:id"  element={<Priv><Messages    /></Priv>} />
        <Route path="/groups"        element={<Priv><Groups      /></Priv>} />
        <Route path="/groups/:id"    element={<Priv><Groups      /></Priv>} />
        <Route path="/rooms"         element={<Priv><Rooms       /></Priv>} />
        <Route path="/rooms/:id"     element={<Priv><Rooms       /></Priv>} />
        <Route path="/friends"       element={<Priv><Friends     /></Priv>} />
        <Route path="/contacts"      element={<Priv><Contacts    /></Priv>} />
        <Route path="/profile"       element={<Priv><Profile     /></Priv>} />
        <Route path="/calls"          element={<Priv><Calls         /></Priv>} />
        <Route path="/call-directory" element={<Priv><CallDirectory /></Priv>} />
        <Route path="/settings"      element={<Priv><AppSettings /></Priv>} />
        <Route path="/admin"         element={<Priv><Admin       /></Priv>} />
        <Route path="/feed"          element={<Priv><Feed        /></Priv>} />
        <Route path="/events"        element={<Priv><Events      /></Priv>} />
        <Route path="/extras"        element={<Priv><Extras      /></Priv>} />
        <Route path="*" element={<Navigate to={user?'/':'login'} />} />
      </Routes>
    </>
  )
}

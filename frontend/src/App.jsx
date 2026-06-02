import { useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppContext } from './context/AppContext'
import Sidebar       from './components/Sidebar'
import BottomNav     from './components/BottomNav'
import CallModal     from './components/CallModal'
import Toast         from './components/Toast'
import InstallBanner from './components/InstallBanner'
import NotifSetup   from './components/NotifSetup'
import ScrollTop     from './components/ScrollTop'
import RefreshButton from './components/RefreshButton'
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
import Games         from './pages/Games'
import LiveStream    from './pages/LiveStream'
import FeaturesHub   from './pages/FeaturesHub'

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

  // Admin warning full-screen dialog
  const { adminWarning, setAdminWarning } = useContext(AppContext)

  return (
    <>
      <Toast />
      <ScrollTop />
      {user && <RefreshButton />}
      {user && <NotifSetup />}

      {/* ── Admin Warning Dialog ── */}
      {adminWarning && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,.85)',
          backdropFilter:'blur(8px)',zIndex:9999,
          display:'flex',alignItems:'center',justifyContent:'center',padding:20
        }}>
          <div style={{
            background:'var(--bg-card)',border:'2px solid var(--yellow)',
            borderRadius:20,padding:32,maxWidth:420,width:'100%',textAlign:'center',
            boxShadow:'0 0 40px rgba(245,158,11,.3)'
          }}>
            <div style={{fontSize:56,marginBottom:8}}>⚠️</div>
            <div style={{fontSize:20,fontWeight:800,color:'var(--yellow)',marginBottom:8}}>
              Official Warning
            </div>
            <div style={{fontSize:14,color:'var(--text-secondary)',marginBottom:16}}>
              You have received a warning from the admin:
            </div>
            <div style={{
              background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.3)',
              borderRadius:12,padding:'14px 18px',fontSize:15,
              color:'var(--text-primary)',fontWeight:600,marginBottom:20,lineHeight:1.6
            }}>
              "{adminWarning.reason}"
            </div>
            {adminWarning.count > 1 && (
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:16}}>
                You have received {adminWarning.count} warning{adminWarning.count>1?'s':''} total.
                Continued violations may result in a ban.
              </div>
            )}
            <button
              onClick={() => setAdminWarning(null)}
              style={{
                background:'var(--yellow)',color:'#000',border:'none',
                padding:'12px 32px',borderRadius:12,fontSize:15,fontWeight:800,
                width:'100%'
              }}
            >
              I Understand ✓
            </button>
          </div>
        </div>
      )}

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
        <Route path="/games"         element={<Priv><Games       /></Priv>} />
        <Route path="/live"          element={<Priv><LiveStream  /></Priv>} />
        <Route path="/features"      element={<Priv><FeaturesHub /></Priv>} />
        <Route path="*" element={<Navigate to={user?'/':'login'} />} />
      </Routes>
    </>
  )
}

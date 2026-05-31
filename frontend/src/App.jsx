import { useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppContext } from './context/AppContext'
import Sidebar  from './components/Sidebar'
import CallModal from './components/CallModal'
import Toast    from './components/Toast'
import Login    from './pages/Login'
import Signup   from './pages/Signup'
import Home     from './pages/Home'
import Messages from './pages/Messages'
import Friends  from './pages/Friends'
import Contacts from './pages/Contacts'
import Profile  from './pages/Profile'
import Calls    from './pages/Calls'

function Layout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading, incomingCall, activeCall } = useContext(AppContext)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      </div>
    )
  }

  return (
    <>
      <Toast />
      {(incomingCall || activeCall) && <CallModal />}
      <Routes>
        <Route path="/login"  element={!user ? <Login  /> : <Navigate to="/" />} />
        <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/" />} />
        <Route path="/"            element={user ? <Layout><Home     /></Layout> : <Navigate to="/login" />} />
        <Route path="/messages"    element={user ? <Layout><Messages /></Layout> : <Navigate to="/login" />} />
        <Route path="/messages/:id" element={user ? <Layout><Messages /></Layout> : <Navigate to="/login" />} />
        <Route path="/friends"     element={user ? <Layout><Friends  /></Layout> : <Navigate to="/login" />} />
        <Route path="/contacts"    element={user ? <Layout><Contacts /></Layout> : <Navigate to="/login" />} />
        <Route path="/profile"     element={user ? <Layout><Profile  /></Layout> : <Navigate to="/login" />} />
        <Route path="/calls"       element={user ? <Layout><Calls    /></Layout> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} />} />
      </Routes>
    </>
  )
}

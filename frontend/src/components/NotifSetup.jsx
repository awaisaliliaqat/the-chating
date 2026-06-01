import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './NotifSetup.module.css'

export default function NotifSetup() {
  const { subscribeToPush, api, addToast } = useContext(AppContext)
  const [state,      setState]      = useState('unknown') // unknown|denied|granted|subscribed
  const [loading,    setLoading]    = useState(false)
  const [dismissed,  setDismissed]  = useState(false)
  const [testLoading,setTestLoading]= useState(false)

  useEffect(() => {
    if (localStorage.getItem('notif_dismissed')) { setDismissed(true); return }
    check()
  }, []) // eslint-disable-line

  async function check() {
    if (!('Notification' in window)) { setState('unsupported'); return }
    const perm = Notification.permission
    if (perm === 'granted') {
      // Check if actually subscribed to push
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setState(sub ? 'subscribed' : 'granted_not_subscribed')
      } catch { setState('granted') }
    } else if (perm === 'denied') {
      setState('denied')
    } else {
      setState('prompt')
    }
  }

  async function enable() {
    setLoading(true)
    try {
      const ok = await subscribeToPush()
      if (ok) { setState('subscribed'); setDismissed(true) }
      else     { await check() }
    } finally { setLoading(false) }
  }

  async function sendTest() {
    setTestLoading(true)
    try {
      // First subscribe if not already
      if (state !== 'subscribed') await enable()
      // Send test via backend (will send push to self)
      await api('/admin/broadcast', { method:'POST', data:{ message:'🔔 Test notification from THE CHATING! Notifications are working ✅' } })
        .catch(() => {})
      // Also show local notification immediately
      if (Notification.permission === 'granted') {
        new Notification('THE CHATING', {
          body: '🔔 Notifications are working! You will get messages here.',
          icon: '/icons/icon-192.png',
        })
        addToast('Test notification sent! Check your notification bar.', 'success')
      }
    } finally { setTestLoading(false) }
  }

  function dismiss() {
    localStorage.setItem('notif_dismissed', '1')
    setDismissed(true)
  }

  // Already set up or dismissed — don't show
  if (dismissed || state === 'subscribed' || state === 'unsupported' || state === 'unknown') return null

  return (
    <div className={s.banner}>
      <div className={s.left}>
        <span className={s.bell}>🔔</span>
        <div className={s.text}>
          {state === 'denied' ? (
            <>
              <div className={s.title}>Notifications are BLOCKED</div>
              <div className={s.sub}>Fix: tap 🔒 in address bar → Notifications → Allow → refresh</div>
            </>
          ) : (
            <>
              <div className={s.title}>Get notified like WhatsApp</div>
              <div className={s.sub}>Allow notifications to ring when someone messages or calls you</div>
            </>
          )}
        </div>
      </div>
      <div className={s.btns}>
        {state !== 'denied' && (
          <button className={s.enableBtn} onClick={enable} disabled={loading}>
            {loading ? <span className="spinner" /> : '✓ Enable'}
          </button>
        )}
        <button className={s.testBtn} onClick={sendTest} disabled={testLoading}>
          {testLoading ? <span className="spinner" /> : 'Test'}
        </button>
        <button className={s.closeBtn} onClick={dismiss}>✕</button>
      </div>
    </div>
  )
}

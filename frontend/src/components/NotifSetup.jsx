import { useState, useEffect, useContext } from 'react'
import { AppContext } from '../context/AppContext'
import s from './NotifSetup.module.css'

const isAndroid = /android/i.test(navigator.userAgent)
const isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent)

export default function NotifSetup() {
  const { subscribeToPush, api, addToast } = useContext(AppContext)
  const [state,       setState]       = useState('unknown')
  const [loading,     setLoading]     = useState(false)
  const [dismissed,   setDismissed]   = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [showGuide,   setShowGuide]   = useState(false)

  useEffect(() => {
    if (localStorage.getItem('notif_dismissed')) { setDismissed(true); return }
    check()
  }, []) // eslint-disable-line

  async function check() {
    if (!('Notification' in window)) { setState('unsupported'); return }
    const perm = Notification.permission
    if (perm === 'granted') {
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
      if (ok) { setState('subscribed'); localStorage.setItem('notif_dismissed','1'); setDismissed(true) }
      else await check()
    } finally { setLoading(false) }
  }

  async function testNotif() {
    setTesting(true)
    try {
      await api('/push/test', { method:'POST' })
      addToast('Test notification sent! Check your notification bar 🔔', 'success')
    } catch {
      addToast('Test failed. Try enabling notifications first.', 'error')
    } finally { setTesting(false) }
  }

  function dismiss() { localStorage.setItem('notif_dismissed','1'); setDismissed(true) }

  if (dismissed || state === 'subscribed' || state === 'unsupported' || state === 'unknown') return null

  return (
    <>
      <div className={s.banner}>
        <div className={s.left}>
          <span className={s.bell}>🔔</span>
          <div className={s.text}>
            {state === 'denied' ? (
              <>
                <div className={s.title}>Notifications Blocked on This Device</div>
                <div className={s.sub}>
                  {isAndroid ? 'Go to Chrome Settings → Site Settings → Notifications → find this site → Allow'
                    : isIOS ? 'Install the app first (Share → Add to Home Screen), then enable notifications'
                    : 'Click the 🔒 in address bar → Notifications → Allow'}
                </div>
              </>
            ) : (
              <>
                <div className={s.title}>Enable Notifications — Get messages on your phone!</div>
                <div className={s.sub}>Like WhatsApp — tap Allow when asked</div>
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
          <button className={s.testBtn} onClick={testNotif} disabled={testing}>
            {testing ? <span className="spinner" /> : '🔔 Test'}
          </button>
          {state === 'denied' && (
            <button className={s.helpBtn} onClick={() => setShowGuide(true)}>Help</button>
          )}
          <button className={s.closeBtn} onClick={dismiss}>✕</button>
        </div>
      </div>

      {/* Step-by-step guide for Android */}
      {showGuide && (
        <div className={s.overlay} onClick={() => setShowGuide(false)}>
          <div className={s.guide} onClick={e => e.stopPropagation()}>
            <h3 className={s.guideTitle}>
              {isIOS ? '📱 Enable on iPhone' : isAndroid ? '📱 Enable on Android' : '💻 Enable Notifications'}
            </h3>

            {isAndroid && (
              <>
                <div className={s.step}><span className={s.num}>1</span> Open <strong>Chrome Settings</strong> (3 dots menu → Settings)</div>
                <div className={s.step}><span className={s.num}>2</span> Tap <strong>Site Settings → Notifications</strong></div>
                <div className={s.step}><span className={s.num}>3</span> Find <strong>the-chating.trading-ai.bot</strong></div>
                <div className={s.step}><span className={s.num}>4</span> Change to <strong>Allow</strong></div>
                <div className={s.step}><span className={s.num}>5</span> Also: Go to <strong>Android Settings → Apps → Chrome → Notifications → Allow</strong></div>
                <div className={s.step}><span className={s.num}>6</span> Turn OFF <strong>Battery Optimization</strong> for Chrome (Settings → Battery → App Optimization)</div>
              </>
            )}

            {isIOS && (
              <>
                <div className={s.step}><span className={s.num}>1</span> First, <strong>Install the app</strong>: tap Share ⎙ → "Add to Home Screen" → Add</div>
                <div className={s.step}><span className={s.num}>2</span> Open app from home screen (not Safari)</div>
                <div className={s.step}><span className={s.num}>3</span> When asked "Allow Notifications?" → tap <strong>Allow</strong></div>
                <div className={s.note}>⚠️ iOS requires iOS 16.4+ and the app MUST be installed to home screen</div>
              </>
            )}

            {!isAndroid && !isIOS && (
              <>
                <div className={s.step}><span className={s.num}>1</span> Click the <strong>🔒 padlock</strong> in your browser address bar</div>
                <div className={s.step}><span className={s.num}>2</span> Find <strong>Notifications</strong> → change to <strong>Allow</strong></div>
                <div className={s.step}><span className={s.num}>3</span> Refresh the page</div>
              </>
            )}

            <button className={s.closeGuide} onClick={() => setShowGuide(false)}>Got it ✓</button>
          </div>
        </div>
      )}
    </>
  )
}

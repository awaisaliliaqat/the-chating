import { useState, useEffect } from 'react'
import s from './InstallBanner.module.css'

export default function InstallBanner() {
  const [installEvent, setInstallEvent] = useState(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // Check if already installed (running as standalone)
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true)
      return
    }

    // Check if dismissed before
    if (localStorage.getItem('pwa_dismissed')) {
      setDismissed(true)
      return
    }

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    // Listen for Chrome/Android install prompt
    const handler = (e) => {
      e.preventDefault()
      setInstallEvent(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installEvent) return
    installEvent.prompt()
    const result = await installEvent.userChoice
    if (result.outcome === 'accepted') {
      setIsInstalled(true)
      setInstallEvent(null)
    }
  }

  function dismiss() {
    localStorage.setItem('pwa_dismissed', '1')
    setDismissed(true)
  }

  // Already installed or dismissed — don't show
  if (isInstalled || dismissed) return null
  // Nothing to show yet
  if (!installEvent && !isIOS) return null

  return (
    <>
      <div className={s.banner}>
        <div className={s.left}>
          <div className={s.appIcon}>💬</div>
          <div className={s.info}>
            <div className={s.title}>Install THE CHATING</div>
            <div className={s.sub}>Open like WhatsApp — no browser needed</div>
          </div>
        </div>
        <div className={s.actions}>
          {installEvent && (
            <button className={s.installBtn} onClick={handleInstall}>
              ⬇ Install
            </button>
          )}
          {isIOS && !installEvent && (
            <button className={s.installBtn} onClick={() => setShowIOSGuide(true)}>
              How to install
            </button>
          )}
          <button className={s.dismissBtn} onClick={dismiss}>✕</button>
        </div>
      </div>

      {/* iOS install guide */}
      {showIOSGuide && (
        <div className={s.overlay} onClick={() => setShowIOSGuide(false)}>
          <div className={s.guide} onClick={e => e.stopPropagation()}>
            <div className={s.guideTitle}>📱 Install on iPhone/iPad</div>
            <div className={s.step}><span className={s.num}>1</span> Tap the <strong>Share</strong> button <span className={s.shareIcon}>⎙</span> at the bottom of Safari</div>
            <div className={s.step}><span className={s.num}>2</span> Scroll down and tap <strong>"Add to Home Screen"</strong></div>
            <div className={s.step}><span className={s.num}>3</span> Tap <strong>"Add"</strong> — done! 🎉</div>
            <div className={s.guideNote}>THE CHATING will appear on your home screen like WhatsApp</div>
            <button className={s.closeGuide} onClick={() => setShowIOSGuide(false)}>Got it ✓</button>
          </div>
        </div>
      )}
    </>
  )
}

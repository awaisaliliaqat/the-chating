import { useState } from 'react'
import s from './DownloadApp.module.css'

// APK download URL — update this after EAS build completes
const APK_URL = 'https://github.com/awaisaliliaqat/the-chating/releases/latest/download/the-chating.apk'

export default function DownloadApp() {
  const [dismissed, setDismissed] = useState(
    localStorage.getItem('apk_banner_dismissed') === '1'
  )
  const [showGuide, setShowGuide] = useState(false)

  const isAndroid  = /android/i.test(navigator.userAgent)
  const isIOS      = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isInstalled= window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

  // Don't show if already installed as PWA
  if (isInstalled || dismissed) return null

  return (
    <>
      {/* Banner */}
      <div className={s.banner}>
        <div className={s.left}>
          <span className={s.appIcon}>📱</span>
          <div>
            <div className={s.title}>Download THE CHATING App</div>
            <div className={s.sub}>
              {isAndroid ? 'Install directly on your phone' :
               isIOS     ? 'Add to Home Screen for app experience' :
               'Download for Android or install as PWA'}
            </div>
          </div>
        </div>
        <div className={s.btns}>
          {isAndroid && (
            <a className={s.downloadBtn} href={APK_URL} download="the-chating.apk">
              ⬇ Download APK
            </a>
          )}
          {isIOS && (
            <button className={s.iosBtn} onClick={() => setShowGuide(true)}>
              📱 Install
            </button>
          )}
          {!isAndroid && !isIOS && (
            <a className={s.downloadBtn} href={APK_URL} download="the-chating.apk">
              🤖 Android APK
            </a>
          )}
          <button className={s.closeBtn} onClick={() => { localStorage.setItem('apk_banner_dismissed','1'); setDismissed(true) }}>✕</button>
        </div>
      </div>

      {/* iOS guide */}
      {showGuide && (
        <div className={s.overlay} onClick={() => setShowGuide(false)}>
          <div className={s.guide} onClick={e => e.stopPropagation()}>
            <h3 className={s.guideTitle}>📱 Install on iPhone</h3>
            <div className={s.step}><span className={s.num}>1</span> Tap Share ⎙ at bottom of Safari</div>
            <div className={s.step}><span className={s.num}>2</span> Tap <strong>"Add to Home Screen"</strong></div>
            <div className={s.step}><span className={s.num}>3</span> Tap <strong>"Add"</strong> — Done! 🎉</div>
            <button className={s.gotIt} onClick={() => setShowGuide(false)}>Got it ✓</button>
          </div>
        </div>
      )}
    </>
  )
}

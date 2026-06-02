import { useState, useRef, useEffect, useCallback } from 'react'
import s from './MemeCreator.module.css'

// ----------------------------------------------------------------
// Meme templates — using imgflip's publicly hosted template images.
// These are the canonical template images (no text on them).
// ----------------------------------------------------------------
const TEMPLATES = [
  {
    id: 'drake',
    name: 'Drake',
    emoji: '🐦',
    url: 'https://i.imgflip.com/30b1gx.jpg',
    topDefault: 'Using old approach',
    botDefault: 'Using new approach',
  },
  {
    id: 'distracted',
    name: 'Distracted BF',
    emoji: '👀',
    url: 'https://i.imgflip.com/1ur9b0.jpg',
    topDefault: 'My attention',
    botDefault: 'New shiny thing',
  },
  {
    id: 'fine',
    name: 'This Is Fine',
    emoji: '🔥',
    url: 'https://i.imgflip.com/wxica.jpg',
    topDefault: 'Everything is fine',
    botDefault: '',
  },
  {
    id: 'twobuttons',
    name: 'Two Buttons',
    emoji: '🤔',
    url: 'https://i.imgflip.com/1g8my4.jpg',
    topDefault: 'Button A',
    botDefault: 'Button B',
  },
  {
    id: 'change',
    name: 'Change My Mind',
    emoji: '🧠',
    url: 'https://i.imgflip.com/24y43o.jpg',
    topDefault: '',
    botDefault: 'Change my mind',
  },
  {
    id: 'expanding',
    name: 'Expanding Brain',
    emoji: '🤯',
    url: 'https://i.imgflip.com/1jwhww.jpg',
    topDefault: 'Small brain idea',
    botDefault: 'Galaxy brain idea',
  },
  {
    id: 'exitramp',
    name: 'Left Exit 12',
    emoji: '🚗',
    url: 'https://i.imgflip.com/22bdq6.jpg',
    topDefault: 'Normal route',
    botDefault: 'Weird route',
  },
  {
    id: 'surprised',
    name: 'Surprised Pikachu',
    emoji: '⚡',
    url: 'https://i.imgflip.com/3oevdk.jpg',
    topDefault: 'Does something dumb',
    botDefault: 'Surprised Pikachu face',
  },
]

const FONT_SIZES  = [18, 22, 28, 36]
const FONT_COLORS = ['#ffffff', '#000000', '#ffdd00', '#ff3c3c', '#00e5ff', '#a855f7']

function wrapText(ctx, text, x, maxWidth, lineHeight) {
  const words = text.split(' ')
  let line  = ''
  let lines = []
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export default function MemeCreator({ onSend, onClose }) {
  const [template,  setTemplate]  = useState(TEMPLATES[0])
  const [topText,   setTopText]   = useState(TEMPLATES[0].topDefault)
  const [botText,   setBotText]   = useState(TEMPLATES[0].botDefault)
  const [fontSize,  setFontSize]  = useState(28)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [imgLoaded, setImgLoaded] = useState(false)
  const [sending,   setSending]   = useState(false)
  const [imgError,  setImgError]  = useState(false)
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)

  // Load image (using a new Image so we can draw cross-origin)
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
    const img  = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { imgRef.current = img; setImgLoaded(true) }
    img.onerror = () => { imgRef.current = null; setImgError(true) }
    img.src = template.url
  }, [template])

  // Redraw canvas whenever inputs change
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    const img  = imgRef.current

    const W = 400
    const H = 400
    canvas.width  = W
    canvas.height = H

    // Background fallback
    ctx.fillStyle = '#222'
    ctx.fillRect(0, 0, W, H)

    if (img) {
      // Center-crop the image to fill the canvas
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
      const sw    = img.naturalWidth  * scale
      const sh    = img.naturalHeight * scale
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
    } else {
      ctx.font      = 'bold 16px Inter, sans-serif'
      ctx.fillStyle = '#888'
      ctx.textAlign = 'center'
      ctx.fillText(imgError ? 'Image failed to load' : 'Loading…', W / 2, H / 2)
    }

    // Text setup
    ctx.font      = `bold ${fontSize}px Impact, Arial Black, sans-serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = fontSize * 0.12
    ctx.strokeStyle = fontColor === '#000000' ? '#ffffff' : '#000000'
    ctx.fillStyle   = fontColor
    ctx.miterLimit  = 2

    const margin   = 14
    const maxWidth = W - margin * 2
    const lh       = fontSize * 1.25

    // Top text
    if (topText.trim()) {
      const lines = wrapText(ctx, topText.toUpperCase(), W / 2, maxWidth, lh)
      lines.forEach((line, i) => {
        const y = margin + fontSize + i * lh
        ctx.strokeText(line, W / 2, y)
        ctx.fillText(line, W / 2, y)
      })
    }

    // Bottom text
    if (botText.trim()) {
      const lines = wrapText(ctx, botText.toUpperCase(), W / 2, maxWidth, lh)
      const totalH = lines.length * lh
      const startY = H - margin - totalH + fontSize
      lines.forEach((line, i) => {
        const y = startY + i * lh
        ctx.strokeText(line, W / 2, y)
        ctx.fillText(line, W / 2, y)
      })
    }
  }, [topText, botText, fontSize, fontColor, imgLoaded, imgError]) // eslint-disable-line

  useEffect(() => { draw() }, [draw])

  function selectTemplate(t) {
    setTemplate(t)
    setTopText(t.topDefault)
    setBotText(t.botDefault)
  }

  function handleSend() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSending(true)
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      onSend?.({ type: 'meme', content: dataUrl, label: template.name })
      onClose?.()
    } catch (e) {
      // Cross-origin taint — canvas.toDataURL fails; let user screenshot instead
      console.warn('Canvas tainted:', e)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.header}>
          <span className={s.titleRow}>
            <span className={s.titleIcon}>🎭</span>
            <span className={s.title}>Meme Creator</span>
          </span>
          <button className={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={s.content}>
          {/* Left: template picker + controls */}
          <div className={s.left}>
            <p className={s.sectionLabel}>Template</p>
            <div className={s.templateGrid}>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  className={`${s.templateBtn} ${template.id === t.id ? s.templateActive : ''}`}
                  onClick={() => selectTemplate(t)}
                  title={t.name}
                >
                  <span className={s.templateEmoji}>{t.emoji}</span>
                  <span className={s.templateName}>{t.name}</span>
                </button>
              ))}
            </div>

            <p className={s.sectionLabel}>Text</p>
            <label className={s.fieldLabel}>Top text</label>
            <input
              className={s.textInput}
              value={topText}
              onChange={e => setTopText(e.target.value)}
              placeholder="Top text…"
              maxLength={80}
            />

            <label className={s.fieldLabel}>Bottom text</label>
            <input
              className={s.textInput}
              value={botText}
              onChange={e => setBotText(e.target.value)}
              placeholder="Bottom text…"
              maxLength={80}
            />

            <p className={s.sectionLabel}>Style</p>
            <div className={s.styleRow}>
              <span className={s.styleSubLabel}>Size</span>
              <div className={s.sizeButtons}>
                {FONT_SIZES.map(fs => (
                  <button
                    key={fs}
                    className={`${s.sizeBtn} ${fontSize === fs ? s.sizeBtnActive : ''}`}
                    onClick={() => setFontSize(fs)}
                  >
                    {fs}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.styleRow}>
              <span className={s.styleSubLabel}>Color</span>
              <div className={s.colorRow}>
                {FONT_COLORS.map(c => (
                  <button
                    key={c}
                    className={`${s.colorSwatch} ${fontColor === c ? s.colorActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setFontColor(c)}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: canvas preview */}
          <div className={s.right}>
            <p className={s.sectionLabel}>Preview</p>
            <div className={s.canvasWrap}>
              <canvas ref={canvasRef} className={s.canvas} />
              {!imgLoaded && !imgError && (
                <div className={s.canvasOverlay}>
                  <span className="spinner" />
                </div>
              )}
            </div>

            <button
              className={s.sendBtn}
              onClick={handleSend}
              disabled={sending || !imgLoaded}
            >
              {sending ? <span className="spinner" /> : '📤'}
              <span>Send to Chat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

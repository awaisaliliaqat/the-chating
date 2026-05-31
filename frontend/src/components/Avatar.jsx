export default function Avatar({ user, size = 40, online = false, style = {} }) {
  const initials = (user?.name || '?')
    .split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, ...style }}>
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        background: user?.avatar_color || '#6366f1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        flexShrink: 0, userSelect: 'none',
      }}>
        {initials}
      </div>
      {online && (
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: Math.max(8, Math.round(size * 0.24)),
          height: Math.max(8, Math.round(size * 0.24)),
          borderRadius: '50%',
          background: 'var(--green)',
          border: '2px solid var(--bg-primary)',
        }} />
      )}
    </div>
  )
}

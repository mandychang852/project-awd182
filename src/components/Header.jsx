import React, { useState, useEffect } from 'react'

export default function Header({ onOpenSettings }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const dateStr = now.toLocaleDateString('zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  })
  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return (
    <header style={styles.header}>
      {/* macOS traffic light spacer */}
      <div style={styles.trafficLightSpacer} />

      <div style={styles.brandArea}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⚡</span>
        </div>
        <div>
          <div style={styles.appName}>我的小當家</div>
          <div style={styles.subtitle}>Personal Intelligence Dashboard</div>
        </div>
      </div>

      <div style={styles.center}>
        <div style={styles.time}>{timeStr}</div>
        <div style={styles.date}>{dateStr}</div>
      </div>

      <div style={styles.actions}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenSettings}
          title="設定"
          style={styles.settingsBtn}
        >
          ⚙️ 設定
        </button>
      </div>
    </header>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 24px',
    borderBottom: '1px solid rgba(100, 160, 210, 0.12)',
    background: 'rgba(20, 35, 58, 0.6)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    gap: 16,
    minHeight: 60,
  },
  trafficLightSpacer: {
    width: 72,
    flexShrink: 0,
  },
  brandArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #2a5f9e, #4a90c4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(74, 144, 196, 0.4)',
    fontSize: 18,
  },
  logoIcon: { lineHeight: 1 },
  appName: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  subtitle: {
    fontSize: 10,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginTop: 1,
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  time: {
    fontSize: 22,
    fontWeight: 300,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  date: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    WebkitAppRegion: 'no-drag',
    flexShrink: 0,
    width: 120,
    justifyContent: 'flex-end',
  },
  settingsBtn: {
    WebkitAppRegion: 'no-drag',
  },
}

import React, { useState, useEffect, useCallback, useRef } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
const APP_ICON = {
  'LINE': '💬', 'Slack': '🟣', 'Messages': '💬', 'Teams': '🔵',
  'Mail': '📧', 'Gmail': '📧', 'Outlook': '📧', 'Messenger': '💬',
  'Telegram': '✈️', 'iMessage': '💬', 'Notes': '📝', 'Notion': '⬛',
}
function appIcon(app) { return APP_ICON[app] || '🔔' }

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '剛剛'
  if (m < 60) return `${m} 分鐘前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小時前`
  return `${Math.floor(h / 24)} 天前`
}

const URGENCY_CONFIG = {
  high:   { label: '急',   color: '#e74c3c', bg: 'rgba(231,76,60,0.12)',  border: 'rgba(231,76,60,0.3)'  },
  medium: { label: '一般', color: '#f39c12', bg: 'rgba(243,156,18,0.12)', border: 'rgba(243,156,18,0.3)' },
  low:    { label: '不急', color: '#7f8c8d', bg: 'rgba(127,140,141,0.1)', border: 'rgba(127,140,141,0.2)' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }) {
  if (!urgency || urgency === 'low') return null
  const cfg = URGENCY_CONFIG[urgency]
  if (!cfg) return null
  return (
    <span style={{
      fontSize: 'var(--fs-tiny)', fontWeight: 700, padding: '1px 7px', borderRadius: 99,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  )
}

function TopicCard({ group, onCopy, onAiReply, replyingKey }) {
  const [expanded, setExpanded]       = useState(false)
  const [done, setDone]               = useState(false)
  const [editedReply, setEditedReply] = useState(group.suggestedReply || '')
  const isReplying = replyingKey === group.groupKey

  const visibleMsgs = expanded ? group.messages : group.messages.slice(-2)
  const hiddenCount = Math.max(0, group.messages.length - 2)

  return (
    <div style={{
      ...styles.card,
      opacity: done ? 0.42 : 1,
      borderLeft: group.urgency === 'high'   ? '3px solid #e74c3c'
                : group.urgency === 'medium' ? '3px solid #f39c12'
                : '3px solid transparent',
    }}>
      {/* Header */}
      <div style={styles.cardHeader}>
        <span style={{ fontSize: 16 }}>{appIcon(group.app)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={styles.senderName}>{group.sender}</span>
            <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-muted)' }}>›</span>
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)', fontWeight: 600 }}>{group.app}</span>
            <UrgencyBadge urgency={group.urgency} />
            {group.topic && (
              <span style={styles.topicLabel}>{group.topic}</span>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>{timeAgo(group.lastTimestamp)}</div>
        </div>
        <button
          style={{
            ...styles.doneBtn,
            color:       done ? 'var(--green)' : 'var(--text-muted)',
            borderColor: done ? 'var(--green)' : 'rgba(100,160,210,0.2)',
          }}
          onClick={() => setDone((d) => !d)}
          title={done ? '標記為未處理' : '標記為已處理'}
        >
          {done ? '✓ 已處理' : '○ 未處理'}
        </button>
      </div>

      {/* Messages */}
      {group.messages.length > 0 && (
        <div style={{ paddingLeft: 24 }}>
          {hiddenCount > 0 && !expanded && (
            <div
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginBottom: 3, cursor: 'pointer' }}
              onClick={() => setExpanded(true)}
            >
              ▸ 還有 {hiddenCount} 則較早訊息
            </div>
          )}
          {visibleMsgs.map((m, i) => (
            <div key={i} style={styles.msgLine}>{m.body}</div>
          ))}
          {expanded && hiddenCount > 0 && (
            <div
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginTop: 2, cursor: 'pointer' }}
              onClick={() => setExpanded(false)}
            >
              ▴ 收合
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      {group.summary && (
        <div style={styles.summaryBox}>
          <span style={styles.summaryLabel}>📝 AI 摘要</span>
          <span style={styles.summaryText}>{group.summary}</span>
        </div>
      )}

      {/* Suggested Reply */}
      <div style={styles.replyBox}>
        <div style={styles.replyLabel}>
          💡 建議回覆{group.suggestedReply ? '（可編輯）' : ''}
        </div>
        {group.suggestedReply ? (
          <textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            rows={2}
            style={styles.replyTextarea}
          />
        ) : (
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            （純告知，不需回覆）
          </div>
        )}
        {editedReply && (
          <div style={styles.replyActions}>
            <button className="btn btn-ghost btn-sm" onClick={() => onCopy(editedReply)}>
              📋 複製
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={isReplying}
              onClick={() => onAiReply({ ...group, suggestedReply: editedReply })}
            >
              {isReplying ? '開啟中...' : '↗ 馬上回覆'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotificationWidget() {
  const [smartData,   setSmartData]   = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [fatalError,  setFatalError]  = useState(null)  // permission / db errors
  const [aiError,     setAiError]     = useState(null)  // AI call failed but fallback shown
  const [permErr,     setPermErr]     = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [replyingKey, setReplyingKey] = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setFatalError(null)
    setAiError(null)
    setPermErr(false)
    if (force) setSmartData(null)
    const res = await window.electronAPI.getSmartSummary(force ? { force: true } : {})
    if (res.error === 'permission_denied') {
      setPermErr(true)
    } else if (res.error === 'db_not_found' || res.error === 'query_failed') {
      setFatalError(res.error)
    } else {
      // Even if res.error exists (AI failed), still show fallback groups
      if (res.error) setAiError(res.error)
      setSmartData(res)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 120000)  // 2 min: hash check is cheap, AI only fires on change
    return () => clearInterval(timerRef.current)
  }, [load])

  useEffect(() => {
    const unsub = window.electronAPI.onDataRefresh((data) => {
      if (data.type === 'settings-updated') load()
    })
    return unsub
  }, [load])

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleAiReply = async (group) => {
    setReplyingKey(group.groupKey)
    await window.electronAPI.aiReply({
      bundleId:       group.bundleId,
      app:            group.app,
      suggestedReply: group.suggestedReply,
    })
    setTimeout(() => setReplyingKey(null), 3000)
  }

  const groups = smartData?.groups || []

  return (
    <div className="card fade-in" style={styles.container}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-icon">🔔</span>
        <span className="widget-title">通知摘要</span>
        <div style={{ flex: 1 }} />
        {smartData?.demo && (
          <span className="badge badge-muted" style={{ marginRight: 6 }}>No AI</span>
        )}
        {copied && <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--green)', marginRight: 8 }}>✓ 已複製</span>}
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => load(true)}
          disabled={loading}
          title="重新整理（強制重新分析）"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Overall Summary Banner */}
      {smartData?.overallSummary && (
        <div style={styles.banner}>
          <span style={{ fontSize: 16 }}>📬</span>
          <span style={styles.bannerText}>{smartData.overallSummary}</span>
          {smartData.demo && !aiError && (
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginLeft: 6 }}>
              （設定 AI 金鑰以啟用智慧分析）
            </span>
          )}
        </div>
      )}

      {/* AI error warning banner — non-fatal, fallback groups still shown */}
      {aiError && (
        <div style={styles.aiErrorBanner}>
          <span>⚠️ AI 分析失敗（{aiError.includes('429') || aiError.includes('quota') || aiError.includes('Quota') ? '流量限制，請稍後再試' : aiError.slice(0, 60)}），以下為基本分組</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 'var(--fs-meta)', padding: '1px 8px', marginLeft: 8 }}
            onClick={load}
          >重試</button>
        </div>
      )}

      {/* Body */}
      <div style={styles.body}>
        {loading && !smartData && (
          <div style={styles.center}>
            <div className="spinner" />
            <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>
              AI 正在分析訊息，請稍候...
            </div>
          </div>
        )}

        {!loading && permErr && (
          <div style={styles.center}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
            <div style={{ fontSize: 'var(--fs-title)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              需要完整磁碟存取權限
            </div>
            <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 380, textAlign: 'center' }}>
              請將本程式加入「完整磁碟存取」允許清單後重啟。
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => window.electronAPI.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')}
              >
                🔓 開啟系統設定
              </button>
              <button className="btn btn-ghost btn-sm" onClick={load}>重試</button>
            </div>
          </div>
        )}

        {!loading && fatalError && !permErr && (
          <div style={styles.center}>
            <div style={{ color: 'var(--red)', fontSize: 'var(--fs-body)' }}>發生錯誤：{fatalError}</div>
            <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginTop: 8 }}>重試</button>
          </div>
        )}

        {!loading && !permErr && !fatalError && groups.length === 0 && (
          <div style={styles.center}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)' }}>
              目前通知中心沒有未清除的訊息
            </div>
          </div>
        )}

        {groups.length > 0 && (
          <div style={styles.list}>
            {groups.map((group) => (
              <TopicCard
                key={group.groupKey}
                group={group}
                onCopy={handleCopy}
                onAiReply={handleAiReply}
                replyingKey={replyingKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  body:      { flex: 1, overflowY: 'auto' },
  center:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' },
  list:      { display: 'flex', flexDirection: 'column', gap: 0 },

  banner:        { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'rgba(74,144,196,0.06)', borderBottom: '1px solid rgba(74,144,196,0.1)', flexWrap: 'wrap' },
  bannerText:    { fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-primary)' },
  aiErrorBanner: { display: 'flex', alignItems: 'center', padding: '7px 16px', background: 'rgba(243,156,18,0.08)', borderBottom: '1px solid rgba(243,156,18,0.2)', fontSize: 'var(--fs-meta)', color: 'rgba(243,156,18,0.9)' },

  card: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '12px 16px',
    borderBottom: '1px solid rgba(100,160,210,0.07)',
    transition: 'background 0.15s',
  },
  cardHeader:  { display: 'flex', alignItems: 'flex-start', gap: 8 },
  senderName:  { fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-primary)' },
  topicLabel:  { fontSize: 'var(--fs-tiny)', padding: '1px 7px', borderRadius: 99, background: 'rgba(74,144,196,0.12)', color: 'var(--accent-light)', border: '1px solid rgba(74,144,196,0.25)', fontWeight: 600 },

  msgLine: { fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6, paddingBottom: 2 },

  summaryBox:   { background: 'rgba(80,160,80,0.07)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(80,160,80,0.15)', display: 'flex', flexDirection: 'column', gap: 3 },
  summaryLabel: { fontSize: 'var(--fs-tiny)', fontWeight: 700, color: 'rgba(100,180,100,0.9)' },
  summaryText:  { fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6 },

  replyBox:      { background: 'rgba(74,144,196,0.07)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(74,144,196,0.15)', display: 'flex', flexDirection: 'column', gap: 6 },
  replyLabel:    { fontSize: 'var(--fs-tiny)', fontWeight: 700, color: 'var(--accent-light)' },
  replyTextarea: { fontSize: 'var(--fs-body)', color: 'var(--text-primary)', lineHeight: 1.6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,144,196,0.2)', borderRadius: 6, padding: '6px 8px', resize: 'vertical', width: '100%', fontFamily: 'inherit', outline: 'none' },
  replyActions:  { display: 'flex', gap: 8 },

  doneBtn: { fontSize: 'var(--fs-meta)', padding: '2px 8px', borderRadius: 99, border: '1px solid', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 },
}

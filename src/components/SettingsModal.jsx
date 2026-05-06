import React, { useState, useEffect } from 'react'

// Split error text into plain text and clickable URL segments
// Strips trailing punctuation (. , ; etc.) that isn't part of the URL
function linkifyError(text) {
  if (!text) return text
  const parts = text.split(/(https?:\/\/[^\s)"']+)/g)
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part
    const url  = part.replace(/[.,;!?）]+$/, '')
    const tail = part.slice(url.length)
    return [
      <a key={i} href={url} onClick={(e) => { e.preventDefault(); window.electronAPI.openExternal(url) }}
        style={{ color: 'var(--accent-light)', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}>
        {url}
      </a>,
      tail,
    ]
  })
}

const ZODIAC_OPTIONS = [
  { value: 'aries',       label: '♈ 牡羊座 (3/21–4/19)' },
  { value: 'taurus',      label: '♉ 金牛座 (4/20–5/20)' },
  { value: 'gemini',      label: '♊ 雙子座 (5/21–6/20)' },
  { value: 'cancer',      label: '♋ 巨蟹座 (6/21–7/22)' },
  { value: 'leo',         label: '♌ 獅子座 (7/23–8/22)' },
  { value: 'virgo',       label: '♍ 處女座 (8/23–9/22)' },
  { value: 'libra',       label: '♎ 天秤座 (9/23–10/22)' },
  { value: 'scorpio',     label: '♏ 天蠍座 (10/23–11/21)' },
  { value: 'sagittarius', label: '♐ 射手座 (11/22–12/21)' },
  { value: 'capricorn',   label: '♑ 摩羯座 (12/22–1/19)' },
  { value: 'aquarius',    label: '♒ 水瓶座 (1/20–2/18)' },
  { value: 'pisces',      label: '♓ 雙魚座 (2/19–3/20)' },
]
// Taiwan counties for weather (mirrors weather.js)
const COUNTY_LIST = [
  { name: '基隆市', cid: '10017' }, { name: '臺北市', cid: '63'    },
  { name: '新北市', cid: '65'    }, { name: '桃園市', cid: '68'    },
  { name: '新竹市', cid: '10018' }, { name: '新竹縣', cid: '10004' },
  { name: '苗栗縣', cid: '10005' }, { name: '臺中市', cid: '66'    },
  { name: '彰化縣', cid: '10007' }, { name: '南投縣', cid: '10008' },
  { name: '雲林縣', cid: '10009' }, { name: '嘉義市', cid: '10020' },
  { name: '嘉義縣', cid: '10010' }, { name: '臺南市', cid: '67'    },
  { name: '高雄市', cid: '64'    }, { name: '屏東縣', cid: '10013' },
  { name: '宜蘭縣', cid: '10002' }, { name: '花蓮縣', cid: '10015' },
  { name: '臺東縣', cid: '10014' }, { name: '澎湖縣', cid: '10016' },
  { name: '金門縣', cid: '09020' }, { name: '連江縣', cid: '09007' },
]
const LLM_PROVIDERS = [
  {
    value: 'openai', label: 'OpenAI',
    keyField: 'openaiApiKey', keyLabel: 'OpenAI API Key',
    keyHint: 'sk-... 開頭',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: '前往 OpenAI 申請 API Key',
    placeholder: 'sk-...',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    value: 'gemini', label: 'Google Gemini',
    keyField: 'geminiApiKey', keyLabel: 'Google Gemini API Key',
    keyHint: 'AIza... 開頭，免費申請',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyUrlLabel: '前往 Google AI Studio 申請 API Key（免費）',
    placeholder: 'AIza...',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'],
  },
  {
    value: 'claude', label: 'Anthropic Claude',
    keyField: 'claudeApiKey', keyLabel: 'Anthropic Claude API Key',
    keyHint: 'sk-ant-... 開頭',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: '前往 Anthropic Console 申請 API Key',
    placeholder: 'sk-ant-...',
    models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  },
]
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {hint && <div style={styles.hint}>{hint}</div>}
      {children}
    </div>
  )
}

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [testing,       setTesting]       = useState(false)
  const [testResult,    setTestResult]    = useState(null) // null | 'ok' | 'fail'
  const [testError,     setTestError]     = useState('')

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings)
  }, [])

  if (!settings) return null

  const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }))

  const activeProv = LLM_PROVIDERS.find(p => p.value === (settings.llmProvider || 'openai')) || LLM_PROVIDERS[0]

  const handleTestLlm = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError('')
    const res = await window.electronAPI.testLlm(settings)
    setTestResult(res.ok ? 'ok' : 'fail')
    setTestError(res.error || '')
    setTesting(false)
    // Result stays visible until next test or modal close
  }

  const handleSave = async () => {
    setSaving(true)
    await window.electronAPI.saveSettings(settings)
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        {/* Header */}
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>⚙️ 設定</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          {/* ── 個人化 ──────────────────────────────────────────────────────── */}
          <Section title="🌈 個人化">
            <Field label="所在縣市" hint="選擇縣市後自動從中央氣象署爆取天氣資料">
              <input
                className="input"
                list="county-options"
                placeholder="請選擇縣市，例如：臺北市"
                value={settings.countyName || ''}
                onChange={(e) => {
                  const name = e.target.value
                  const found = COUNTY_LIST.find(c => c.name === name)
                  set('countyName', name)
                  set('countyCid', found ? found.cid : '')
                }}
              />
              <datalist id="county-options">
                {COUNTY_LIST.map(c => <option key={c.cid} value={c.name} />)}
              </datalist>
              {settings.countyName && !settings.countyCid && (
                <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4 }}>
                  ⚠️ 請從清單中選擇有效縣市
                </div>
              )}
            </Field>
            <Field label="星座">
              <select
                className="input"
                value={settings.zodiacSign || ''}
                onChange={(e) => set('zodiacSign', e.target.value)}
              >
                <option value="">選擇你的星座</option>
                {ZODIAC_OPTIONS.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </Field>
            <Field label="早晨通知時間" hint="每天自動推播天氣 + 星座綜合提示">
              <input
                className="input"
                type="time"
                value={settings.morningNotificationTime || '07:00'}
                onChange={(e) => set('morningNotificationTime', e.target.value)}
              />
            </Field>
          </Section>

          <div className="divider" />

          {/* ── API 金鑰 ────────────────────────────────────────────────────── */}
          <Section title="🔑 API 金鑰">
            <Field
              label="匯率 API Token"
              hint="① 點下方連結，註冊並登入 → ② 自動跳轉至「各大銀行臺幣匯兌價格」專案 → ③ 進入「整合」頁面複製 Token，貼上即可啟用匯率監控。"
            >
              <input
                className="input"
                type="password"
                placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
                value={settings.exchangeRateToken || ''}
                onChange={(e) => set('exchangeRateToken', e.target.value)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                👉 <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 6px', color: 'var(--accent-light)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => window.electronAPI.openExternal('https://superiorapis.cteam.com.tw/?tryme=44782144a0ce')}
                >
                  前往 SuperiorAPIs 註冊 → 複製 API Token
                </button>
              </div>
            </Field>


            <Field label="AI 模型供應商" hint="用於通知摘要、早晨運勢提醒、股價警示訊息生成">
              <select
                className="input"
                value={settings.llmProvider || 'openai'}
                onChange={(e) => {
                  const prov = e.target.value
                  const firstModel = LLM_PROVIDERS.find(p => p.value === prov)?.models[0] || ''
                  setSettings(s => ({ ...s, llmProvider: prov, llmModel: firstModel }))
                }}
              >
                {LLM_PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>

            <Field label="模型">
              <select
                className="input"
                value={settings.llmModel || activeProv.models[0]}
                onChange={(e) => set('llmModel', e.target.value)}
              >
                {activeProv.models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>

            <Field label={activeProv.keyLabel} hint={activeProv.keyHint}>
              <input
                className="input"
                type="password"
                placeholder={activeProv.placeholder}
                value={settings[activeProv.keyField] || ''}
                onChange={(e) => set(activeProv.keyField, e.target.value)}
              />
              {activeProv.keyUrl && (
                <div style={{ marginTop: 4 }}>
                  👉 <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 6px', color: 'var(--accent-light)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => window.electronAPI.openExternal(activeProv.keyUrl)}
                  >
                    {activeProv.keyUrlLabel}
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleTestLlm}
                  disabled={testing || !settings[activeProv.keyField]}
                >
                  {testing ? '測試中...' : '🔌 測試連線'}
                </button>
                {testResult === 'ok'   && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ 連線成功！</span>}
                {testResult === 'fail' && (
                  <span style={{ fontSize: 12, color: 'var(--red)', userSelect: 'text', cursor: 'text', lineHeight: 1.5 }}>
                    ✗ 失敗：{linkifyError(testError) || '請確認 Key 是否正確'}
                  </span>
                )}
              </div>
            </Field>
          </Section>

        </div>

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--card-border)',
  },
  modalTitle: { fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' },
  modalBody:  { padding: '8px 24px' },
  modalFooter:{
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px',
    borderTop: '1px solid var(--card-border)',
  },

  section:     { padding: '16px 0' },
  sectionTitle:{ fontSize: 12, fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 },
  sectionBody: { display: 'flex', flexDirection: 'column', gap: 14 },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' },
  hint:  { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 },
}

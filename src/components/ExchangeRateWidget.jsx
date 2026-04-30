import React, { useState, useEffect, useCallback, useRef } from 'react'

const COMMON_CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'HKD', 'SGD', 'CNY', 'KRW', 'CHF', 'NZD', 'THB']

const CURRENCY_NAMES = {
  USD: '美元', JPY: '日圓', EUR: '歐元', GBP: '英鎊', AUD: '澳幣',
  CAD: '加幣', CHF: '瑞士法郎', HKD: '港幣', SGD: '新幣', KRW: '韓元',
  CNY: '人民幣', NZD: '紐幣', ZAR: '南非幣', SEK: '瑞典克朗', NOK: '挪威克朗',
  DKK: '丹麥克朗', THB: '泰銖', MYR: '馬來幣', PHP: '菲律賓披索',
  IDR: '印尼盾', VND: '越南盾',
}

const FLAG = {
  USD: '🇺🇸', JPY: '🇯🇵', EUR: '🇪🇺', GBP: '🇬🇧', AUD: '🇦🇺',
  CAD: '🇨🇦', CHF: '🇨🇭', HKD: '🇭🇰', SGD: '🇸🇬', KRW: '🇰🇷',
  CNY: '🇨🇳', NZD: '🇳🇿', ZAR: '🇿🇦', SEK: '🇸🇪', NOK: '🇳🇴',
  DKK: '🇩🇰', THB: '🇹🇭', MYR: '🇲🇾', PHP: '🇵🇭', IDR: '🇮🇩', VND: '🇻🇳',
}

const RATE_TYPE_OPTIONS = [
  { value: 'spotSell', label: '即期賣出（買外幣）' },
  { value: 'spotBuy',  label: '即期買入（賣外幣）' },
  { value: 'cashSell', label: '現金賣出（買現鈔）' },
  { value: 'cashBuy',  label: '現金買入（賣現鈔）' },
]

function fmt(v) {
  if (v == null) return '—'
  return Number(v).toFixed(4)
}

function sortCurrencies(codes) {
  return [...codes].sort((a, b) => {
    const ai = COMMON_CURRENCIES.indexOf(a), bi = COMMON_CURRENCIES.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

const LS_BANK   = 'exr_selectedBank'
const LS_CUR    = 'exr_queryCur'
const LS_ACTION = 'exr_queryAction'

export default function ExchangeRateWidget() {
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [selectedBank,  setSelectedBank]  = useState(() => localStorage.getItem(LS_BANK) || null)
  // AI query controls
  const [queryCur,      setQueryCur]      = useState(() => localStorage.getItem(LS_CUR)    || 'USD')
  const [queryAction,   setQueryAction]   = useState(() => localStorage.getItem(LS_ACTION) || 'buy')
  const [advice,        setAdvice]        = useState(null)
  const [bestBank,      setBestBank]      = useState(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  // Rate alerts
  const [rateAlerts,    setRateAlerts]    = useState([])
  const [firedAlerts,   setFiredAlerts]   = useState([])   // live notifications shown in widget
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [alertForm,     setAlertForm]     = useState({ currency: 'USD', rateType: 'spotSell', direction: 'below', targetRate: '', bank: '', note: '' })
  const [alertSaving,   setAlertSaving]   = useState(false)
  const timerRef = useRef(null)

  // Persist preferences whenever they change
  useEffect(() => { if (selectedBank) localStorage.setItem(LS_BANK,   selectedBank) }, [selectedBank])
  useEffect(() => { localStorage.setItem(LS_CUR,    queryCur)    }, [queryCur])
  useEffect(() => { localStorage.setItem(LS_ACTION, queryAction) }, [queryAction])

  const loadAlerts = useCallback(async () => {
    const list = await window.electronAPI.getRateAlerts()
    setRateAlerts(list || [])
  }, [])

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    if (force) {
      setData(null)
      setAdvice(null)
      setBestBank(null)
    }
    try {
      const res = await window.electronAPI.getExchangeRates(force ? { force: true } : {})
      setData(res)
      setSelectedBank(prev => {
        if (prev && res.banks?.[prev] && Object.keys(res.banks[prev].currencies || {}).length > 0) return prev
        const first = Object.keys(res.banks || {}).find(b => Object.keys(res.banks[b].currencies || {}).length > 0)
        return first || prev
      })
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, []) // eslint-disable-line

  useEffect(() => {
    load()
    loadAlerts()
    timerRef.current = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(timerRef.current)
  }, []) // eslint-disable-line

  useEffect(() => {
    const unsub = window.electronAPI.onDataRefresh((data) => {
      if (data.type === 'settings-updated') load()
    })
    return unsub
  }, [load])

  // Listen for rate-alert events pushed from main process
  useEffect(() => {
    const unsub = window.electronAPI.onRateAlert((alert) => {
      setFiredAlerts(prev => [{ ...alert, _key: Date.now() }, ...prev].slice(0, 5))
    })
    return unsub
  }, [])

  const fetchAdvice = useCallback(async () => {
    if (!data?.banks) return
    setAdviceLoading(true)
    setAdvice(null)
    setBestBank(null)
    const res = await window.electronAPI.getBestRateAdvice({ currency: queryCur, action: queryAction, banks: data.banks })
    setAdvice(res.advice)
    setBestBank(res.best)
    setAdviceLoading(false)
  }, [data, queryCur, queryAction])

  const handleAddAlert = useCallback(async (e) => {
    e.preventDefault()
    if (!alertForm.targetRate) return
    setAlertSaving(true)
    const newAlert = await window.electronAPI.addRateAlert({
      ...alertForm,
      bank: alertForm.bank || null,
    })
    setRateAlerts(prev => [...prev, newAlert])
    setAlertForm({ currency: 'USD', rateType: 'spotSell', direction: 'below', targetRate: '', bank: '', note: '' })
    setShowAlertForm(false)
    setAlertSaving(false)
  }, [alertForm])

  const handleRemoveAlert = useCallback(async (id) => {
    await window.electronAPI.removeRateAlert(id)
    setRateAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  const banks     = data?.banks || {}
  const bankNames = Object.keys(banks).filter(b => Object.keys(banks[b].currencies || {}).length > 0)
  const curMap     = selectedBank ? (banks[selectedBank]?.currencies || {}) : {}
  const currencies = sortCurrencies(Object.keys(curMap))
  const allCurrencies = sortCurrencies([...new Set(bankNames.flatMap(b => Object.keys(banks[b].currencies || {})))])

  const fetchedAt = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="card fade-in" style={styles.container}>
      {/* Header */}
      <div className="widget-header">
        <span className="widget-icon">💱</span>
        <span className="widget-title">匯率監控</span>
        {fetchedAt && <span style={styles.updateTime}>更新 {fetchedAt}</span>}
        <div style={{ flex: 1 }} />
        <button
          className={`btn btn-ghost btn-sm btn-icon ${showAlertForm ? 'btn-primary' : ''}`}
          onClick={() => setShowAlertForm(v => !v)}
          title="匯率達標提醒"
          style={{ marginRight: 2 }}
        >🔔{rateAlerts.length > 0 && <span style={styles.alertBadge}>{rateAlerts.length}</span>}</button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => load(true)} disabled={loading} title="重新整理">
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Fired alert notifications */}
      {firedAlerts.length > 0 && (
        <div style={styles.alertsBox}>
          {firedAlerts.map((a, i) => (
            <div key={a._key} style={styles.alertRow}>
              <span style={{ fontSize: 14 }}>🔔</span>
              <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', flex: 1 }}>{a.message}</span>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFiredAlerts(p => p.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Alert management panel */}
      {showAlertForm && (
        <div style={styles.alertPanel}>
          {/* Existing alerts list */}
          {rateAlerts.length > 0 && (
            <div style={styles.alertList}>
              {rateAlerts.map(a => {
                const typeLabel = RATE_TYPE_OPTIONS.find(o => o.value === a.rateType)?.label?.split('（')[0] || a.rateType
                const dirLabel  = a.direction === 'above' ? '高於' : '低於'
                const flagStr   = FLAG[a.currency] || ''
                return (
                  <div key={a.id} style={styles.alertItem}>
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-primary)', flex: 1 }}>
                      {flagStr} {a.currency} {typeLabel} {dirLabel} {a.targetRate}
                      {a.bank && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>（{a.bank}）</span>}
                      {a.note && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>— {a.note}</span>}
                    </span>
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--red)' }} onClick={() => handleRemoveAlert(a.id)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add new alert form */}
          <form onSubmit={handleAddAlert} style={styles.alertForm}>
            <div style={styles.alertFormRow}>
              {/* Currency */}
              <select className="input" style={styles.alertSelect} value={alertForm.currency}
                onChange={e => setAlertForm(p => ({ ...p, currency: e.target.value }))}>
                {(allCurrencies.length ? allCurrencies : COMMON_CURRENCIES).map(c => (
                  <option key={c} value={c}>{FLAG[c] || ''} {c}</option>
                ))}
              </select>
              {/* Rate type */}
              <select className="input" style={styles.alertSelect} value={alertForm.rateType}
                onChange={e => setAlertForm(p => ({ ...p, rateType: e.target.value }))}>
                {RATE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label.split('（')[0]}</option>)}
              </select>
              {/* Direction */}
              <select className="input" style={{ ...styles.alertSelect, minWidth: 60 }} value={alertForm.direction}
                onChange={e => setAlertForm(p => ({ ...p, direction: e.target.value }))}>
                <option value="below">低於</option>
                <option value="above">高於</option>
              </select>
              {/* Target rate */}
              <input className="input" type="number" step="0.0001" min="0" placeholder="目標匯率"
                style={{ ...styles.alertSelect, minWidth: 90 }}
                value={alertForm.targetRate}
                onChange={e => setAlertForm(p => ({ ...p, targetRate: e.target.value }))}
                required
              />
            </div>
            <div style={styles.alertFormRow}>
              {/* Bank (optional) */}
              <select className="input" style={styles.alertSelect} value={alertForm.bank}
                onChange={e => setAlertForm(p => ({ ...p, bank: e.target.value }))}>
                <option value="">任意銀行</option>
                {bankNames.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {/* Note (optional) */}
              <input className="input" type="text" placeholder="備註（選填）"
                style={{ ...styles.alertSelect, flex: 1 }}
                value={alertForm.note}
                onChange={e => setAlertForm(p => ({ ...p, note: e.target.value }))}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={alertSaving || !alertForm.targetRate}>
                {alertSaving ? '…' : '＋ 新增'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bank selector + AI query bar */}
      <div style={styles.controlBar}>
        <select className="input" style={styles.bankSelect} value={selectedBank || ''}
          onChange={e => setSelectedBank(e.target.value)}>
          <option value="" disabled>選擇銀行</option>
          {bankNames.map(b => (
            <option key={b} value={b}>{b === bestBank ? `★ ${b}` : b}</option>
          ))}
        </select>

        <div style={styles.divider} />

        <select className="input" style={styles.curSelect} value={queryCur}
          onChange={e => setQueryCur(e.target.value)}>
          {allCurrencies.map(c => (
            <option key={c} value={c}>{FLAG[c] || ''} {c}{CURRENCY_NAMES[c] ? ` ${CURRENCY_NAMES[c]}` : ''}</option>
          ))}
        </select>
        <div style={styles.toggle}>
          <button className={`btn btn-sm ${queryAction === 'buy' ? 'btn-primary' : 'btn-ghost'}`}
            style={styles.toggleBtn} onClick={() => setQueryAction('buy')}>買入</button>
          <button className={`btn btn-sm ${queryAction === 'sell' ? 'btn-primary' : 'btn-ghost'}`}
            style={styles.toggleBtn} onClick={() => setQueryAction('sell')}>賣出</button>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--fs-meta)', padding: '4px 10px', whiteSpace: 'nowrap' }}
          onClick={fetchAdvice} disabled={adviceLoading || !data}>
          {adviceLoading ? '…' : '🤖 找最佳'}
        </button>
      </div>

      {/* AI advice result */}
      {(advice || adviceLoading) && (
        <div style={{ ...styles.aiBox, opacity: adviceLoading ? 0.6 : 1 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🤖</span>
          <span style={styles.aiText}>{adviceLoading ? 'AI 分析中...' : advice}</span>
          {bestBank && !adviceLoading && (
            <button className="btn btn-ghost btn-sm"
              style={{ fontSize: 'var(--fs-meta)', padding: '2px 8px', flexShrink: 0, color: 'var(--green)', borderColor: 'rgba(80,200,120,0.3)' }}
              onClick={() => setSelectedBank(bestBank)}>★ 看 {bestBank}</button>
          )}
          {!adviceLoading && (
            <button className="btn btn-ghost btn-sm btn-icon"
              style={{ flexShrink: 0, marginLeft: 2, color: 'var(--text-muted)' }}
              onClick={() => { setAdvice(null); setBestBank(null) }}
              title="關閉">✕</button>
          )}
        </div>
      )}

      {/* Table body */}
      <div style={styles.body}>
        {loading && !data && (
          <div style={styles.center}>
            <div className="spinner" />
            <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>載入匯率中...</div>
          </div>
        )}
        {error && (
          <div style={styles.center}>
            <div style={{ color: 'var(--red)', fontSize: 'var(--fs-body)' }}>無法取得匯率：{error}</div>
            <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginTop: 8 }}>重試</button>
          </div>
        )}
        {!loading && !error && !selectedBank && data && (
          <div style={styles.center}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>請先選擇銀行</div>
          </div>
        )}
        {selectedBank && currencies.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>幣別</th>
                <th style={styles.th}>現金買入</th>
                <th style={styles.th}>現金賣出</th>
                <th style={styles.th}>即期買入</th>
                <th style={styles.th}>即期賣出</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map(code => {
                const rate = curMap[code]
                const isHighlight = code === queryCur
                const isBestHighlight = isHighlight && selectedBank === bestBank
                return (
                  <tr key={code}
                    style={{ background: isBestHighlight ? 'rgba(80,200,120,0.08)' : isHighlight ? 'rgba(74,144,196,0.10)' : 'transparent' }}
                  >
                    <td style={styles.td}>
                      <span style={{ marginRight: 5 }}>{FLAG[code] || ''}</span>
                      <span style={{ fontWeight: isHighlight ? 700 : 500, color: 'var(--text-primary)' }}>{code}</span>
                      {CURRENCY_NAMES[code] && (
                        <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-muted)', marginLeft: 5 }}>{CURRENCY_NAMES[code]}</span>
                      )}
                      {isBestHighlight && <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--green)', marginLeft: 4 }}>★最佳</span>}
                    </td>
                    <td style={styles.tdNum}>{fmt(rate.cashBuy)}</td>
                    <td style={styles.tdNum}>{fmt(rate.cashSell)}</td>
                    <td style={{ ...styles.tdNum, color: isHighlight && queryAction === 'sell' ? 'var(--green)' : 'inherit', fontWeight: isHighlight && queryAction === 'sell' ? 700 : 400 }}>
                      {fmt(rate.spotBuy)}
                    </td>
                    <td style={{ ...styles.tdNum, color: isHighlight && queryAction === 'buy' ? 'var(--accent-light)' : 'inherit', fontWeight: isHighlight && queryAction === 'buy' ? 700 : 400 }}>
                      {fmt(rate.spotSell)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles = {
  container:  { display: 'flex', flexDirection: 'column', height: '100%' },
  body:       { flex: 1, overflowY: 'auto', minHeight: 0 },
  center:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' },
  updateTime: { fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginLeft: 8 },

  alertBadge: { display: 'inline-block', background: 'var(--accent)', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 700, padding: '1px 4px', marginLeft: 2, verticalAlign: 'top', lineHeight: '14px' },

  alertsBox: { background: 'var(--yellow-dim)', borderBottom: '1px solid rgba(212,169,74,0.2)', display: 'flex', flexDirection: 'column', gap: 0 },
  alertRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 14px' },

  alertPanel: { borderBottom: '1px solid rgba(100,160,210,0.1)', background: 'rgba(74,144,196,0.04)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  alertList:  { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 },
  alertItem:  { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(100,160,210,0.06)', borderRadius: 6, border: '1px solid rgba(100,160,210,0.1)' },
  alertForm:  { display: 'flex', flexDirection: 'column', gap: 6 },
  alertFormRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  alertSelect:  { fontSize: 'var(--fs-body)', padding: '4px 6px', height: 30, minWidth: 70, flex: '0 0 auto' },

  controlBar: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(100,160,210,0.08)', flexWrap: 'nowrap', overflowX: 'auto' },
  bankSelect: { fontSize: 'var(--fs-body)', padding: '4px 8px', height: 30, flex: '0 0 auto', minWidth: 80, maxWidth: 130 },
  divider:    { width: 1, height: 20, background: 'rgba(100,160,210,0.2)', flexShrink: 0 },
  curSelect:  { fontSize: 'var(--fs-body)', padding: '4px 8px', height: 30, flex: 1, minWidth: 80 },
  toggle:     { display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(100,160,210,0.2)', flexShrink: 0 },
  toggleBtn:  { borderRadius: 0, border: 'none', padding: '4px 10px', fontSize: 'var(--fs-meta)' },

  aiBox:  { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'rgba(74,144,196,0.07)', borderBottom: '1px solid rgba(100,160,210,0.08)' },
  aiText: { fontSize: 'var(--fs-body)', color: 'var(--text-primary)', flex: 1, lineHeight: 1.5 },

  table:  { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th:     { padding: '7px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--fs-meta)', borderBottom: '1px solid rgba(100,160,210,0.12)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-card)' },
  td:     { padding: '6px 12px', textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(100,160,210,0.05)', whiteSpace: 'nowrap' },
  tdNum:  { padding: '6px 12px', textAlign: 'right', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(100,160,210,0.05)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
}


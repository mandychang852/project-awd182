import React, { useState, useEffect, useCallback, useRef } from 'react'

function fmt(n, digits = 2) {
  if (n == null) return '–'
  return n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtPct(n) {
  if (n == null) return '–'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// Drag-to-reorder row shown in sorting mode
function SortableRow({ stock, dragHandlers }) {
  return (
    <div
      draggable
      {...dragHandlers}
      style={{
        ...styles.stockRow,
        cursor: 'grab',
        background: 'rgba(100,160,210,0.04)',
        userSelect: 'none',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 18, paddingRight: 4, cursor: 'grab' }}>⠿</div>
      <div style={styles.stockLeft}>
        <div style={styles.symbol}>{stock.symbol.replace(/\.(TW|TWO)$/, '')}</div>
        <div style={styles.stockName}>{stock.name}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={styles.badgeBlock}>
        {stock.targetHigh && <span className="badge badge-green" style={{ fontSize: 9 }}>↑{stock.targetHigh}</span>}
        {stock.targetLow  && <span className="badge badge-red"   style={{ fontSize: 9 }}>↓{stock.targetLow}</span>}
      </div>
    </div>
  )
}

function StockRow({ stock, onEdit, onRemove }) {
  const isUp   = stock.changePct >= 0
  const hasPnl = stock.pnl != null

  return (
    <div style={styles.stockRow}>
      <div style={styles.stockLeft}>
        <div style={styles.symbol}>{stock.symbol.replace(/\.(TW|TWO)$/, '')}</div>
        <div style={styles.stockName}>{stock.name}</div>
        {stock.marketState === 'CLOSED' && (
          <span className="badge badge-muted" style={{ fontSize: 9 }}>收盤</span>
        )}
      </div>

      <div style={styles.stockMid}>
        {stock.error ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>無法取得報僷</span>
        ) : (
          <>
            <div style={styles.price}>{fmt(stock.price, stock.symbol.endsWith('.TW') ? 1 : 2)}</div>
            <div style={{ color: isUp ? 'var(--red)' : 'var(--green)', fontSize: 'var(--fs-body)', fontWeight: 600 }}>
              {isUp ? '▲' : '▼'} {fmtPct(stock.changePct)}
            </div>
          </>
        )}
      </div>

      {/* P&L 欄——永遠佔位，沒資料则空白 */}
      <div style={styles.pnlBlock}>
        {hasPnl && (
          <>
            <div style={{ color: stock.pnl >= 0 ? 'var(--red)' : 'var(--green)', fontSize: 'var(--fs-body)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {stock.pnl >= 0 ? '+' : ''}{fmt(stock.pnl, 0)}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-tiny)', whiteSpace: 'nowrap' }}>
              {fmtPct(stock.pnlPct)}
            </div>
          </>
        )}
      </div>

      {/* Badge 欄——永遠佔位，沒資料則空白 */}
      <div style={styles.badgeBlock}>
        {stock.targetHigh && (
          <span className="badge badge-green" style={{ fontSize: 9 }}>↑{stock.targetHigh}</span>
        )}
        {stock.targetLow && (
          <span className="badge badge-red" style={{ fontSize: 9 }}>↓{stock.targetLow}</span>
        )}
      </div>

      <div style={styles.stockActions}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onEdit(stock)} title="編輯">✏️</button>
        <button className="btn btn-danger btn-sm btn-icon" onClick={() => onRemove(stock.symbol)} title="刪除">✕</button>
      </div>
    </div>
  )
}

function AddStockForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({
    symbol: '', name: '', avgPrice: '', shares: '', targetHigh: '', targetLow: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const rawSymbol = form.symbol.trim()
    const rawName   = form.name.trim()
    if (!rawSymbol && !rawName) { setError('請填入股票代號或名稱（擇一即可）'); return }
    setLoading(true)
    setError('')

    let resolvedSymbol = rawSymbol.toUpperCase()
    let resolvedName   = rawName

    if (rawSymbol) {
      // Has symbol → auto-lookup to resolve .TW/.TWO and get Chinese name
      if (/^\d+$/.test(rawSymbol) || !resolvedName) {
        const lookup = await window.electronAPI.lookupStock(rawSymbol)
        if (!lookup) {
          setLoading(false)
          setError('查無此股票，請確認代號（台股純數字，或手動加 .TW / .TWO，外股如 NVDA）')
          return
        }
        resolvedSymbol = lookup.symbol
        if (!resolvedName) resolvedName = lookup.name
      }
    } else {
      // No symbol, only name → search by name
      const lookup = await window.electronAPI.lookupStockByName(rawName)
      if (!lookup) {
        setLoading(false)
        setError('查無此名稱，建議改用股票代號搜尋')
        return
      }
      resolvedSymbol = lookup.symbol
      if (!resolvedName) resolvedName = lookup.name
    }

    const stock = {
      symbol:     resolvedSymbol,
      name:       resolvedName || resolvedSymbol,
      avgPrice:   form.avgPrice   ? parseFloat(form.avgPrice)   : null,
      shares:     form.shares     ? parseFloat(form.shares)     : null,
      targetHigh: form.targetHigh ? parseFloat(form.targetHigh) : null,
      targetLow:  form.targetLow  ? parseFloat(form.targetLow)  : null,
    }
    const res = await window.electronAPI.addStock(stock)
    setLoading(false)
    if (res.error) { setError('該股票已存在'); return }
    onAdd()
  }

  return (
    <form onSubmit={handleSubmit} style={styles.addForm}>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>股票代號</label>
          <input className="input" placeholder="2330 或 NVDA" value={form.symbol} onChange={(e) => set('symbol', e.target.value)} />
          <div style={styles.hint}>台股純數字自動判斷，外股如 NVDA</div>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>股票名稱</label>
          <input className="input" placeholder="台積電" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div style={styles.hint}>代號或名稱填一個就夠了</div>
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>買入均價（選填）</label>
          <input className="input" type="number" placeholder="800" value={form.avgPrice} onChange={(e) => set('avgPrice', e.target.value)} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>持有股數（選填）</label>
          <input className="input" type="number" placeholder="100" value={form.shares} onChange={(e) => set('shares', e.target.value)} />
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={{ ...styles.formGroup, maxWidth: 180 }}>
          <label style={styles.label}>🔔 目標高價</label>
          <input className="input" type="number" placeholder="900（到達時通知）" value={form.targetHigh} onChange={(e) => set('targetHigh', e.target.value)} />
          <label style={{ ...styles.label, marginTop: 6 }}>⚠️ 警示低價</label>
          <input className="input" type="number" placeholder="700（跌破時通知）" value={form.targetLow} onChange={(e) => set('targetLow', e.target.value)} />
        </div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-body)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '新增中...' : '＋ 新增'}
        </button>
      </div>
    </form>
  )
}

function EditStockForm({ stock, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:       stock.name        || '',
    avgPrice:   stock.avgPrice  != null ? String(stock.avgPrice)  : '',
    shares:     stock.shares    != null ? String(stock.shares)    : '',
    targetHigh: stock.targetHigh != null ? String(stock.targetHigh) : '',
    targetLow:  stock.targetLow  != null ? String(stock.targetLow)  : '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('名稱為必填'); return }
    setLoading(true)
    const updated = {
      symbol:     stock.symbol,
      name:       form.name.trim(),
      avgPrice:   form.avgPrice   ? parseFloat(form.avgPrice)   : null,
      shares:     form.shares     ? parseFloat(form.shares)     : null,
      targetHigh: form.targetHigh ? parseFloat(form.targetHigh) : null,
      targetLow:  form.targetLow  ? parseFloat(form.targetLow)  : null,
    }
    const res = await window.electronAPI.updateStock(updated)
    setLoading(false)
    if (res.error) { setError('更新失敗'); return }
    onSave()
  }

  return (
    <form onSubmit={handleSubmit} style={styles.addForm}>
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginBottom: 4 }}>
        編輯：<strong style={{ color: 'var(--text-primary)' }}>{stock.symbol}</strong>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>股票名稱 <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>買入均價（選填）</label>
          <input className="input" type="number" placeholder="800" value={form.avgPrice} onChange={(e) => set('avgPrice', e.target.value)} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>持有股數（選填）</label>
          <input className="input" type="number" placeholder="100" value={form.shares} onChange={(e) => set('shares', e.target.value)} />
        </div>
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label style={styles.label}>🔔 目標高價</label>
          <input className="input" type="number" placeholder="900" value={form.targetHigh} onChange={(e) => set('targetHigh', e.target.value)} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>⚠️ 警示低價</label>
          <input className="input" type="number" placeholder="700" value={form.targetLow} onChange={(e) => set('targetLow', e.target.value)} />
        </div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-body)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '更新中...' : '✓ 儲存'}
        </button>
      </div>
    </form>
  )
}

export default function StockWidget({ alerts = [], onDismiss }) {
  const [stocks,       setStocks]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [adding,       setAdding]       = useState(false)
  const [editingStock, setEditingStock] = useState(null)
  const [sorting,      setSorting]      = useState(false)
  const [sortOrder,    setSortOrder]    = useState([])   // symbols in display order
  const dragOver = useRef(null)   // symbol being dragged over

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.getStocks()
    setStocks(res.stocks || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Listen for real-time stock refresh and settings changes from main process
  useEffect(() => {
    const unsub = window.electronAPI.onDataRefresh((data) => {
      if (data.type === 'stocks') setStocks(data.stocks || [])
      if (data.type === 'settings-updated') load()
    })
    return unsub
  }, [load])

  const handleRemove = async (symbol) => {
    await window.electronAPI.removeStock(symbol)
    load()
  }

  // ── Sort mode ────────────────────────────────────────────────────────────
  const enterSort = () => {
    setSortOrder(stocks.map((s) => s.symbol))
    setAdding(false)
    setEditingStock(null)
    setSorting(true)
  }

  const saveSort = async () => {
    await window.electronAPI.reorderStocks(sortOrder)
    setSorting(false)
    load()
  }

  const makeDragHandlers = (symbol) => ({
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('symbol', symbol)
    },
    onDragOver: (e) => {
      e.preventDefault()
      if (dragOver.current === symbol) return
      dragOver.current = symbol
      setSortOrder((prev) => {
        const from = prev.indexOf(e.dataTransfer.getData('symbol') || '')
        const to   = prev.indexOf(symbol)
        // getData may be empty during dragover on some platforms; use a ref
        return prev  // updated in onDrop
      })
    },
    onDrop: (e) => {
      e.preventDefault()
      const dragged = e.dataTransfer.getData('symbol')
      if (!dragged || dragged === symbol) return
      setSortOrder((prev) => {
        const next = [...prev]
        const from = next.indexOf(dragged)
        const to   = next.indexOf(symbol)
        if (from === -1 || to === -1) return prev
        next.splice(from, 1)
        next.splice(to, 0, dragged)
        return next
      })
    },
    onDragEnd: () => { dragOver.current = null },
  })

  // 分幣別累計損益
  const pnlByCurrency = {}
  stocks.forEach((s) => {
    if (s.pnl == null) return
    const cur = s.currency || (s.symbol.endsWith('.TW') || s.symbol.endsWith('.TWO') ? 'TWD' : 'USD')
    pnlByCurrency[cur] = (pnlByCurrency[cur] || 0) + s.pnl
  })
  const hasPnl = Object.keys(pnlByCurrency).length > 0
  const CUR_LABEL = { TWD: '台幣', USD: '美元', EUR: '歐元', HKD: '港幣' }
  const CUR_SYMBOL = { TWD: '', USD: '$', EUR: '€', HKD: 'HK$' }

  return (
    <div className="card fade-in" style={styles.container}>
      <div className="widget-header">
        <span className="widget-icon">📈</span>
        <span className="widget-title">股價監控</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm btn-icon" onClick={load} title="重新整理">↻</button>
        {!sorting && stocks.length > 1 && (
          <button className="btn btn-ghost btn-sm" onClick={enterSort}>⇅ 排序</button>
        )}
        {sorting ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setSorting(false)}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={saveSort}>✓ 完成</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}>
            {adding ? '✕ 取消' : '＋ 新增'}
          </button>
        )}
      </div>

      {/* 損益小列 */}
      {hasPnl && (
        <div style={styles.pnlRow}>
          <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginRight: 6 }}>總損益</span>
          {Object.entries(pnlByCurrency).map(([cur, pnl]) => (
            <span key={cur} style={{ ...styles.pnlChip, color: pnl >= 0 ? 'var(--red)' : 'var(--green)' }}>
              {pnl >= 0 ? '▲' : '▼'} {CUR_LABEL[cur] ?? cur} {CUR_SYMBOL[cur]}{fmt(Math.abs(pnl), 0)}
            </span>
          ))}
        </div>
      )}

      {/* Recent alerts */}
      {alerts.length > 0 && (
        <div style={styles.alertsBox}>
          {alerts.map((alert, i) => (
            <div key={i} style={styles.alertRow}>
              <span style={{ color: 'var(--yellow)', fontSize: 13 }}>🔔</span>
              <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', flex: 1 }}>
                {alert.message}
              </span>
              {onDismiss && (
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => onDismiss(i)}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={styles.body}>
        {adding && (
          <div style={styles.addBox}>
            <AddStockForm onAdd={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />
          </div>
        )}

        {loading ? (
          <div style={styles.center}><div className="spinner" /></div>
        ) : stocks.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>
              點擊「＋ 新增」加入想追蹤的股票
            </div>
          </div>
        ) : sorting ? (
          // ── Sorting mode: show draggable rows ──
          <div style={styles.list}>
            <div style={{ padding: '6px 14px 2px', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
              拖曳左側 ⠿ 調整順序，完成後按「✓ 完成」儲存
            </div>
            {sortOrder.map((sym) => {
              const s = stocks.find((x) => x.symbol === sym)
              if (!s) return null
              return <SortableRow key={sym} stock={s} dragHandlers={makeDragHandlers(sym)} />
            })}
          </div>
        ) : (
          <div style={styles.list}>
            {stocks.map((s) => (
              <React.Fragment key={s.symbol}>
                <StockRow
                  stock={s}
                  onEdit={(s) => { setAdding(false); setEditingStock(s) }}
                  onRemove={handleRemove}
                />
                {editingStock?.symbol === s.symbol && (
                  <div style={styles.addBox}>
                    <EditStockForm
                      stock={editingStock}
                      onSave={() => { setEditingStock(null); load() }}
                      onCancel={() => setEditingStock(null)}
                    />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container:   { display: 'flex', flexDirection: 'column', height: '100%' },
  body:        { flex: 1, overflowY: 'auto', padding: '8px 0' },
  center:      { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, textAlign: 'center' },
  list:        { display: 'flex', flexDirection: 'column' },
  alertsBox:   { display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--yellow-dim)', borderBottom: '1px solid rgba(212,169,74,0.15)', maxHeight: 160, overflowY: 'auto' },
  alertRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 20px' },

  pnlRow:  { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 6px', borderBottom: '1px solid rgba(100,160,210,0.07)' },
  pnlChip: { fontSize: 'var(--fs-body)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' },

  // CSS Grid: 5 equal columns — symbol+name | price+chg | pnl | target badges | actions
  stockRow:    { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(100,160,210,0.06)', transition: 'background 0.15s' },
  stockLeft:   { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' },
  symbol:      { fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stockName:   { fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stockMid:    { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  price:       { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  pnlBlock:    { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  badgeBlock:  { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' },
  stockActions:{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' },

  addBox:  { padding: '12px 20px', borderBottom: '1px solid var(--card-border)' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', gap: 12 },
  formGroup: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  label:   { fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', fontWeight: 600 },
  hint:    { fontSize: 'var(--fs-tiny)', color: 'var(--text-muted)' },
}

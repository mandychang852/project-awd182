import React, { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header.jsx'
import WeatherHoroscopeWidget from './components/WeatherHoroscopeWidget.jsx'
import StockWidget from './components/StockWidget.jsx'
import NotificationWidget from './components/NotificationWidget.jsx'
import ExchangeRateWidget from './components/ExchangeRateWidget.jsx'
import SettingsModal from './components/SettingsModal.jsx'

const PANELS = {
  weather:      ()  => <WeatherHoroscopeWidget />,
  notification: ()  => <NotificationWidget />,
  stock:        (p) => <StockWidget alerts={p.stockAlerts} onDismiss={p.onDismissAlert} />,
  exchange:     ()  => <ExchangeRateWidget />,
}
const DEFAULT_ORDER = ['weather', 'notification', 'stock', 'exchange']
const LS_ORDER     = 'panel_order'
const LS_COL_TOP   = 'grid_col_top'    // top row's column split
const LS_COL_BOT   = 'grid_col_bot'    // bottom row's column split
const LS_ROW_LEFT  = 'grid_row_left'   // left column's row split
const LS_ROW_RIGHT = 'grid_row_right'  // right column's row split (independent)
const GAP        = 14
const MIN_PCT    = 20
const MAX_PCT    = 80

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stockAlerts,  setStockAlerts]  = useState([])
  const [isFirstRun,   setIsFirstRun]   = useState(false)

  // Panel order state (drag-to-reorder)
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_ORDER))
      if (Array.isArray(saved) && saved.length === 4) return saved
    } catch {}
    return DEFAULT_ORDER
  })

  // Split percentages — top row and bottom row each have their own column split
  const [colPctTop, setColPctTop] = useState(() => {
    const v = Number(localStorage.getItem(LS_COL_TOP))
    return v >= MIN_PCT && v <= MAX_PCT ? v : 50
  })
  const [colPctBot, setColPctBot] = useState(() => {
    const v = Number(localStorage.getItem(LS_COL_BOT))
    return v >= MIN_PCT && v <= MAX_PCT ? v : 50
  })
  const [rowPctLeft,  setRowPctLeft]  = useState(() => {
    const v = Number(localStorage.getItem(LS_ROW_LEFT))
    return v >= MIN_PCT && v <= MAX_PCT ? v : 50
  })
  const [rowPctRight, setRowPctRight] = useState(() => {
    const v = Number(localStorage.getItem(LS_ROW_RIGHT))
    return v >= MIN_PCT && v <= MAX_PCT ? v : 50
  })

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [resizing,      setResizing]      = useState(false)

  // Drag-to-reorder state
  const [previewOrder, setPreviewOrder] = useState(null)
  const [dragging,     setDragging]     = useState(false)
  const dragPanelId = useRef(null)
  const previewRef  = useRef(null)
  const gridRef     = useRef(null)

  useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      if (!s.onboardingComplete || (!s.city && !s.zodiacSign)) {
        setIsFirstRun(true)
        setSettingsOpen(true)
      }
    })
    const unsub = window.electronAPI.onStockAlert((alert) => {
      setStockAlerts((prev) => [...prev.slice(-4), alert])
    })
    return () => unsub?.()
  }, [])

  // Measure grid container
  useEffect(() => {
    if (!gridRef.current) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize({ w: width, h: height })
    })
    obs.observe(gridRef.current)
    return () => obs.disconnect()
  }, [])

  // Compute geometry for a cell at display position index
  // Top row and bottom row each have their own column split, so all 4 panels resize independently
  const getPanelGeometry = useCallback((posIdx) => {
    const { w: cW, h: cH } = containerSize
    if (!cW || !cH) return null
    const col = posIdx % 2
    const row = Math.floor(posIdx / 2)
    const colPct = row === 0 ? colPctTop   : colPctBot
    const rowPct = col === 0 ? rowPctLeft  : rowPctRight  // ← independent per column!
    const cW1 = (cW - GAP) * colPct / 100
    const cW2 = cW - GAP - cW1
    const rH1 = (cH - GAP) * rowPct / 100
    const rH2 = cH - GAP - rH1
    return {
      left:   col === 0 ? 0 : cW1 + GAP,
      top:    row === 0 ? 0 : rH1 + GAP,
      width:  col === 0 ? cW1 : cW2,
      height: row === 0 ? rH1 : rH2,
    }
  }, [containerSize, colPctTop, colPctBot, rowPctLeft, rowPctRight])

  // ── Resize divider handlers ────────────────────────────────────────────
  // axes: { colTop, colBot, row } — which axes this drag controls
  const makeDividerHandler = useCallback((axes) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = gridRef.current.getBoundingClientRect()
    setResizing(true)
    const clamp = (v) => Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(v)))
    const move = (ev) => {
      const cp = clamp((ev.clientX - rect.left) / rect.width * 100)
      const rp = clamp((ev.clientY - rect.top)  / rect.height * 100)
      if (axes.colTop)   setColPctTop(cp)
      if (axes.colBot)   setColPctBot(cp)
      if (axes.rowLeft)  setRowPctLeft(rp)
      if (axes.rowRight) setRowPctRight(rp)
    }
    const up = (ev) => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setResizing(false)
      const cp = clamp((ev.clientX - rect.left) / rect.width * 100)
      const rp = clamp((ev.clientY - rect.top)  / rect.height * 100)
      if (axes.colTop)   { setColPctTop(cp);   localStorage.setItem(LS_COL_TOP,   cp) }
      if (axes.colBot)   { setColPctBot(cp);   localStorage.setItem(LS_COL_BOT,   cp) }
      if (axes.rowLeft)  { setRowPctLeft(rp);  localStorage.setItem(LS_ROW_LEFT,  rp) }
      if (axes.rowRight) { setRowPctRight(rp); localStorage.setItem(LS_ROW_RIGHT, rp) }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [])

  const startResizeColTop   = useCallback(makeDividerHandler({ colTop: true }),   [makeDividerHandler])
  const startResizeColBot   = useCallback(makeDividerHandler({ colBot: true }),   [makeDividerHandler])
  const startResizeRowLeft  = useCallback(makeDividerHandler({ rowLeft: true }),  [makeDividerHandler])
  const startResizeRowRight = useCallback(makeDividerHandler({ rowRight: true }), [makeDividerHandler])

  // ── Drag-to-reorder handlers ───────────────────────────────────────────
  const handleDragStart = useCallback((panelId, e) => {
    if (resizing) return
    dragPanelId.current = panelId
    previewRef.current = [...order]
    setPreviewOrder([...order])
    setDragging(true)
    const ghost = document.createElement('span')
    ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }, [order, resizing])

  const handleDragEnter = useCallback((targetPanelId) => {
    const dragged = dragPanelId.current
    if (!dragged || dragged === targetPanelId) return
    const current = previewRef.current ?? order
    const from = current.indexOf(dragged)
    const to   = current.indexOf(targetPanelId)
    if (from === -1 || to === -1 || from === to) return
    const next = [...current]
    next.splice(from, 1)
    next.splice(to, 0, dragged)
    previewRef.current = next
    setPreviewOrder(next)
  }, [order])

  const commitDrop = useCallback((e) => {
    e?.preventDefault()
    const confirmed = previewRef.current
    if (confirmed) {
      setOrder(confirmed)
      localStorage.setItem(LS_ORDER, JSON.stringify(confirmed))
    }
    previewRef.current = null
    setPreviewOrder(null)
    dragPanelId.current = null
    setDragging(false)
  }, [])

  const cancelDrag = useCallback(() => {
    previewRef.current = null
    setPreviewOrder(null)
    dragPanelId.current = null
    setDragging(false)
  }, [])

  const handleSettingsClose = () => {
    setSettingsOpen(false)
    if (isFirstRun) {
      window.electronAPI.saveSettings({ onboardingComplete: true })
      setIsFirstRun(false)
    }
  }

  const displayOrder = previewOrder ?? order
  const ready        = containerSize.w > 0

  // Divider pixel positions
  const topDivX   = ready ? (containerSize.w - GAP) * colPctTop   / 100 : 0
  const botDivX   = ready ? (containerSize.w - GAP) * colPctBot   / 100 : 0
  const leftDivY  = ready ? (containerSize.h - GAP) * rowPctLeft  / 100 : 0
  const rightDivY = ready ? (containerSize.h - GAP) * rowPctRight / 100 : 0

  return (
    <div className="app" style={{ cursor: resizing ? 'inherit' : undefined }}>
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main style={styles.main}>
        <div
          ref={gridRef}
          style={ready ? styles.grid : styles.gridFallback}
          onDragOver={(e) => e.preventDefault()}
          onDrop={commitDrop}
        >
          {/* ── Panels ── */}
          {order.map((panelId) => {
            if (!ready) {
              return (
                <div key={panelId} style={styles.cellFallback}
                  draggable
                  onDragStart={(e) => handleDragStart(panelId, e)}
                  onDragEnter={() => handleDragEnter(panelId)}
                  onDragEnd={cancelDrag}
                >
                  {PANELS[panelId]({ stockAlerts, onDismissAlert: (i) => setStockAlerts((p) => p.filter((_, j) => j !== i)) })}
                </div>
              )
            }
            const displayIdx = displayOrder.indexOf(panelId)
            const geom       = getPanelGeometry(displayIdx)
            if (!geom) return null
            const isDragging = dragging && dragPanelId.current === panelId
            return (
              <div
                key={panelId}
                onDragEnter={() => handleDragEnter(panelId)}
                style={{
                  position: 'absolute',
                  ...geom,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: resizing
                    ? 'none'
                    : isDragging
                    ? 'opacity 0.15s ease, transform 0.15s ease'
                    : 'left 0.25s cubic-bezier(0.34,1.3,0.64,1), top 0.25s cubic-bezier(0.34,1.3,0.64,1), width 0.2s ease, height 0.2s ease, opacity 0.15s ease, transform 0.15s ease',
                  opacity:   isDragging ? 0.35 : 1,
                  transform: isDragging ? 'scale(0.93) rotate(1.2deg)' : 'scale(1) rotate(0deg)',
                  zIndex:    isDragging ? 0 : 1,
                  userSelect: 'none',
                }}
              >
                {/* Drag handle: only top 28px edge triggers panel reorder */}
                {!resizing && (
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(panelId, e)}
                    onDragEnd={cancelDrag}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 28,
                      zIndex: 5, cursor: dragging ? 'grabbing' : 'grab',
                    }}
                  />
                )}
                {PANELS[panelId]({ stockAlerts, onDismissAlert: (i) => setStockAlerts((p) => p.filter((_, j) => j !== i)) })}
              </div>
            )
          })}

          {/* ── Top-row vertical divider (left col height as reference) ── */}
          {ready && (
            <div onMouseDown={startResizeColTop} className="resize-divider resize-divider-v"
              style={{ position: 'absolute', left: topDivX, top: 0, width: GAP, height: leftDivY, cursor: 'col-resize', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="resize-track" style={{ width: 3, height: '40%', borderRadius: 99 }} />
            </div>
          )}

          {/* ── Bottom-row vertical divider (left col bottom as reference) ── */}
          {ready && (
            <div onMouseDown={startResizeColBot} className="resize-divider resize-divider-v"
              style={{ position: 'absolute', left: botDivX, top: leftDivY + GAP, width: GAP, height: containerSize.h - leftDivY - GAP, cursor: 'col-resize', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="resize-track" style={{ width: 3, height: '40%', borderRadius: 99 }} />
            </div>
          )}

          {/* ── Left-column horizontal divider (independent) ── */}
          {ready && (
            <div onMouseDown={startResizeRowLeft} className="resize-divider resize-divider-h"
              style={{ position: 'absolute', left: 0, top: leftDivY, width: topDivX, height: GAP, cursor: 'row-resize', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="resize-track" style={{ height: 3, width: '50%', borderRadius: 99 }} />
            </div>
          )}

          {/* ── Right-column horizontal divider (independent) ── */}
          {ready && (
            <div onMouseDown={startResizeRowRight} className="resize-divider resize-divider-h"
              style={{ position: 'absolute', left: topDivX + GAP, top: rightDivY, width: containerSize.w - topDivX - GAP, height: GAP, cursor: 'row-resize', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="resize-track" style={{ height: 3, width: '50%', borderRadius: 99 }} />
            </div>
          )}
        </div>
      </main>

      {settingsOpen && <SettingsModal onClose={handleSettingsClose} />}


    </div>
  )
}

const styles = {
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 16px 16px',
    overflow: 'hidden',
    minHeight: 0,
  },
  grid:         { flex: 1, position: 'relative', minHeight: 0 },
  gridFallback: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: GAP, minHeight: 0, overflow: 'hidden' },
  cellFallback: { minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
}

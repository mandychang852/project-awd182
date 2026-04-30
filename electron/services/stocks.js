const axios = require('axios')
const { Notification } = require('electron')
const { callLLM, isConfigured } = require('./llm')
const storeService = require('./store')

// Yahoo Finance endpoint – works for both TW (e.g. 2330.TW) and US (e.g. NVDA) stocks
const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

// Fetch raw market data for a fully-qualified symbol
async function _fetchQuoteData(symbol) {
  try {
    const res = await axios.get(`${YF_BASE}/${encodeURIComponent(symbol)}`, {
      params: { interval: '1m', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000,
    })
    const meta = res.data.chart.result?.[0]?.meta
    if (!meta || !meta.regularMarketPrice) return null
    return {
      symbol,
      price:         meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose || meta.previousClose,
      currency:      meta.currency,
      marketState:   meta.marketState,
    }
  } catch {
    return null
  }
}

// Fetch symbol + name only (lighter, used for lookup/add)
async function _fetchMeta(symbol) {
  const isTW  = symbol.endsWith('.TW')
  const isTWO = symbol.endsWith('.TWO')

  // For Taiwan stocks: use TWSE realtime API which always returns Chinese name
  if (isTW || isTWO) {
    const code = symbol.replace(/\.(TW|TWO)$/, '').toLowerCase()
    // Try TSE (上市) first, then OTC (上櫃)
    const candidates = isTWO
      ? [`otc_${code}.tw`, `tse_${code}.tw`]
      : [`tse_${code}.tw`, `otc_${code}.tw`]

    for (const exCh of candidates) {
      try {
        const res = await axios.get('https://mis.twse.com.tw/stock/api/getStockInfo.jsp', {
          params: { ex_ch: exCh, json: 1, delay: 0 },
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://mis.twse.com.tw/stock/fibest.jsp',
          },
          timeout: 8000,
        })
        const item = res.data.msgArray?.[0]
        if (item?.n) {
          // Determine the correct symbol suffix from the exchange field
          const resolvedSymbol = item.ex === 'otc'
            ? `${item.c}.TWO`
            : `${item.c}.TW`
          // Verify there's a live price via Yahoo
          const verify = await _fetchQuoteData(resolvedSymbol)
          if (verify) return { symbol: resolvedSymbol, name: item.n }
          // Even if Yahoo can't price it, return the meta
          return { symbol: resolvedSymbol, name: item.n }
        }
      } catch {}
    }
    // TWSE failed; fall through to Yahoo chart API below
  }

  // Non-TW stocks (US, HK, etc.): use Yahoo Finance chart API
  try {
    const res = await axios.get(`${YF_BASE}/${encodeURIComponent(symbol)}`, {
      params: { interval: '1d', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    })
    const meta = res.data.chart.result?.[0]?.meta
    if (!meta || !meta.regularMarketPrice) return null
    return { symbol, name: meta.shortName || meta.longName || symbol }
  } catch {
    return null
  }
}

// Resolve a user-entered symbol → { symbol, name }
// Pure digits: tries .TW first, then .TWO (OTC market)
async function lookupStock(inputSymbol) {
  const raw = inputSymbol.trim().toUpperCase()
  if (/^\d+$/.test(raw)) {
    const tw = await _fetchMeta(`${raw}.TW`)
    if (tw) return tw
    const two = await _fetchMeta(`${raw}.TWO`)
    if (two) return two
    return null
  }
  return await _fetchMeta(raw)
}

// In-memory cache for TWSE full stock name list (loaded once per session)
let _twStockListCache = null

// Fetch the TWSE+TPEx (上市+上櫃) complete stock list and cache it
// TSE: Code + Name  |  TPEx: SecuritiesCompanyCode + CompanyName
async function _getTWStockList() {
  if (_twStockListCache) return _twStockListCache
  try {
    const [tseRes, otcRes] = await Promise.allSettled([
      axios.get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000,
      }),
      axios.get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', {
        headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000,
      }),
    ])

    const list = []
    if (tseRes.status === 'fulfilled') {
      for (const item of tseRes.value.data || []) {
        if (item.Code && item.Name) {
          list.push({ code: item.Code, name: item.Name, symbol: `${item.Code}.TW` })
        }
      }
    }
    if (otcRes.status === 'fulfilled') {
      for (const item of otcRes.value.data || []) {
        const code = item.SecuritiesCompanyCode
        const name = item.CompanyName
        if (code && name) {
          list.push({ code, name, symbol: `${code}.TWO` })
        }
      }
    }
    if (list.length) _twStockListCache = list
    return list.length ? list : null
  } catch {
    return null
  }
}

// Search by Chinese name or English company name
// For Chinese: queries the TWSE+TPEx full stock list first (accurate), then Yahoo as fallback
// For English / foreign stocks: directly queries Yahoo Finance search
async function lookupByName(query) {
  const q = query.trim()
  if (!q) return null
  const hasChinese = /[\u4e00-\u9fff]/.test(q)

  // ── Chinese name: search against TWSE+TPEx full stock list ─────────────
  if (hasChinese) {
    const list = await _getTWStockList()
    if (list && list.length) {
      // Prefer exact match, then starts-with, then partial
      const exact      = list.find((i) => i.name === q)
      const startsWith = list.find((i) => i.name.startsWith(q) || q.startsWith(i.name))
      const partial    = list.find((i) => i.name.includes(q) || q.includes(i.name))
      const hit = exact || startsWith || partial
      if (hit) {
        const meta = await _fetchMeta(hit.symbol)
        return meta || { symbol: hit.symbol, name: hit.name }
      }
    }
  }

  // ── Fallback: Yahoo Finance search ─────────────────────────────────────
  try {
    const res = await axios.get('https://query2.finance.yahoo.com/v1/finance/search', {
      params: { q, lang: 'zh-TW', region: 'TW', quotesCount: 8, newsCount: 0 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    })
    const equity = (res.data.quotes || []).filter((r) => r.quoteType === 'EQUITY')
    if (!equity.length) return null
    const best = hasChinese
      ? (equity.find((r) => r.symbol.endsWith('.TW') || r.symbol.endsWith('.TWO')) || equity[0])
      : equity[0]
    return await _fetchMeta(best.symbol)
  } catch {
    return null
  }
}

// Fetch live quote; if .TW fails, automatically retry as .TWO
async function fetchQuote(symbol) {
  const data = await _fetchQuoteData(symbol)
  if (data) return data
  if (symbol.endsWith('.TW')) {
    return await _fetchQuoteData(symbol.replace(/\.TW$/, '.TWO'))
  }
  return null
}

async function fetchAllStocks() {
  let stockSettings = storeService.get('stocks') || []
  if (!stockSettings.length) return { stocks: [] }

  // Auto-upgrade English names of TW stocks to Chinese (runs once per symbol until name becomes Chinese)
  const needsUpgrade = stockSettings.filter(
    (s) => (s.symbol.endsWith('.TW') || s.symbol.endsWith('.TWO')) &&
            !/[\u4e00-\u9fff]/.test(s.name || '')
  )
  if (needsUpgrade.length) {
    const upgrades = await Promise.all(needsUpgrade.map((s) => _fetchMeta(s.symbol)))
    let changed = false
    upgrades.forEach((meta, i) => {
      if (meta && /[\u4e00-\u9fff]/.test(meta.name)) {
        stockSettings = stockSettings.map((s) =>
          s.symbol === needsUpgrade[i].symbol ? { ...s, name: meta.name } : s
        )
        changed = true
      }
    })
    if (changed) storeService.set('stocks', stockSettings)
  }

  const quotes = await Promise.all(stockSettings.map((s) => fetchQuote(s.symbol)))

  const stocks = stockSettings.map((setting, i) => {
    const quote = quotes[i]
    if (!quote) return { ...setting, error: true }

    const price  = quote.price
    const change = price - quote.previousClose
    const changePct = ((change / quote.previousClose) * 100)

    let pnl = null
    let pnlPct = null
    if (setting.avgPrice && setting.shares) {
      const costBasis = setting.avgPrice * setting.shares
      const currentValue = price * setting.shares
      pnl = currentValue - costBasis
      pnlPct = ((pnl / costBasis) * 100)
    }

    return {
      ...setting,
      price,
      previousClose: quote.previousClose,
      change,
      changePct,
      pnl,
      pnlPct,
      currency:    quote.currency,
      marketState: quote.marketState,
      error:       false,
    }
  })

  return { stocks }
}

function generateAlertMessage(stock, alertType) {
  const pnlStr = stock.pnl != null
    ? `（損益 ${stock.pnl >= 0 ? '+' : ''}${stock.pnl.toFixed(0)}）`
    : ''
  const price = stock.price

  if (alertType === 'target_high') {
    return `🚀 ${stock.name} 已達目標高價 ${stock.targetHigh}！現價 ${price}${pnlStr}，考慮獲利了結？`
  } else {
    return `📉 ${stock.name} 跌破警示低價 ${stock.targetLow}！現價 ${price}${pnlStr}，注意風險。`
  }
}

async function checkAlerts(stocks, mainWindow) {
  for (const stock of stocks) {
    if (stock.error) continue

    let alertType = null
    if (stock.targetHigh && stock.price >= stock.targetHigh) alertType = 'target_high'
    if (stock.targetLow  && stock.price <= stock.targetLow)  alertType = 'target_low'

    if (!alertType) continue

    // Check cooldown – don't fire again within 1 hour
    const cooldownKey   = `alert_cooldown_${stock.symbol}_${alertType}`
    const lastAlertTime = storeService.get(cooldownKey) || 0
    if (Date.now() - lastAlertTime < 3600000) continue

    storeService.set(cooldownKey, Date.now())

    const message = generateAlertMessage(stock, alertType)

    // System notification
    new Notification({
      title: `📊 ${stock.name} 股價提醒`,
      body:  message,
    }).show()

    // Push to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stock-alert', {
        stock,
        alertType,
        message,
        timestamp: Date.now(),
      })
    }
  }
}

function addStock(stock) {
  const stocks = storeService.get('stocks') || []
  const exists = stocks.find((s) => s.symbol === stock.symbol)
  if (exists) return { error: 'already_exists' }
  stocks.push(stock)
  storeService.set('stocks', stocks)
  return { error: null }
}

function updateStock(updated) {
  const stocks = storeService.get('stocks') || []
  const idx    = stocks.findIndex((s) => s.symbol === updated.symbol)
  if (idx === -1) return { error: 'not_found' }
  const prev = stocks[idx]
  stocks[idx] = { ...prev, ...updated }
  storeService.set('stocks', stocks)
  // Clear cooldowns for any target that changed so new targets fire immediately
  if ('targetHigh' in updated && updated.targetHigh !== prev.targetHigh) {
    storeService.set(`alert_cooldown_${updated.symbol}_target_high`, 0)
  }
  if ('targetLow' in updated && updated.targetLow !== prev.targetLow) {
    storeService.set(`alert_cooldown_${updated.symbol}_target_low`, 0)
  }
  return { error: null }
}

function reorderStocks(symbols) {
  const stocks = storeService.get('stocks') || []
  const reordered = symbols
    .map((sym) => stocks.find((s) => s.symbol === sym))
    .filter(Boolean)
  // Append any that weren't in symbols list (safety)
  const rest = stocks.filter((s) => !symbols.includes(s.symbol))
  storeService.set('stocks', [...reordered, ...rest])
  return { error: null }
}

function removeStock(symbol) {
  const stocks = storeService.get('stocks') || []
  storeService.set('stocks', stocks.filter((s) => s.symbol !== symbol))
  return { error: null }
}

module.exports = { fetchAllStocks, addStock, updateStock, removeStock, checkAlerts, lookupStock, lookupByName, reorderStocks }

const axios  = require('axios')
const storeService = require('./store')

// ── API 設定 ───────────────────────────────────────────────────────────────
const API_URL = 'https://superiorapis-creator.cteam.com.tw/manager/feature/proxy/9f32a9fac529/pub_9f32aace1ed0'
const timeout = 15000

// 支援的幣別（API enum 對應）
const CURRENCY_MAP = {
  USD: 0, CNY: 1, AUD: 2, NZD: 3, ZAR: 4, JPY: 5, GBP: 6, HKD: 7, CAD: 8,
}

// ── Currency display names ─────────────────────────────────────────────────
const CURRENCY_NAMES = {
  USD: '美元', JPY: '日圓', GBP: '英鎊', AUD: '澳幣',
  CAD: '加幣', HKD: '港幣', CNY: '人民幣', NZD: '紐幣', ZAR: '南非幣',
}

// ── Cache ─────────────────────────────────────────────────────────────────
let cache   = null
let cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000

// ── Fetch one currency from API ───────────────────────────────────────────
async function fetchCurrency(code, token) {
  const r = await axios.post(API_URL, {
    currency: CURRENCY_MAP[code],
    sort_options: [{ sort_key: 0, sort_order: 0 }],
  }, {
    headers: { 'Content-Type': 'application/json', token },
    timeout,
  })
  if (!Array.isArray(r.data)) throw new Error('unexpected response')
  return r.data  // [{ bank, spot_rate: { buying, selling }, cash_rate: { buying, selling } }]
}

// ── Fetch all currencies in parallel, build banks structure ───────────────
// API naming (from customer perspective):
//   spot_rate.buying  = customer buying from bank  = 即期賣出 (spotSell)
//   spot_rate.selling = customer selling to bank   = 即期買入 (spotBuy)
//   cash_rate.buying  = customer buying cash       = 現金賣出 (cashSell)
//   cash_rate.selling = customer selling cash      = 現金買入 (cashBuy)
async function fetchAllRates(opts = {}) {
  if (!opts.force && cache && Date.now() - cacheTs < CACHE_TTL) return cache

  const token = storeService.get('exchangeRateToken') || ''
  if (!token) {
    return { banks: {}, fetchedAt: Date.now(), error: 'no_token' }
  }

  const results = await Promise.allSettled(
    Object.keys(CURRENCY_MAP).map(code =>
      fetchCurrency(code, token)
        .then(data => ({ code, data, ok: true }))
        .catch(err => ({ code, data: [], ok: false, error: err.message }))
    )
  )

  const banks = {}
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.ok) {
      const v = r.value || {}
      console.warn('[ExchangeRate] failed:', v.code, v.error)
      continue
    }
    const { code, data } = r.value
    for (const item of data) {
      const bname = item.bank
      if (!banks[bname]) banks[bname] = { currencies: {} }
      banks[bname].currencies[code] = {
        spotBuy:  item.spot_rate?.selling ?? null,
        spotSell: item.spot_rate?.buying  ?? null,
        cashBuy:  item.cash_rate?.selling ?? null,
        cashSell: item.cash_rate?.buying  ?? null,
      }
    }
  }

  cache   = { banks, fetchedAt: Date.now(), error: null }
  cacheTs = Date.now()
  return cache
}

// ── AI best rate recommendation ───────────────────────────────────────────
async function getBestRateAdvice({ currency, action, banks }) {
  const candidates = []

  for (const [bankName, bankData] of Object.entries(banks)) {
    const rate = bankData.currencies?.[currency]
    if (!rate) continue
    const value = action === 'buy' ? (rate.spotSell ?? rate.cashSell) : (rate.spotBuy ?? rate.cashBuy)
    if (!value) continue
    candidates.push({ bankName, value })
  }

  if (!candidates.length) return { advice: '查無此幣別的匯率資料', best: null }

  const best = action === 'buy'
    ? candidates.reduce((a, b) => a.value < b.value ? a : b)
    : candidates.reduce((a, b) => a.value > b.value ? a : b)

  const currencyName = CURRENCY_NAMES[currency] || currency
  const actionLabel  = action === 'buy' ? '買入' : '賣出'

  const tip = action === 'buy'
    ? `買 ${currencyName}，${best.bankName} 即期賣出 ${best.value} 最低，最划算。`
    : `賣 ${currencyName}，${best.bankName} 即期買入 ${best.value} 最高，最划算。`
  return { advice: tip, best: best.bankName }
}

// ── Rate Alerts CRUD ──────────────────────────────────────────────────────
const RATE_TYPE_LABELS = {
  spotBuy: '即期買入', spotSell: '即期賣出',
  cashBuy: '現金買入', cashSell: '現金賣出',
}

function getRateAlerts() {
  return storeService.get('rateAlerts') || []
}

function addRateAlert(alert) {
  const alerts = getRateAlerts()
  const newAlert = {
    id: `ra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    currency:   alert.currency,
    rateType:   alert.rateType,   // spotBuy / spotSell / cashBuy / cashSell
    direction:  alert.direction,  // above / below
    targetRate: parseFloat(alert.targetRate),
    bank:       alert.bank || null,   // null = any bank
    note:       alert.note || '',
    createdAt:  Date.now(),
  }
  storeService.set('rateAlerts', [...alerts, newAlert])
  return newAlert
}

function removeRateAlert(id) {
  const alerts = getRateAlerts().filter(a => a.id !== id)
  storeService.set('rateAlerts', alerts)
}

// ── Check alerts against latest rates ─────────────────────────────────────
const { Notification } = require('electron')

async function checkRateAlerts(banks, mainWindow) {
  const alerts = getRateAlerts()
  if (!alerts.length) return

  for (const alert of alerts) {
    const cooldownKey = `rate_alert_cooldown_${alert.id}`
    const lastFired   = storeService.get(cooldownKey) || 0
    if (Date.now() - lastFired < 3600000) continue  // 1 hour cooldown

    // Collect candidate rates from the specified bank (or all banks)
    const bankEntries = Object.entries(banks).filter(([bname]) =>
      alert.bank === null || bname === alert.bank
    )

    let triggered = false
    let triggeredBank = null
    let triggeredRate = null

    for (const [bname, bankData] of bankEntries) {
      const rate = bankData.currencies?.[alert.currency]?.[alert.rateType]
      if (rate == null) continue

      const hit = alert.direction === 'above' ? rate >= alert.targetRate
                                               : rate <= alert.targetRate
      if (hit) {
        triggered = true
        triggeredBank = bname
        triggeredRate = rate
        break
      }
    }

    if (!triggered) continue

    storeService.set(cooldownKey, Date.now())

    const currName   = CURRENCY_NAMES[alert.currency] || alert.currency
    const typeLabel  = RATE_TYPE_LABELS[alert.rateType] || alert.rateType
    const dirLabel   = alert.direction === 'above' ? '高於' : '低於'
    const bankLabel  = triggeredBank || '某銀行'
    const noteStr    = alert.note ? `（${alert.note}）` : ''

    const title = `💱 匯率達標提醒`
    const body  = `${currName} ${typeLabel} 已${dirLabel}目標 ${alert.targetRate}（現為 ${triggeredRate}，${bankLabel}）${noteStr}`

    new Notification({ title, body }).show()

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('rate-alert', {
        alertId: alert.id,
        currency: alert.currency,
        rateType: alert.rateType,
        direction: alert.direction,
        targetRate: alert.targetRate,
        triggeredRate,
        triggeredBank,
        note: alert.note,
        message: body,
        timestamp: Date.now(),
      })
    }
  }
}

module.exports = { fetchAllRates, getBestRateAdvice, CURRENCY_NAMES, getRateAlerts, addRateAlert, removeRateAlert, checkRateAlerts }

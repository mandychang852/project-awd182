const { app, BrowserWindow, ipcMain, Notification, nativeTheme } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

// Services (loaded after app is ready to avoid early init issues)
let storeService, weatherService, horoscopeService, stocksService, notificationsService, notificationSummaryService, schedulerService, exchangeRateService

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#1E2D3D',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0,
    },
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.setZoomFactor(1.0)
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function loadServices() {
  storeService           = require('./services/store')
  weatherService         = require('./services/weather')
  horoscopeService       = require('./services/horoscope')
  stocksService          = require('./services/stocks')
  notificationsService   = require('./services/notifications')
  notificationSummaryService = require('./services/notificationSummary')
  schedulerService       = require('./services/scheduler')
  exchangeRateService    = require('./services/exchangeRate')
}

function registerIpcHandlers() {
  // ── Caches ────────────────────────────────────────────────────────────────
  let _smartSummaryCache    = null   // { hash, result }
  let _smartSummaryInFlight = null   // dedup in-flight promise
  let _insightCacheDate     = null   // 'YYYY-M-D'
  let _insightCache         = null

  function hashNotifs(notifications) {
    return notifications.map(n => `${n.app}|${n.title}|${n.body}|${n.timestamp}`).join('||')
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('get-settings', () => storeService.getSettings())
  ipcMain.handle('save-settings', (_, settings) => {
    storeService.saveSettings(settings)
    // Clear insight cache so new API key / settings take effect immediately
    _insightCacheDate = null
    _insightCache     = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data-refresh', { type: 'settings-updated' })
    }
  })

  // ── Weather ───────────────────────────────────────────────────────────────
  ipcMain.handle('get-weather', (_e, opts = {}) => {
    if (opts.force) weatherService.clearWeatherCache()
    return weatherService.fetchWeather()
  })

  let _insightInFlight = null  // deduplication: share the same promise if already running

  // ── Horoscope ─────────────────────────────────────────────────────────────
  // TODO: 測試完通知中心後把下面這行改回 false
  const DISABLE_COMBINED_INSIGHT_AI = false

  ipcMain.handle('get-horoscope', () => horoscopeService.generateHoroscope())
  ipcMain.handle('get-combined-insight', async () => {
    if (DISABLE_COMBINED_INSIGHT_AI) return { data: null, disabled: true }
    const today = new Date().toLocaleDateString('zh-TW')
    if (_insightCacheDate === today && _insightCache) return _insightCache
    // If a request is already in-flight, wait for it instead of firing another
    if (_insightInFlight) return _insightInFlight
    _insightInFlight = horoscopeService.generateCombinedInsight().then(result => {
      // Only cache AI-generated results (not fallbacks)
      if (result.data && result.data.fromAI) { _insightCacheDate = today; _insightCache = result }
      _insightInFlight = null
      return result
    }).catch(err => { _insightInFlight = null; throw err })
    return _insightInFlight
  })

  // ── Stocks ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-stocks', async () => {
    const result = await stocksService.fetchAllStocks()
    if (result.stocks?.length) {
      stocksService.checkAlerts(result.stocks, mainWindow).catch(() => {})
    }
    return result
  })
  ipcMain.handle('lookup-stock',      (_, symbol) => stocksService.lookupStock(symbol))
  ipcMain.handle('lookup-stock-by-name', (_, name) => stocksService.lookupByName(name))
  ipcMain.handle('add-stock',      (_, stock)   => stocksService.addStock(stock))
  ipcMain.handle('update-stock',   (_, stock)   => stocksService.updateStock(stock))
  ipcMain.handle('remove-stock',   (_, symbol)  => stocksService.removeStock(symbol))
  ipcMain.handle('reorder-stocks', (_, symbols) => stocksService.reorderStocks(symbols))

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.handle('get-notifications', () => notificationsService.readNotifications())
  ipcMain.handle('get-smart-summary', async (_, opts = {}) => {
    const result = await notificationsService.readNotifications()
    if (result.error === 'permission_denied') return { error: 'permission_denied', groups: [], overallSummary: null }
    if (result.error && result.error !== 'db_not_found') return { error: result.error, groups: [], overallSummary: null }
    if (!result.notifications || !result.notifications.length) return { groups: [], overallSummary: null, demo: true }
    const hash = hashNotifs(result.notifications)
    // Force refresh (user pressed ↻): clear cache so AI is re-run regardless of hash
    if (opts.force) _smartSummaryCache = null
    if (_smartSummaryCache && _smartSummaryCache.hash === hash) return _smartSummaryCache.result
    if (_smartSummaryInFlight) return _smartSummaryInFlight
    _smartSummaryInFlight = notificationSummaryService.generateSmartSummary(result.notifications)
      .then((r) => {
        // Only cache successful AI results; failed/fallback results are NOT cached
        // so the next retry will actually re-call the API
        if (!r.error) _smartSummaryCache = { hash, result: r }
        _smartSummaryInFlight = null
        return r
      })
      .catch((e) => {
        _smartSummaryInFlight = null
        return { groups: [], overallSummary: null, demo: true, error: e.message }
      })
    return _smartSummaryInFlight
  })

  // ── LLM Test ──────────────────────────────────────────────────────────────
  ipcMain.handle('test-llm', async (_, settings) => {
    try {
      const cfg = settings || {}
      const KEY_FIELDS = { openai: 'openaiApiKey', gemini: 'geminiApiKey', claude: 'claudeApiKey' }
      const provider = cfg.llmProvider || storeService.get('llmProvider') || 'openai'
      const model    = cfg.llmModel    || storeService.get('llmModel')    || 'gpt-4o-mini'
      const keyField = KEY_FIELDS[provider] || 'openaiApiKey'
      const apiKey   = cfg[keyField]   || storeService.get(keyField) || ''
      if (!apiKey) return { ok: false, error: 'no_api_key' }

      // Call the API directly (bypass the shared serial queue to avoid delays)
      const axios = require('axios')
      const prompt = '請回覆 OK 兩個字'

      if (provider === 'gemini') {
        const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
        const res  = await axios.post(url, {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        }, { timeout: 20000 })
        return { ok: !!res.data.candidates?.[0]?.content?.parts?.[0]?.text }
      } else if (provider === 'claude') {
        const res = await axios.post('https://api.anthropic.com/v1/messages', {
          model, messages: [{ role: 'user', content: prompt }], max_tokens: 10,
        }, {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          timeout: 20000,
        })
        return { ok: !!res.data.content?.[0]?.text }
      } else {
        const { OpenAI } = require('openai')
        const client = new OpenAI({ apiKey })
        const res = await client.chat.completions.create({
          model, messages: [{ role: 'user', content: prompt }], max_tokens: 10, temperature: 0,
        })
        return { ok: !!res.choices?.[0]?.message?.content }
      }
    } catch (e) {
      const detail = e.response?.data?.error?.message || e.response?.data?.message
        || (typeof e.response?.data === 'string' ? e.response.data : null)
        || e.message
      return { ok: false, error: detail }
    }
  })
  // Apps that support URL schemes — more reliable than `open -b` for Electron-based apps (Slack, etc.)
  const BUNDLE_URL_SCHEMES = {
    'com.tinyspeck.slackmacgap': 'slack://open',
    'com.microsoft.teams':       'msteams://l/chat',
    'com.microsoft.teams2':      'msteams://l/chat',
    'com.discord.Discord':       'discord://',
    'com.facebook.Messenger':    'fb-messenger://',
  }
  // Fallback by display app name (when bundleId is missing/empty)
  const APP_NAME_URL_SCHEMES = {
    'Slack':     'slack://open',
    'Teams':     'msteams://l/chat',
    'Discord':   'discord://',
    'Messenger': 'fb-messenger://',
  }

  ipcMain.handle('ai-reply', (_, { bundleId, suggestedReply, app }) => {
    const { clipboard, shell } = require('electron')
    // Use Electron clipboard API (safe, cross-platform, no shell injection risk)
    try { if (suggestedReply) clipboard.writeText(suggestedReply) } catch {}
    const cleanBundleId = (bundleId || '').trim()
    // Only allow well-formed reverse-domain bundle IDs (e.g. jp.naver.line.mac)
    if (cleanBundleId && /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(cleanBundleId)) {
      const urlScheme = BUNDLE_URL_SCHEMES[cleanBundleId]
      if (urlScheme) {
        shell.openExternal(urlScheme).catch(() => {})
      } else {
        const { execSync } = require('child_process')
        try { execSync(`open -b "${cleanBundleId}"`) } catch {}
      }
    } else if (app && APP_NAME_URL_SCHEMES[app]) {
      // Fallback: open by app display name when bundleId unavailable
      shell.openExternal(APP_NAME_URL_SCHEMES[app]).catch(() => {})
    }
    return { ok: true }
  })

  // ── Exchange Rates ────────────────────────────────────────────────────────
  ipcMain.handle('open-external', (_, url) => {
    const { shell } = require('electron')
    return shell.openExternal(url)
  })
  ipcMain.handle('get-exchange-rates', async (_, opts) => {
    const result = await exchangeRateService.fetchAllRates(opts || {})
    if (result.banks && Object.keys(result.banks).length > 0) {
      exchangeRateService.checkRateAlerts(result.banks, mainWindow).catch(() => {})
    }
    return result
  })
  ipcMain.handle('get-best-rate-advice', (_, payload) => exchangeRateService.getBestRateAdvice(payload))
  ipcMain.handle('get-rate-alerts',    ()         => exchangeRateService.getRateAlerts())
  ipcMain.handle('add-rate-alert',     (_, alert) => exchangeRateService.addRateAlert(alert))
  ipcMain.handle('remove-rate-alert',  (_, id)    => exchangeRateService.removeRateAlert(id))
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  loadServices()
  registerIpcHandlers()
  createWindow()
  schedulerService.initScheduler(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Expose mainWindow for scheduler to push updates
module.exports = { getMainWindow: () => mainWindow }

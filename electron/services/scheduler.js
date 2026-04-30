const cron        = require('node-cron')
const { Notification } = require('electron')
const storeService  = require('./store')
const stocksService = require('./stocks')
const horoscopeService = require('./horoscope')

let mainWindowRef = null
let stockJob      = null
let morningJob    = null

function pushToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data)
  }
}

// ── Stock monitoring (every minute during trading hours) ──────────────────────
async function runStockCheck() {
  try {
    const { stocks } = await stocksService.fetchAllStocks()
    if (stocks?.length) {
      await stocksService.checkAlerts(stocks, mainWindowRef)
      pushToRenderer('data-refresh', { type: 'stocks', stocks })
    }
  } catch (e) {
    console.error('[Scheduler] stock check failed:', e.message)
  }
}

// ── Morning notification ───────────────────────────────────────────────────────
async function runMorningNotification() {
  // Skip if we already sent today's notification
  const today = new Date().toLocaleDateString('zh-TW')
  if (storeService.get('lastMorningNotificationDate') === today) return

  try {
    const result = await horoscopeService.generateCombinedInsight()
    if (result.data) {
      storeService.set('lastMorningNotificationDate', today)
      new Notification({
        title: result.data.role  || '今日提示',
        body:  result.data.opener || result.data.title || '',
      }).show()
      pushToRenderer('data-refresh', { type: 'morning', insight: result.data })
    }
  } catch (e) {
    console.error('[Scheduler] morning notification failed:', e.message)
  }
}

function parseCronTime(timeStr) {
  const [h, m] = (timeStr || '07:00').split(':').map(Number)
  return `${m} ${h} * * *`
}

function initScheduler(mainWindow) {
  mainWindowRef = mainWindow

  const settings = storeService.getSettings()

  // If the scheduled time has already passed today, mark today as notified
  // so the cron job doesn't fire when first scheduled (e.g. app started after 07:00)
  const [sh, sm] = (settings.morningNotificationTime || '07:00').split(':').map(Number)
  const now = new Date()
  const scheduledMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0).getTime()
  if (now.getTime() > scheduledMs) {
    const today = now.toLocaleDateString('zh-TW')
    if (!storeService.get('lastMorningNotificationDate')) {
      storeService.set('lastMorningNotificationDate', today)
    }
  }

  // Morning notification
  const cronTime = parseCronTime(settings.morningNotificationTime)
  morningJob = cron.schedule(cronTime, runMorningNotification, {
    timezone: 'Asia/Taipei',
  })

  // Stock price check – every minute, Mon–Fri, 9:00–13:30 Taipei time
  stockJob = cron.schedule('* 9-13 * * 1-5', runStockCheck, {
    timezone: 'Asia/Taipei',
  })

  // Also run at 13:30 for the closing price
  cron.schedule('30 13 * * 1-5', runStockCheck, { timezone: 'Asia/Taipei' })

  // US market: 21:30–04:00 Taipei time (Mon–Fri)
  cron.schedule('* 21-23 * * 1-5', runStockCheck, { timezone: 'Asia/Taipei' })
  cron.schedule('* 0-4 * * 2-6',   runStockCheck, { timezone: 'Asia/Taipei' })

  console.log('[Scheduler] initialized. Morning notification at', settings.morningNotificationTime)
}

function restartScheduler(mainWindow) {
  if (morningJob) morningJob.stop()
  if (stockJob)  stockJob.stop()
  initScheduler(mainWindow)
}

module.exports = { initScheduler, restartScheduler }

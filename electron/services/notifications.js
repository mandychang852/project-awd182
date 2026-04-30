const fs      = require('fs')
const os      = require('os')
const path    = require('path')
const { execSync } = require('child_process')

// ── macOS ─────────────────────────────────────────────────────────────────────
// Notification DB location (requires Full Disk Access permission)
const MAC_DB_PATH = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.usernoted/db2/db'
)

// Map bundle IDs to friendly app names
const APP_NAME_MAP = {
  'jp.naver.line.mac':           'LINE',
  'com.tinyspeck.slackmacgap':   'Slack',
  'com.apple.MobileSMS':         'Messages',
  'com.microsoft.teams':         'Teams',
  'com.apple.mail':              'Mail',
  'com.google.Gmail':            'Gmail',
  'com.microsoft.Outlook':       'Outlook',
  'com.facebook.archon':         'Messenger',
  'ru.keepcoder.Telegram':       'Telegram',
  'com.apple.iChat':             'iMessage',
  'com.apple.Notes':             'Notes',
  'io.notion.id':                'Notion',
}

function getAppName(bundleId) {
  return APP_NAME_MAP[bundleId] || bundleId?.split('.').pop() || 'Unknown'
}

async function readMacNotifications() {
  if (!fs.existsSync(MAC_DB_PATH)) {
    return { error: 'db_not_found', notifications: [] }
  }

  let SQL
  try {
    const initSqlJs   = require('sql.js')
    const { app }     = require('electron')
    const wasmBinary  = fs.readFileSync(
      app.isPackaged
        ? path.join(process.resourcesPath, 'sql-wasm.wasm')
        : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
    )
    SQL = await initSqlJs({ wasmBinary })
  } catch (e) {
    return { error: 'sql_load_failed', notifications: [] }
  }

  let dbBuffer
  const tmpPath = path.join(os.tmpdir(), `notif_db_${Date.now()}`)
  try {
    // First try Node fs.copyFileSync
    fs.copyFileSync(MAC_DB_PATH, tmpPath)
  } catch (e1) {
    if (e1.code === 'EACCES' || e1.code === 'EPERM') {
      // Fallback: shell cp sometimes bypasses sandbox limits
      try {
        execSync(`cp "${MAC_DB_PATH}" "${tmpPath}"`, { timeout: 5000 })
      } catch (e2) {
        return { error: 'permission_denied', notifications: [] }
      }
    } else {
      return { error: e1.message, notifications: [] }
    }
  }
  try {
    dbBuffer = fs.readFileSync(tmpPath)
  } catch (e) {
    return { error: 'permission_denied', notifications: [] }
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }

  const db = new SQL.Database(dbBuffer)

  // Only fetch notifications still uncleared in macOS Notification Center.
  // The `delivered` table stores a blob of concatenated 16-byte UUIDs per app.
  // When the user dismisses a notification, macOS removes its UUID from the blob.
  let rows = []
  try {
    const result = db.exec(
      `SELECT r.data, r.delivered_date, a.identifier
       FROM record r
       LEFT JOIN app a ON r.app_id = a.app_id
       WHERE EXISTS (
         SELECT 1 FROM delivered d
         WHERE d.app_id = r.app_id
           AND d.list IS NOT NULL
           AND INSTR(d.list, r.uuid) > 0
       )
       ORDER BY r.delivered_date DESC LIMIT 200`
    )
    rows = result?.[0]?.values || []
  } catch {
    db.close()
    return { error: 'query_failed', notifications: [] }
  }

  db.close()

  const CORE_DATA_OFFSET = 978307200
  const bplist        = require('bplist-parser')
  const notifications = []

  for (const [data, delivered_date, bundleId] of rows) {
    try {
      const buf    = Buffer.from(data)
      const parsed = bplist.parseBuffer(buf)[0]

      // macOS uses abbreviated plist keys: titl/body inside req
      const req   = parsed?.req || parsed
      const title = req?.titl || req?.title || ''
      const body  = req?.body || ''

      if (!title && !body) continue

      notifications.push({
        id:        buf.slice(0, 8).toString('hex'),
        app:       getAppName(bundleId || ''),
        bundleId:  bundleId || '',
        title,
        body,
        timestamp: (delivered_date + CORE_DATA_OFFSET) * 1000,
      })
    } catch {
      // skip malformed entries
    }
  }

  return { error: null, notifications }
}

// ── Windows ───────────────────────────────────────────────────────────────────
async function readWindowsNotifications() {
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
$histories = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory()
$histories | Select-Object -First 50 | ConvertTo-Json -Depth 2
`
  try {
    const output = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, ' ')}"`, {
      timeout: 8000,
      encoding: 'utf8',
    })
    const items = JSON.parse(output || '[]')
    const arr   = Array.isArray(items) ? items : [items]
    const notifications = arr.map((item, i) => ({
      id:        String(i),
      app:       item.AppId || 'Unknown',
      bundleId:  item.AppId || '',
      title:     item.Content?.Payload || '',
      body:      '',
      timestamp: Date.now(),
    }))
    return { error: null, notifications }
  } catch (e) {
    return { error: 'powershell_failed', notifications: [] }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function readNotifications() {
  if (process.platform === 'darwin') return readMacNotifications()
  if (process.platform === 'win32')  return readWindowsNotifications()
  return { error: 'unsupported_platform', notifications: [] }
}

module.exports = { readNotifications }

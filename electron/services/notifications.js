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

function getMacAppName(bundleId) {
  return APP_NAME_MAP[bundleId] || bundleId?.split('.').pop() || 'Unknown'
}

async function readMacNotifications() {
  if (!fs.existsSync(MAC_DB_PATH)) {
    return { error: 'db_not_found', notifications: [] }
  }

  // Use system sqlite3 CLI which automatically merges WAL files,
  // so we always get the latest notifications without stale data.
  const CORE_DATA_OFFSET = 978307200
  const hoursBack = 48
  const cutoff = Math.floor(Date.now() / 1000) - CORE_DATA_OFFSET - (hoursBack * 3600)

  const query = `SELECT hex(r.data) as data_hex,r.delivered_date,a.identifier FROM record r LEFT JOIN app a ON r.app_id=a.app_id WHERE r.delivered_date>${cutoff} ORDER BY r.delivered_date DESC LIMIT 200`

  let rows = []
  try {
    const output = execSync(`sqlite3 -json "${MAC_DB_PATH}" "${query}"`, {
      encoding: 'utf8',
      timeout: 10000,
    })
    rows = JSON.parse(output || '[]')
  } catch (e) {
    const msg = e.message || ''
    if (e.status === 23 || msg.includes('EPERM') || msg.includes('EACCES') || msg.includes('authorization denied')) {
      return { error: 'permission_denied', notifications: [] }
    }
    return { error: 'query_failed', notifications: [] }
  }

  const bplist        = require('bplist-parser')
  const notifications = []

  for (const row of rows) {
    try {
      const buf    = Buffer.from(row.data_hex, 'hex')
      const parsed = bplist.parseBuffer(buf)[0]

      const req   = parsed?.req || parsed
      const title = req?.titl || req?.title || ''
      const body  = req?.body || ''

      if (!title && !body) continue

      notifications.push({
        id:        buf.slice(0, 8).toString('hex'),
        app:       getMacAppName(row.identifier || ''),
        bundleId:  row.identifier || '',
        title,
        body,
        timestamp: (row.delivered_date + CORE_DATA_OFFSET) * 1000,
      })
    } catch {
      // skip malformed entries
    }
  }

  return { error: null, notifications }
}

// ── Windows ───────────────────────────────────────────────────────────────────
const WIN_DB_PATH = path.join(
  os.homedir(),
  'AppData/Local/Microsoft/Windows/Notifications/wpndatabase.db'
)

const WIN_APP_NAME_MAP = {
  'LINE': 'LINE',
  'SkyDrive': 'OneDrive',
  'OneDrive': 'OneDrive',
  'ScreenSketch': '剪取與繪圖',
  'Slack': 'Slack',
  'WhatsApp': 'WhatsApp',
  'microsoft.windowslive.mail': 'Mail',
  'Microsoft.Office.OUTLOOK': 'Outlook',
  'Telegram': 'Telegram',
  'Discord': 'Discord',
  'Messenger': 'Messenger',
  'Teams': 'Teams',
}

function getWinAppName(primaryId) {
  for (const [key, name] of Object.entries(WIN_APP_NAME_MAP)) {
    if (primaryId.toLowerCase().includes(key.toLowerCase())) return name
  }
  const parts = primaryId.split('!')
  const lastPart = parts[parts.length - 1]
  const name = lastPart.split('.').pop() || 'Unknown'
  if (name === 'App') return '應用程式'
  return name
}

async function readWindowsNotifications() {
  if (!fs.existsSync(WIN_DB_PATH)) {
    return { error: 'db_not_found', notifications: [] }
  }

  const tmpDir = os.tmpdir()
  const timestamp = Date.now()
  const tmpDbPath = path.join(tmpDir, `win_notif_${timestamp}.db`)
  const tmpWalPath = path.join(tmpDir, `win_notif_${timestamp}.db-wal`)
  const tmpShmPath = path.join(tmpDir, `win_notif_${timestamp}.db-shm`)

  try {
    // Copy all 3 files to handle WAL mode
    fs.copyFileSync(WIN_DB_PATH, tmpDbPath)
    if (fs.existsSync(WIN_DB_PATH + '-wal')) fs.copyFileSync(WIN_DB_PATH + '-wal', tmpWalPath)
    if (fs.existsSync(WIN_DB_PATH + '-shm')) fs.copyFileSync(WIN_DB_PATH + '-shm', tmpShmPath)

    let rows = []
    let method = 'sqljs'

    const query = `
      SELECT n.ArrivalTime, h.PrimaryId, n.Payload
      FROM Notification n
      JOIN NotificationHandler h ON n.HandlerId = h.RecordId
      WHERE n.PayloadType = 'Xml' AND n.Payload LIKE '%<toast%'
      ORDER BY n.ArrivalTime DESC LIMIT 200;
    `.replace(/\n/g, ' ')

    // Try using sqlite3 CLI if available (it handles WAL perfectly)
    try {
      const output = execSync(`sqlite3 -json "${tmpDbPath}" "${query}"`, { encoding: 'utf8', timeout: 5000 })
      if (output && output.trim()) {
        const parsed = JSON.parse(output)
        rows = parsed.map(r => [r.ArrivalTime, r.PrimaryId, r.Payload])
        method = 'sqlite3-cli-json'
      }
    } catch (cliError) {
      // Fallback to manual parsing if -json is not supported or CLI fails
      try {
        // Use a very unique separator to handle multi-line and special characters
        const SEP = '|||SEP|||'
        const queryWithSep = `
          SELECT n.ArrivalTime || '${SEP}' || h.PrimaryId || '${SEP}' || CAST(n.Payload AS TEXT)
          FROM Notification n
          JOIN NotificationHandler h ON n.HandlerId = h.RecordId
          WHERE n.PayloadType = 'Xml' AND n.Payload LIKE '%<toast%'
          ORDER BY n.ArrivalTime DESC LIMIT 200;
        `.replace(/\n/g, ' ')
        
        const output = execSync(`sqlite3 "${tmpDbPath}" "${queryWithSep}"`, { encoding: 'utf8', timeout: 8000 })
        if (output) {
          // Manual multi-line parsing is still tricky with raw output, but let's try 
          // splitting by ArrivalTime pattern if possible, or just skip if -json fails
          // For now, let's just use the existing split but be more careful
          rows = output.split('\n').filter(line => line.includes(SEP)).map(line => {
            const parts = line.split(SEP)
            return [parts[0], parts[1], parts[2]]
          })
          method = 'sqlite3-cli-sep'
        }
      } catch (e2) {}
    }

    if (rows.length === 0) {
      const initSqlJs = require('sql.js')
      const { app } = require('electron')
      const wasmBinary = fs.readFileSync(
        app.isPackaged
          ? path.join(process.resourcesPath, 'sql-wasm.wasm')
          : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
      )
      const SQL = await initSqlJs({ wasmBinary })
      const dbBuffer = fs.readFileSync(tmpDbPath)
      const db = new SQL.Database(dbBuffer)
      const result = db.exec(query)
      rows = result?.[0]?.values || []
      db.close()
    }

    const notifications = []
    for (const [arrivalTime, primaryId, payload] of rows) {
      try {
        let xml = (typeof payload === 'string') ? payload : Buffer.from(payload).toString('utf8')
        
        // Basic unescape/cleanup
        xml = xml.replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&quot;/g, '"')
                 .replace(/&apos;/g, "'")
        
        const texts = []
        const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi
        let match
        while ((match = regex.exec(xml)) !== null) {
          let content = match[1].trim()
          // Strip CDATA if present
          content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
          if (content) texts.push(content)
        }

        if (texts.length === 0) continue

        const title = texts[0] || ''
        const body  = texts.slice(1).join('\n') || ''
        
        // Windows FILETIME is 100-nanosecond intervals since Jan 1, 1601.
        // Convert to Unix timestamp (milliseconds).
        const arrivalTimeBigInt = BigInt(arrivalTime)
        const unixTimestamp = Number((arrivalTimeBigInt / 10000n) - 11644473600000n)

        notifications.push({
          id:        String(arrivalTime),
          app:       getWinAppName(primaryId),
          bundleId:  primaryId,
          title,
          body,
          timestamp: unixTimestamp,
        })
      } catch (e) {
        // skip malformed entries
      }
    }

    // Cleanup
    try { fs.unlinkSync(tmpDbPath) } catch {}
    try { fs.unlinkSync(tmpWalPath) } catch {}
    try { fs.unlinkSync(tmpShmPath) } catch {}

    return { error: null, notifications, method }
  } catch (e) {
    return { error: e.message, notifications: [] }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function readNotifications() {
  if (process.platform === 'darwin') return readMacNotifications()
  if (process.platform === 'win32')  return readWindowsNotifications()
  return { error: 'unsupported_platform', notifications: [] }
}

module.exports = { readNotifications }

const { BrowserWindow } = require('electron')
const storeService = require('./store')

// All Taiwan counties with CWA CIDs
const COUNTY_LIST = [
  { name: '基隆市', cid: '10017' },
  { name: '臺北市', cid: '63'    },
  { name: '新北市', cid: '65'    },
  { name: '桃園市', cid: '68'    },
  { name: '新竹市', cid: '10018' },
  { name: '新竹縣', cid: '10004' },
  { name: '苗栗縣', cid: '10005' },
  { name: '臺中市', cid: '66'    },
  { name: '彰化縣', cid: '10007' },
  { name: '南投縣', cid: '10008' },
  { name: '雲林縣', cid: '10009' },
  { name: '嘉義市', cid: '10020' },
  { name: '嘉義縣', cid: '10010' },
  { name: '臺南市', cid: '67'    },
  { name: '高雄市', cid: '64'    },
  { name: '屏東縣', cid: '10013' },
  { name: '宜蘭縣', cid: '10002' },
  { name: '花蓮縣', cid: '10015' },
  { name: '臺東縣', cid: '10014' },
  { name: '澎湖縣', cid: '10016' },
  { name: '金門縣', cid: '09020' },
  { name: '連江縣', cid: '09007' },
]

function descToIcon(desc) {
  if (!desc) return '🌈'
  if (desc.includes('雷')) return '⛈️'
  if (desc.includes('大雨')) return '🌧️'
  if (desc.includes('短暫雨') || desc.includes('陣雨') || desc.includes('小雨') || desc.includes('中雨')) return '🌧️'
  if (desc.includes('毛毛雨')) return '🌦️'
  if (desc.includes('晴時多雲') || desc.includes('多雲時晴')) return '🌤️'
  if (desc.includes('晴')) return '☀️'
  if (desc.includes('多雲時陰') || desc.includes('陰時多雲')) return '☁️'
  if (desc.includes('多雲')) return '⛅'
  if (desc.includes('陰')) return '☁️'
  if (desc.includes('霧')) return '🌫️'
  if (desc.includes('雪')) return '❄️'
  return '🌈'
}

// Scrape CWA county page using a hidden BrowserWindow (required for JS-rendered site)
async function scrapeCWA(cid, cityName) {
  return new Promise((resolve) => {
    let settled = false
    let win = null
    let to = null

    const settle = (data) => {
      if (settled) return
      settled = true
      if (to) clearTimeout(to)
      try { if (win && !win.isDestroyed()) win.destroy() } catch {}
      resolve(data)
    }

    to = setTimeout(() => {
      settle({ error: 'timeout', current: null, forecast: null, city: cityName })
    }, 22000)

    try {
      win = new BrowserWindow({
        show: false,
        skipTaskbar: true,
        width: 1280,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true, javascript: true },
      })

      win.webContents.once('did-finish-load', () => {
        // Poll until Vue.js renders the weather data (check every 500ms, up to 10s)
        let attempts = 0
        const EXTRACT_JS = `
          (() => {
            const text  = document.body.innerText || ''
            const imgs  = Array.from(document.querySelectorAll('img[src*="weather_icons"]'))
            const descs = imgs.map(i => i.alt).filter(a => a && a.length > 0 && a.length < 30)
            return JSON.stringify({ t: text.slice(0, 9000), descs })
          })()`

        const poll = async () => {
          if (settled) return
          attempts++
          try {
            const raw = await win.webContents.executeJavaScript(EXTRACT_JS)
            const { t: text, descs } = JSON.parse(raw)

            if (!text.includes('今日白天') && attempts < 14) {
              return setTimeout(poll, 700)
            }

            // ── Today's daytime section ──────────────────────────────────
            const dayStart   = text.indexOf('今日白天')
            const nightStart = text.indexOf('今日晚上')
            const daySection = dayStart >= 0
              ? text.slice(dayStart, nightStart > dayStart ? nightStart : dayStart + 300)
              : text.slice(0, 400)

            console.log('[weather] daySection:', JSON.stringify(daySection.slice(0, 200)))

            // CWA renders temperature as "19 - 25" (no degree symbol)
            const tempMatch = daySection.match(/(\d+)\s*[-~]\s*(\d+)(?:\s*[˚°]C)?/)
            // Fallback: separate 低溫/高溫 labels
            const lowMatch  = !tempMatch && daySection.match(/低溫[^\d]*(\d+)/)
            const highMatch = !tempMatch && daySection.match(/高溫[^\d]*(\d+)/)
            const popMatch  = daySection.match(/降雨機率\s*(\d+)\s*%/)
            const tempMin   = tempMatch ? parseInt(tempMatch[1]) : (lowMatch  ? parseInt(lowMatch[1])  : null)
            const tempMax   = tempMatch ? parseInt(tempMatch[2]) : (highMatch ? parseInt(highMatch[1]) : null)
            const pop       = popMatch  ? parseInt(popMatch[1])  : 0

            // Weather icons: [0]=凌晨, [1]=白天, [2]=晚上  (first 3 in the top summary panel)
            const todayDesc = descs[1] || descs[0] || ''

            // Short overall summary text before "看更多"
            const summaryMatch = text.match(/([^\n\r]{8,60})\s*看更多/)
            const summary = summaryMatch ? summaryMatch[1].trim() : ''

            // ── Tomorrow in weekly forecast section ──────────────────────
            const weekMatches = [...text.matchAll(/星期[一二三四五六日](\d{2}\/\d{2})/g)]
            let forecast = null
            if (weekMatches.length >= 2) {
              const tStart = weekMatches[1].index
              const tEnd   = weekMatches[2]?.index ?? text.length
              const tBlock = text.slice(tStart, tEnd)
              const tTemp  = tBlock.match(/白天[\s\S]*?(\d+)\s*[-~]\s*(\d+)(?:\s*[˚°]C)?/)
                         || tBlock.match(/(\d+)\s*[-~]\s*(\d+)(?:\s*[˚°]C)?/)
              const tPopM  = tBlock.match(/降雨機率\s*(\d+)\s*%/)
              if (tTemp) {
                // Weekly section imgs start after first 3 top-panel imgs; 2 imgs per day (day+night)
                const tDesc = descs[2 + 2] || descs[4] || ''
                forecast = {
                  date:        weekMatches[1][1],
                  tempMin:     parseInt(tTemp[1]),
                  tempMax:     parseInt(tTemp[2]),
                  temp:        Math.round((parseInt(tTemp[1]) + parseInt(tTemp[2])) / 2),
                  description: tDesc,
                  icon:        descToIcon(tDesc),
                  pop:         tPopM ? parseInt(tPopM[1]) : 0,
                  humidity:    null,
                }
              }
            }

            if (tempMin === null && tempMax === null && descs.length === 0) {
              settle({ error: 'not_rendered', current: null, forecast: null, city: cityName })
              return
            }

            settle({
              error: null,
              city: cityName,
              current: {
                city:        cityName,
                temp:        tempMax ?? tempMin,
                tempMin,
                tempMax,
                feelsLike:   null,
                humidity:    null,
                windSpeed:   null,
                description: todayDesc || (summary ? summary.split('，')[0] : '天氣載入中'),
                icon:        descToIcon(todayDesc || summary),
                pop,
                summary,
              },
              forecast,
            })
          } catch (e) {
            if (attempts < 14) return setTimeout(poll, 700)
            settle({ error: 'parse_error', current: null, forecast: null, city: cityName })
          }
        }

        setTimeout(poll, 1500)
      })

      win.loadURL(`https://www.cwa.gov.tw/V8/C/W/County/County.html?CID=${cid}`)
    } catch (e) {
      settle({ error: e.message, current: null, forecast: null, city: cityName })
    }
  })
}

// Simple in-memory cache (15 min TTL) + in-flight deduplication
let _cache       = null
let _cacheTime   = 0
let _inflight    = null   // dedup: if a fetch is already in progress, reuse it
const CACHE_TTL  = 15 * 60 * 1000

async function fetchWeather() {
  const settings    = storeService.getSettings()
  const countyCid   = settings.countyCid
  const countyName  = settings.countyName

  if (!countyCid) return { error: 'missing_config', current: null, forecast: null, city: '' }

  const now = Date.now()
  if (_cache && _cache.cid === countyCid && now - _cacheTime < CACHE_TTL) {
    return _cache.data
  }

  // If a fetch is already in progress for the same CID, reuse it
  if (_inflight && _inflight.cid === countyCid) return _inflight.promise

  const promise = scrapeCWA(countyCid, countyName || '未知縣市').then(data => {
    if (!data.error) {
      _cache     = { cid: countyCid, data }
      _cacheTime = Date.now()
    }
    _inflight = null
    return data
  }).catch(err => {
    _inflight = null
    throw err
  })

  _inflight = { cid: countyCid, promise }
  return promise
}

function clearWeatherCache() {
  _cache = null
  _cacheTime = 0
}

module.exports = { fetchWeather, COUNTY_LIST, clearWeatherCache }

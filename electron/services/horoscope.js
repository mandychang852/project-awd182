const axios  = require('axios')
const { callLLM, isConfigured } = require('./llm')
const storeService = require('./store')
const weatherService = require('./weather')

// URL index mapping: English key → iAstro query param
const ZODIAC_IASTRO = {
  aries: 0, taurus: 1, gemini: 2, cancer: 3,
  leo: 4, virgo: 5, libra: 6, scorpio: 7,
  sagittarius: 8, capricorn: 9, aquarius: 10, pisces: 11,
}

const ZODIAC_NAMES = {
  aries: '牡羊座', taurus: '金牛座', gemini: '雙子座',
  cancer: '巨蟹座', leo: '獅子座', virgo: '處女座',
  libra: '天秤座', scorpio: '天蠍座', sagittarius: '射手座',
  capricorn: '摩羯座', aquarius: '水瓶座', pisces: '雙魚座',
}

// Count ★ to get 0–100 score
function starsToScore(starStr) {
  const filled = (starStr.match(/★/g) || []).length
  return Math.round((filled / 5) * 100)
}

// Strip HTML tags and normalize whitespace
function strip(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extract text between two pattern positions in clean text
function extractBetween(text, startPattern, endPatterns) {
  const startIdx = text.search(startPattern)
  if (startIdx === -1) return ''
  const afterStart = text.slice(startIdx)
  // Remove the matched label itself
  const contentStart = afterStart.replace(startPattern, '').trimStart()
  // Find the next section
  let endIdx = contentStart.length
  for (const ep of endPatterns) {
    const ei = contentStart.search(ep)
    if (ei !== -1 && ei < endIdx) endIdx = ei
  }
  return contentStart.slice(0, endIdx).trim()
}

// ── Main scraper ──────────────────────────────────────────────────────────────
async function scrapeHoroscope(sign) {
  const iAstro = ZODIAC_IASTRO[sign]
  if (iAstro === undefined) return null

  const url = `https://astro.click108.com.tw/daily_1.php?iAstro=${iAstro}`

  let html
  try {
    const https = require('https')
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeout: 12000,
      responseType: 'arraybuffer',
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    })
    // Site is UTF-8
    html = Buffer.from(res.data).toString('utf8')
  } catch (e) {
    return null
  }

  // Strip scripts & styles then flatten to plain text
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  const text = strip(cleaned)

  // ── Fortune sections ──────────────────────────────────────────────────────
  const nextSections = [/愛情運勢/, /事業運勢/, /財運運勢/, /熱門主題/, /誰是你/]

  const overallStarMatch  = text.match(/整體運勢([★☆]{5})/)
  const loveStarMatch     = text.match(/愛情運勢([★☆]{5})/)
  const careerStarMatch   = text.match(/事業運勢([★☆]{5})/)
  const wealthStarMatch   = text.match(/財運運勢([★☆]{5})/)

  const overall = extractBetween(text, /整體運勢[★☆]+：/, nextSections)
  const love    = extractBetween(text, /愛情運勢[★☆]+：/, [/事業運勢/, /財運運勢/, /熱門主題/, /誰是你/])
  const career  = extractBetween(text, /事業運勢[★☆]+：/, [/財運運勢/, /熱門主題/, /誰是你/])
  const wealth  = extractBetween(text, /財運運勢[★☆]+：/, [/熱門主題/, /誰是你/, /熱門服務/])

  const score = overallStarMatch ? starsToScore(overallStarMatch[1]) : 60

  // ── Lucky info (search raw cleaned HTML, image srcs are in tag attrs) ────
  // Today's quote – inside <p> tag right after TODAY_WORD_title image
  const quoteMatch = cleaned.match(/TODAY_WORD_title[^>]+\/>[\s\S]{0,50}?<p>([^<]{4,40}[。！？])<\/p>/)
  const todayQuote = quoteMatch ? quoteMatch[1].trim() : ''

  // Lucky number – standalone digit(s) after TODAY_LUCKY_title01 image
  const luckyNumMatch = cleaned.match(/TODAY_LUCKY_title01[^>]+>[\s\S]{0,200}?<[^>]+>\s*(\d{1,2})\s*</)
  const luckyNumber = luckyNumMatch ? luckyNumMatch[1] : ''

  // Lucky color – text node after TODAY_LUCKY_title02 image
  const luckyColorMatch = cleaned.match(/TODAY_LUCKY_title02[^>]+>[\s\S]{0,200}?<[^>]+>\s*([^\s<]{2,8})\s*</)
  const luckyColor = luckyColorMatch ? luckyColorMatch[1] : ''

  // Lucky direction – text node after TODAY_LUCKY_title03 image
  const luckyDirMatch = cleaned.match(/TODAY_LUCKY_title03[^>]+>[\s\S]{0,200}?<[^>]+>\s*([^\s<]{2,8})\s*</)
  const luckyDirection = luckyDirMatch ? luckyDirMatch[1] : ''

  // Lucky time – regex on stripped text (it's a plain text node)
  const luckyTimeM = text.match(/(\d{1,2}:\d{2}(?:am|pm)?[-–~]\d{1,2}:\d{2}(?:am|pm)?)/)
  const luckyTime = luckyTimeM ? luckyTimeM[1] : ''

  // Lucky zodiac – text node after TODAY_LUCKY_title05 image
  const luckyZodiacMatch = cleaned.match(/TODAY_LUCKY_title05[^>]+>[\s\S]{0,200}?<[^>]+>\s*((?:牡羊|金牛|雙子|巨蟹|獅子|處女|天秤|天蠍|射手|摩羯|水瓶|雙魚)座)\s*</)
  const luckyZodiac = luckyZodiacMatch ? luckyZodiacMatch[1] : ''

  if (!overall) return null  // scrape failed

  return {
    sign:           ZODIAC_NAMES[sign] || sign,
    score,
    overall,
    love,
    career,
    wealth,
    todayQuote,
    luckyNumber,
    luckyColor,
    luckyDirection,
    luckyTime,
    luckyZodiac,
    loveScore:    loveStarMatch   ? starsToScore(loveStarMatch[1])   : null,
    careerScore:  careerStarMatch ? starsToScore(careerStarMatch[1]) : null,
    wealthScore:  wealthStarMatch ? starsToScore(wealthStarMatch[1]) : null,
    source:       'click108',
  }
}

async function generateHoroscope() {
  const sign = storeService.get('zodiacSign')
  if (!sign) return { error: 'missing_sign', data: null }

  // Try scraping first
  const scraped = await scrapeHoroscope(sign)
  if (scraped) return { error: null, data: scraped }

  // Fallback demo data (no API key needed)
  return {
    error: null,
    data: {
      sign: ZODIAC_NAMES[sign] || sign,
      score: 70,
      overall: '今天整體運勢平穩，保持積極心態即可。',
      love: '感情方面宜多溝通，表達心意的好時機。',
      career: '工作上專注細節，避免粗心大意。',
      wealth: '財運普通，避免衝動消費。',
      luckyColor: '藍色', luckyDirection: '東方',
      luckyNumber: '', luckyTime: '', luckyZodiac: '',
      todayQuote: '',
      demo: true,
    },
  }
}

async function generateCombinedInsight() {
  const sign     = storeService.get('zodiacSign')
  const settings = storeService.getSettings()
  if (!sign || !settings.countyCid) return { error: 'missing_config', data: null }

  const [weatherResult, horoscopeResult] = await Promise.all([
    weatherService.fetchWeather(),
    generateHoroscope(),
  ])

  const weather   = weatherResult.current
  const forecast  = weatherResult.forecast
  const horoscope = horoscopeResult.data

  if (!weather || !horoscope) {
    return {
      error: null,
      data: {
        title: '早安！今天是個好日子 🌤️',
        body:  '天氣和運勢資料載入中，請稍後重新整理。',
        clothing: '', activity: '',
      },
    }
  }

  const signName = ZODIAC_NAMES[sign] || sign

  // ── Compose fun fallback without AI ──────────────────────────────────────
  function funFallback(reason) {
    const rain  = (weather.pop || forecast?.pop || 0) >= 40
    const tempMid = weather.tempMax != null ? Math.round((weather.tempMin + weather.tempMax) / 2)
                  : weather.temp ?? null
    const hot   = tempMid != null && tempMid >= 32
    const cold  = tempMid != null && tempMid <= 18
    const score = horoscope.score
    const color = horoscope.luckyColor || '隨意'
    const dir   = horoscope.luckyDirection

    const scoreComment =
      score >= 80 ? '今天宇宙欠你一個好事，記得去收' :
      score >= 60 ? '普通的一天，但普通裡藏著驚喜（可能）' :
                   '運勢弱？沒關係，廢物星人也有廢物的快樂'

    const tempLabel = weather.tempMin != null && weather.tempMax != null
      ? `${weather.tempMin}–${weather.tempMax}°C` : tempMid != null ? `${tempMid}°C` : ''
    const weatherTask  = rain  ? '帶傘出門，今天天空的眼淚比你的多'
                       : hot   ? `${tempLabel}，穿越熱浪的人才是今天的贏家`
                       : cold  ? '多加一件外套，身體暖了心情也會跟著暖'
                       :         '天氣剛好，出門隨便都是美景'

    const luckyTask    = `穿上${color}的東西出門，今天這是你的隱藏 buff`
    const lifeTask     = dir
      ? `往${dir}方向走幾步，找到什麼算什麼，找不到也算散步`
      : `今天不用追求什麼，隨便走走都算得分`

    const warningMsg   = score < 60
      ? `⚠️ 今日運勢偏弱，建議減少做重大決定，包括你的午餐`
      : score >= 80
      ? `✨ 系統偵測到今日運勢爆表，請小心「好運用完」警報`
      : `⚠️ 今日運勢中規中矩，主要風險來自你自己的拖延症`

    const fortunes = [
      '出門記得帶腦，它比手機更難找到。',
      '今天的困難，是明天笑話的原材料。',
      '宇宙說：你行的，只是你不信。',
      '這一籤，求的是你能好好吃飯。',
      '人生如匯率，有高有低，重點是要換對時機。',
    ]
    const fortune = horoscope.todayQuote && !['無', ''].includes(horoscope.todayQuote)
      ? horoscope.todayQuote   // 今日名言本來就是精華，保留
      : fortunes[Math.floor(Date.now() / 86400000) % fortunes.length]

    return {
      error: null,
      data: {
        role:    `${weather.icon} ${signName}・今日 ${score} 分${reason ? '（' + reason + '）' : ''}`,
        opener:  scoreComment,
        tasks:   [weatherTask, luckyTask, lifeTask],
        warning: warningMsg,
        fortune,
      },
    }
  }

  if (!isConfigured()) return funFallback('未設定 AI')

  try {
    const content = await callLLM({
      system: `你是一個幽默毒舌又貼心的AI助理，用繁體中文說話，語氣像損友但真心為使用者著想。
善用諧音梗、星座刻板印象、天氣雙關，讓人看了會心一笑或噴飯。
不要太正式，不要說「建議您」，說話要像真人在傳訊息。
你的回覆必須是合法的 JSON，不要加任何說明文字或 markdown。`,
      user: `今天天氣：${weather.description} ${weather.icon}，氣溫 ${weather.tempMin != null ? weather.tempMin + '–' + weather.tempMax : weather.temp ?? '未知'}°C，降雨機率 ${weather.pop || 0}%${weather.summary ? '，' + weather.summary : ''}
明天：${forecast?.description || '未知'}，降雨機率 ${forecast?.pop || 0}%
星座：${signName}，今日整體 ${horoscope.score} 分
運勢摘要（僅供你參考，不要原文複製）：${horoscope.overall}
幸運色：${horoscope.luckyColor || '無'}，幸運方位：${horoscope.luckyDirection || '無'}，幸運數字：${horoscope.luckyNumber || '無'}
今日名言：${horoscope.todayQuote || '無'}

輸出合法 JSON，結構如下，所有欄位都必須是字串：
{"role":"今日身份：[emoji]+[有趣稱號，例：🌧️ 雨中哲學家]","opener":"把星座個性和天氣串在一起的幽默吐槽（50字內，不要照抄運勢原文）","tasks":["結合天氣的好笑實用建議（30字內）","結合幸運色或方位（30字內）","有點廢但很真實的人生建議（30字內）"],"warning":"⚠️ 模仿系統警告語氣的搞笑提醒（40字內）","fortune":"帶點禪意又不太正經的一句話，像廟裡抽到的籤（30字內）"}`,
      temperature: 1.0,
      maxTokens: 600,
    })

    // Try to extract JSON from anywhere in the response (handles markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON found in response')
    const json = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!json.role || !json.opener || !Array.isArray(json.tasks)) {
      throw new Error('missing required fields')
    }

    return { error: null, data: { ...json, fromAI: true } }
  } catch (e) {
    console.error('[insight] AI failed, using fallback. Reason:', e.message)
    return funFallback()  // don't surface raw error text to user
  }
}

module.exports = { generateHoroscope, generateCombinedInsight }

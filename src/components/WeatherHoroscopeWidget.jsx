import React, { useState, useEffect, useCallback } from 'react'

const SCORE_COLOR = (score) =>
  score >= 80 ? 'var(--green)'
  : score >= 55 ? 'var(--accent-light)'
  : 'var(--yellow)'

function ScoreRing({ score }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <svg width={68} height={68} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={34} cy={34} r={r} fill="none" stroke="rgba(100,160,210,0.1)" strokeWidth={5} />
      <circle
        cx={34} cy={34} r={r} fill="none"
        stroke={SCORE_COLOR(score)} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x={34} y={34}
        textAnchor="middle" dominantBaseline="central"
        fill={SCORE_COLOR(score)}
        fontSize={15} fontWeight={700}
        style={{ transform: 'rotate(90deg)', transformOrigin: '34px 34px' }}
      >
        {score}
      </text>
    </svg>
  )
}

function StarBar({ score, label }) {
  if (score == null) return null
  const filled = Math.round((score / 100) * 5)
  const color  = SCORE_COLOR(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', width: 36, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{ fontSize: 'var(--fs-body)', color: i < filled ? color : 'rgba(100,160,210,0.15)', lineHeight: 1 }}>★</span>
        ))}
      </div>
      <span style={{ fontSize: 'var(--fs-meta)', color, fontWeight: 600, marginLeft: 2 }}>{score}</span>
    </div>
  )
}

function WeatherBlock({ weather, forecast }) {
  const hasRange = weather.tempMin != null && weather.tempMax != null
  return (
    <div style={styles.weatherBlock}>
      {weather.city && (
        <div style={styles.cityName}>📍 {weather.city}</div>
      )}
      <div style={styles.currentRow}>
        <span style={styles.bigIcon}>{weather.icon}</span>
        <div>
          <div style={styles.bigTemp}>
            {hasRange ? `${weather.tempMin} – ${weather.tempMax}°C` : weather.temp != null ? `${weather.temp}°C` : '—'}
          </div>
          <div style={styles.weatherDesc}>{weather.description}</div>
          <div style={styles.weatherMeta}>
            {weather.pop != null && <span>☔ {weather.pop}% 降雨機率</span>}
            {weather.humidity  != null && <span>&nbsp;|&nbsp; 💧 {weather.humidity}%</span>}
            {weather.windSpeed != null && <span>&nbsp;|&nbsp; 💨 {weather.windSpeed} km/h</span>}
            {weather.feelsLike != null && <span>&nbsp;|&nbsp; 體感 {weather.feelsLike}°C</span>}
          </div>
          {weather.summary ? (
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{weather.summary}</div>
          ) : null}
        </div>
      </div>
      {forecast && (
        <div style={styles.forecastRow}>
          <span style={styles.forecastLabel}>明天 {forecast.date}</span>
          <span>{forecast.icon}</span>
          <span style={styles.forecastDesc}>{forecast.description}</span>
          <span style={styles.forecastTemp}>{forecast.tempMin}–{forecast.tempMax}°C</span>
          {forecast.pop > 0 && <span className="badge badge-blue">☂ {forecast.pop}%</span>}
        </div>
      )}
    </div>
  )
}

function HoroscopeBlock({ data }) {
  return (
    <div style={styles.horoscopeBlock}>
      {/* Header: ring + sign + overall text */}
      <div style={styles.horoHeader}>
        <ScoreRing score={data.score} />
        <div style={{ flex: 1 }}>
          <div style={styles.horoSign}>{data.sign} 今日運勢</div>
          <div style={styles.horoOverall}>{data.overall}</div>
        </div>
      </div>

      {/* Star bars for each category */}
      <div style={styles.starBars}>
        <StarBar score={data.score}        label="整體" />
        <StarBar score={data.loveScore}    label="愛情" />
        <StarBar score={data.careerScore}  label="事業" />
        <StarBar score={data.wealthScore}  label="財運" />
      </div>

      {/* Detailed text */}
      <div style={styles.horoGrid}>
        <div style={styles.horoItem}><span style={styles.horoLabel}>💕 感情</span><span>{data.love}</span></div>
        <div style={styles.horoItem}><span style={styles.horoLabel}>💼 事業</span><span>{data.career}</span></div>
        <div style={styles.horoItem}><span style={styles.horoLabel}>💰 財運</span><span>{data.wealth}</span></div>
      </div>

      {/* Lucky tags */}
      <div style={styles.horoMeta}>
        {data.luckyColor     && <span className="tag"><span style={styles.tagLabel}>幸運顏色</span>🎨 {data.luckyColor}</span>}
        {data.luckyDirection && <span className="tag"><span style={styles.tagLabel}>開運方位</span>🧭 {data.luckyDirection}</span>}
        {data.luckyNumber    && <span className="tag"><span style={styles.tagLabel}>幸運數字</span>🔢 {data.luckyNumber}</span>}
        {data.luckyTime      && <span className="tag"><span style={styles.tagLabel}>今日吉時</span>⏰ {data.luckyTime}</span>}
        {data.luckyZodiac    && <span className="tag"><span style={styles.tagLabel}>幸運星座</span>⭐ {data.luckyZodiac}</span>}
      </div>

      {/* Today's quote */}
      {data.todayQuote && (
        <div style={styles.horoSummary}>💬 「{data.todayQuote}」</div>
      )}
    </div>
  )
}

function InsightBlock({ insight }) {
  return (
    <div style={styles.insightBlock}>
      {/* 今日身份 */}
      {insight.role && (
        <div style={styles.insightRole}>{insight.role}</div>
      )}

      {/* 靈魂吐槽 opener */}
      {insight.opener && (
        <div style={styles.insightOpener}>「{insight.opener}」</div>
      )}

      {/* 今日三件事 */}
      {Array.isArray(insight.tasks) && insight.tasks.length > 0 && (
        <div style={styles.insightTasks}>
          {insight.tasks.map((task, i) => (
            <div key={i} style={styles.insightTaskRow}>
              <span style={styles.insightTaskNum}>{['①','②','③'][i] || '·'}</span>
              <span style={styles.insightTaskText}>{task}</span>
            </div>
          ))}
        </div>
      )}

      {/* 今日警告 */}
      {insight.warning && (
        <div style={styles.insightWarning}>{insight.warning}</div>
      )}

      {/* 今日籤詩 */}
      {insight.fortune && (
        <div style={styles.insightFortune}>
          <span style={styles.insightFortuneIcon}>🎋</span>
          <span>{insight.fortune}</span>
        </div>
      )}

      {/* Fallback: old format */}
      {!insight.role && insight.title && (
        <>
          <div style={styles.insightOpener}>{insight.title}</div>
          {insight.body && <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{insight.body}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {insight.clothing && <span className="tag">👕 {insight.clothing}</span>}
            {insight.activity && <span className="tag">🗺️ {insight.activity}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export default function WeatherHoroscopeWidget() {
  const [weather,   setWeather]   = useState(null)
  const [horoscope, setHoroscope] = useState(null)
  const [insight,   setInsight]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [tab,       setTab]       = useState('insight') // 'insight' | 'horoscope' | 'weather'

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const [wRes, hRes, iRes] = await Promise.all([
        window.electronAPI.getWeather(force),
        window.electronAPI.getHoroscope(),
        window.electronAPI.getCombinedInsight(),
      ])
      if (wRes.error && wRes.error !== 'missing_config') setError(wRes.error)
      setWeather(wRes)
      setHoroscope(hRes)
      setInsight(iRes)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const unsub = window.electronAPI.onDataRefresh((data) => {
      if (data.type === 'settings-updated') load()
    })
    return unsub
  }, [load])

  const weatherMissing   = !weather || weather?.error === 'missing_config'
  const weatherCityBad    = weather?.error === 'city_not_found'
  const weatherNetErr     = weather?.error && !weatherMissing && !weatherCityBad
  const horoscopeMissing  = horoscope?.error === 'missing_sign'
  const hasMissingConfig  = weatherMissing && horoscopeMissing

  return (
    <div className="card fade-in" style={styles.container}>
      <div className="widget-header">
        <span className="widget-icon">🌤️</span>
        <span className="widget-title">天氣 & 星座</span>
        <div style={{ flex: 1 }} />
        <div style={styles.tabs}>
          {['insight', 'horoscope', 'weather'].map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
              style={{ padding: '4px 10px', fontSize: 'var(--fs-meta)' }}
            >
              {{ insight: '✨ 今日提示', horoscope: '♈ 星座', weather: '🌡️ 天氣' }[t]}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => load(true)} title="重新整理">↻</button>
      </div>

      <div style={styles.body}>
        {loading && (
          <div style={styles.center}>
            <div className="spinner" />
            <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>載入中...</div>
          </div>
        )}

        {!loading && hasMissingConfig && (
          <div style={styles.center}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚙️</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)', textAlign: 'center' }}>
              請先在設定中填入城市與星座
            </div>
          </div>
        )}

        {!loading && !hasMissingConfig && (
          <>
            {tab === 'insight' && insight?.data && <InsightBlock insight={insight.data} />}
            {tab === 'insight' && !insight?.data && !loading && (
              <div style={styles.center}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-body)' }}>今日提示尚未載入，請重新整理</div>
              </div>
            )}
            {tab === 'horoscope' && !horoscopeMissing && horoscope?.data && <HoroscopeBlock data={horoscope.data} />}
            {tab === 'horoscope' && horoscopeMissing && (
              <div style={styles.center}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>♈</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)', textAlign: 'center' }}>請先在設定中選擇星座</div>
              </div>
            )}
            {tab === 'weather' && weather?.current && (
              <WeatherBlock weather={weather.current} forecast={weather.forecast} />
            )}
            {tab === 'weather' && weatherMissing && (
              <div style={styles.center}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🌍</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)', textAlign: 'center' }}>請先在設定中填入城市名稱</div>
              </div>
            )}
            {tab === 'weather' && weatherCityBad && (
              <div style={styles.center}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)', textAlign: 'center', lineHeight: 1.8 }}>
                  找不到「{weather?.city || '該城市'}」<br />
                  請在設定中修改城市名稱（如：台北、Taipei）
                </div>
              </div>
            )}
            {tab === 'weather' && weatherNetErr && (
              <div style={styles.center}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>❌</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)', textAlign: 'center', lineHeight: 1.8 }}>
                  天氣資料載入失敗<br />
                  <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>({weather.error})</span><br />
                  請確認網路連線後重新整理
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  body:      { flex: 1, padding: '16px 20px', overflowY: 'auto' },
  center:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 140 },
  tabs:      { display: 'flex', gap: 4, marginRight: 6 },

  // Weather
  weatherBlock: { display: 'flex', flexDirection: 'column', gap: 12 },
  cityName:     { fontSize: 23, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.03em' },
  currentRow:   { display: 'flex', alignItems: 'center', gap: 16 },
  bigIcon:      { fontSize: 52, lineHeight: 1 },
  bigTemp:      { fontSize: 36, fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1.1 },
  weatherDesc:  { fontSize: 'var(--fs-title)', color: 'var(--text-secondary)', marginTop: 4 },
  weatherMeta:  { fontSize: 'var(--fs-meta)', color: 'var(--text-muted)', marginTop: 6 },
  forecastRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(100,160,210,0.06)', borderRadius: 10, fontSize: 'var(--fs-body)' },
  forecastLabel:{ color: 'var(--text-muted)', fontSize: 'var(--fs-meta)', fontWeight: 600 },
  forecastDesc: { flex: 1, color: 'var(--text-secondary)' },
  forecastTemp: { color: 'var(--text-primary)', fontWeight: 500 },

  // Horoscope
  horoscopeBlock: { display: 'flex', flexDirection: 'column', gap: 14 },
  horoHeader:   { display: 'flex', alignItems: 'flex-start', gap: 16 },
  horoSign:     { fontSize: 'var(--fs-title)', fontWeight: 700, color: 'var(--accent-light)', marginBottom: 6 },
  horoOverall:  { fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6 },
  starBars:     { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'rgba(100,160,210,0.05)', borderRadius: 10, border: '1px solid rgba(100,160,210,0.08)' },
  horoMeta:     { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tagLabel:     { fontSize: 'var(--fs-tiny)', color: 'var(--text-muted)', marginRight: 4, letterSpacing: '0.02em' },
  horoGrid:     { display: 'flex', flexDirection: 'column', gap: 8 },
  horoItem:     { display: 'flex', gap: 10, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6 },
  horoLabel:    { color: 'var(--text-muted)', flexShrink: 0, width: 52 },
  horoSummary:  { fontSize: 'var(--fs-body)', color: 'var(--accent-light)', background: 'var(--accent-glow)', borderRadius: 8, padding: '10px 14px', lineHeight: 1.7, fontStyle: 'italic' },

  // Insight
  insightBlock:       { display: 'flex', flexDirection: 'column', gap: 12 },
  insightRole:        { display: 'inline-block', alignSelf: 'flex-start', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--accent-light)', background: 'rgba(74,144,196,0.12)', border: '1px solid rgba(74,144,196,0.25)', borderRadius: 99, padding: '4px 14px', letterSpacing: '0.03em' },
  insightOpener:      { fontSize: 'var(--fs-title)', color: 'var(--text-primary)', lineHeight: 1.7, fontStyle: 'italic', background: 'rgba(100,160,210,0.06)', borderLeft: '3px solid var(--accent)', borderRadius: '0 8px 8px 0', padding: '10px 14px' },
  insightTasks:       { display: 'flex', flexDirection: 'column', gap: 8 },
  insightTaskRow:     { display: 'flex', alignItems: 'flex-start', gap: 10 },
  insightTaskNum:     { fontSize: 'var(--fs-title)', color: 'var(--accent-light)', fontWeight: 700, flexShrink: 0, lineHeight: 1.5 },
  insightTaskText:    { fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.6 },
  insightWarning:     { fontSize: 'var(--fs-body)', color: 'var(--yellow)', background: 'var(--yellow-dim)', border: '1px solid rgba(212,169,74,0.2)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 },
  insightFortune:     { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-body)', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid rgba(100,160,210,0.08)', paddingTop: 10, marginTop: 2 },
  insightFortuneIcon: { fontSize: 16, flexShrink: 0 },
  // legacy
  insightTitle: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 },
  insightBody:  { fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: 1.7 },
  insightTags:  { display: 'flex', gap: 8, flexWrap: 'wrap' },
}

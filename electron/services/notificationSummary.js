const { isConfigured, callLLM } = require('./llm')

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// Fallback: group into per-sender threads (no AI)
function buildFallbackGroups(notifications) {
  const map = {}
  notifications.forEach((n, idx) => {
    const key = `${n.app}::${n.title}`
    if (!map[key]) {
      map[key] = {
        groupKey:      key,
        app:           n.app,
        sender:        n.title,
        bundleId:      n.bundleId,
        topic:         null,
        urgency:       null,
        messages:      [],
        lastTimestamp: 0,
        summary:       null,
        suggestedReply: null,
      }
    }
    if (n.body) map[key].messages.push({ body: n.body, timestamp: n.timestamp, idx })
    if (n.timestamp > map[key].lastTimestamp) map[key].lastTimestamp = n.timestamp
  })
  Object.values(map).forEach((g) =>
    g.messages.sort((a, b) => a.timestamp - b.timestamp)
  )
  return Object.values(map).sort((a, b) => b.lastTimestamp - a.lastTimestamp)
}

// Urgency sort order
const URGENCY_ORDER = { high: 0, medium: 1, low: 2, null: 3 }
function sortByUrgency(groups) {
  return [...groups].sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency] ?? 3
    const ub = URGENCY_ORDER[b.urgency] ?? 3
    if (ua !== ub) return ua - ub
    return b.lastTimestamp - a.lastTimestamp
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Single-pass smart summary: one LLM call to cluster topics, rank urgency,
 * generate summaries and suggested replies for all notifications at once.
 */
async function generateSmartSummary(notifications) {
  if (!notifications.length) {
    return { overallSummary: null, groups: [], demo: true, error: null }
  }

  // ── Step 1: Pre-group by code (not AI) ───────────────────────────────────
  // Group key = app::title (title is already parsed: group name or contact name)
  // This ensures Andy (1-on-1) and Andy's messages in group 我餓 are ALWAYS separate.
  const preGroupMap = {}
  notifications.forEach((n, idx) => {
    const key = `${n.app}::${n.title}`
    if (!preGroupMap[key]) {
      preGroupMap[key] = {
        app:      n.app,
        title:    n.title,       // group name or contact name
        bundleId: n.bundleId,
        isGroup:  !!n.subtitle,  // true if parsed from "sender [group]" format
        msgs:     [],
      }
    }
    preGroupMap[key].msgs.push({ idx, body: n.body, subtitle: n.subtitle, timestamp: n.timestamp })
  })
  const preGroups = Object.values(preGroupMap).sort(
    (a, b) => Math.max(...b.msgs.map(m => m.timestamp)) - Math.max(...a.msgs.map(m => m.timestamp))
  )

  const totalSenders = preGroups.length

  // ── Step 2: Fallback (no AI) ──────────────────────────────────────────────
  if (!isConfigured()) {
    const groups = preGroups.map(g => {
      const messages = g.msgs
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => ({ body: m.body, timestamp: m.timestamp }))
      const lastTimestamp = Math.max(...g.msgs.map(m => m.timestamp))
      const label = g.isGroup
        ? `${g.title}（群組）`
        : g.title
      return {
        groupKey:       `${g.app}::${g.title}`,
        app:            g.app,
        sender:         label,
        bundleId:       g.bundleId,
        topic:          null,
        urgency:        null,
        messages,
        lastTimestamp,
        summary:        null,
        suggestedReply: null,
      }
    })
    return {
      overallSummary: `共 ${notifications.length} 則訊息，來自 ${totalSenders} 個對話`,
      groups,
      demo: true,
      error: null,
    }
  }

  // ── Step 3: Build prompt — one entry per pre-determined group ─────────────
  // AI is asked to analyze each group (NOT decide grouping).
  const groupLines = preGroups.map((g, gi) => {
    const label = g.isGroup ? `[群組] ${g.title}` : `[1-on-1] ${g.title}`
    const msgList = g.msgs
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(m => {
        const time   = formatTime(m.timestamp)
        const sender = m.subtitle ? `${m.subtitle}` : g.title
        return `  - ${sender} ${time}: ${m.body || '（無內文）'}`
      }).join('\n')
    return `G${gi} ${g.app} ${label}:\n${msgList}`
  })

  const prompt = `你是使用者的個人助理。以下是使用者未讀通知，已按對話分組：

${groupLines.join('\n\n')}

請為每個群組（G0, G1, ...）輸出 JSON 分析，只輸出 JSON，不要任何說明文字：
{
  "overallSummary": "一句話總結，例如『收到 X 則訊息，來自 Y 個對話』",
  "groups": [
    {
      "groupIndex": 0,
      "topic": "此對話的簡短標題（10字內）",
      "urgency": "high" | "medium" | "low" | null,
      "summary": "摘要（不超過30字）",
      "suggestedReply": "建議回覆（自然口語，不超過50字，直接給內容不要有前綴）"
    }
  ]
}

urgency 判斷：確定很急（問時間/截止/緊急字眼）→ high；一般工作或問問題 → medium；聊天閒聊 → low；無法判斷 → null
groups 按 urgency 排序：high → medium → low → null`

  try {
    const raw = await callLLM({
      user: prompt,
      temperature: 0.3,
    })
    console.log('[SmartSummary] output length:', raw.length, '| preview:', raw.slice(0, 150))

    let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const lastBrace = cleaned.lastIndexOf('}')
      if (lastBrace > 0) {
        const truncated = cleaned.slice(0, lastBrace + 1)
        try { parsed = JSON.parse(truncated + ']}') } catch {
          try { parsed = JSON.parse(truncated + ']}}') } catch {
            throw new Error('JSON parse failed after recovery attempt')
          }
        }
      } else {
        throw new Error('JSON parse failed: no recoverable structure')
      }
    }

    // ── Step 4: Hydrate — merge AI analysis back into pre-groups ─────────────
    const aiByIndex = {}
    for (const ag of (parsed.groups || [])) {
      if (ag.groupIndex != null) aiByIndex[ag.groupIndex] = ag
    }

    const groups = preGroups.map((g, gi) => {
      const ai  = aiByIndex[gi] || {}
      const messages = g.msgs
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => ({ body: m.body, timestamp: m.timestamp }))
      const lastTimestamp = Math.max(...g.msgs.map(m => m.timestamp))
      const label = g.isGroup ? `${g.title}（群組）` : g.title

      return {
        groupKey:       `${g.app}::${g.title}`,
        app:            g.app,
        sender:         label,
        bundleId:       g.bundleId,
        topic:          ai.topic          || null,
        urgency:        ai.urgency        || null,
        messages,
        lastTimestamp,
        summary:        ai.summary        || null,
        suggestedReply: ai.suggestedReply || null,
      }
    })

    const sorted = sortByUrgency(groups)

    return {
      overallSummary: parsed.overallSummary || `共 ${notifications.length} 則訊息，來自 ${totalSenders} 個對話`,
      groups: sorted,
      demo: false,
      error: null,
    }
  } catch (e) {
    // LLM or parse error → fallback to pre-grouped result (no AI analysis)
    const groups = sortByUrgency(preGroups.map((g, gi) => {
      const messages = g.msgs
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => ({ body: m.body, timestamp: m.timestamp }))
      const lastTimestamp = Math.max(...g.msgs.map(m => m.timestamp))
      return {
        groupKey: `${g.app}::${g.title}`,
        app: g.app,
        sender: g.isGroup ? `${g.title}（群組）` : g.title,
        bundleId: g.bundleId,
        topic: null, urgency: null, messages, lastTimestamp,
        summary: null, suggestedReply: null,
      }
    }))
    return {
      overallSummary: `共 ${notifications.length} 則訊息，來自 ${totalSenders} 個對話`,
      groups,
      demo: true,
      error: e.message,
    }
  }
}

module.exports = { generateSmartSummary }

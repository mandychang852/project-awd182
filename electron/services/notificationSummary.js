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

  // Build the flat message list for the prompt
  const lines = notifications.map((n, i) => {
    const time = formatTime(n.timestamp)
    const body = n.body ? `${n.title} ${time}: ${n.body}` : `${n.title} ${time}: （無內文）`
    return `[${i}] ${n.app} ${body}`
  })

  const totalSenders = new Set(notifications.map((n) => `${n.app}::${n.title}`)).size

  // Fallback for no AI
  if (!isConfigured()) {
    const groups = buildFallbackGroups(notifications)
    const sorted = sortByUrgency(groups)
    return {
      overallSummary: `共 ${notifications.length} 則訊息，來自 ${totalSenders} 位聯絡人`,
      groups: sorted,
      demo: true,
      error: null,
    }
  }

  const prompt = `你是使用者的個人助理。以下是使用者剛收到的未讀通知（格式：[編號] App 發送者 時間: 內文）：

${lines.join('\n')}

請分析並輸出 JSON（只輸出 JSON，不要任何其他說明文字）：
{
  "overallSummary": "一句話總結，例如『收到 X 則訊息，來自 Y 位聯絡人』",
  "groups": [
    {
      "app": "App名稱",
      "sender": "發送者名稱",
      "topic": "此話題的簡短標題（10字內）",
      "urgency": "high" 或 "medium" 或 "low" 或 null,
      "messageIndices": [對應上方的編號陣列],
      "summary": "此話題摘要（不超過30字）",
      "suggestedReply": "建議回覆內容（自然口語，不超過50字，直接給內容不要有前綴）"
    }
  ]
}

規則：
1. 同一發送者不同話題 → 拆成不同 group
2. 同一發送者同一話題的多則訊息 → 合併成一個 group，messageIndices 包含所有該話題的編號
3. urgency 判斷：確定很急（問時間/截止/緊急字眼）→ high；一般工作或問問題 → medium；聊天閒聊 → low；無法判斷 → null
4. groups 按 urgency 排序：high → medium → low → null，同 urgency 按最新時間排
5. 只輸出 JSON，不要 markdown code block`

  try {
    const raw = await callLLM({
      user: prompt,
      temperature: 0.3,
      // maxTokens not set — let the model output a complete JSON without truncation
    })
    console.log('[SmartSummary] output length:', raw.length, '| preview:', raw.slice(0, 150))

    // Strip markdown code fences if present
    let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    // If JSON is truncated, attempt to recover by closing open arrays/objects
    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Find last complete group object ending with }
      const lastBrace = cleaned.lastIndexOf('}')
      if (lastBrace > 0) {
        // Close the groups array and root object
        const truncated = cleaned.slice(0, lastBrace + 1)
        try {
          // Try wrapping as complete JSON
          parsed = JSON.parse(truncated + ']}')
        } catch {
          try {
            parsed = JSON.parse(truncated + ']}}')
          } catch {
            throw new Error('JSON parse failed after recovery attempt')
          }
        }
      } else {
        throw new Error('JSON parse failed: no recoverable structure')
      }
    }

    // Hydrate each group with full message objects from original notifications
    const groups = (parsed.groups || []).map((g) => {
      const indices  = Array.isArray(g.messageIndices) ? g.messageIndices : []
      const messages = indices
        .map((i) => notifications[i])
        .filter(Boolean)
        .map((n) => ({ body: n.body, timestamp: n.timestamp }))
      const lastTimestamp = messages.reduce((max, m) => Math.max(max, m.timestamp), 0)
      const bundleId = (notifications.find(
        (n) => n.app === g.app && n.title === g.sender
      ) || {}).bundleId || ''

      return {
        groupKey:      `${g.app}::${g.sender}::${g.topic}`,
        app:           g.app || '',
        sender:        g.sender || '',
        bundleId,
        topic:         g.topic || null,
        urgency:       g.urgency || null,
        messages,
        lastTimestamp,
        summary:       g.summary || null,
        suggestedReply: g.suggestedReply || null,
      }
    })

    return {
      overallSummary: parsed.overallSummary || null,
      groups,
      demo: false,
      error: null,
    }
  } catch (e) {
    // LLM or parse error → fallback to basic grouping
    const groups = sortByUrgency(buildFallbackGroups(notifications))
    return {
      overallSummary: `共 ${notifications.length} 則訊息，來自 ${totalSenders} 位聯絡人`,
      groups,
      demo: true,
      error: e.message,
    }
  }
}

module.exports = { generateSmartSummary }

const axios        = require('axios')
const storeService = require('./store')

// ── Serial queue with rate-limit spacing ─────────────────────────────────
// Gemini free tier: 15 RPM. Queue all calls so they run one-at-a-time,
// and add a 4s gap between calls to avoid bursting (max ~15/min).
let _queuePromise = Promise.resolve()
const QUEUE_DELAY_MS = 4000 // 4s gap → max 15 calls/min

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function enqueue(fn) {
  const result = _queuePromise.then(() => fn())
  // After each call (success or fail), wait before the next one
  _queuePromise = result
    .catch(() => {})
    .then(() => sleep(QUEUE_DELAY_MS))
  return result
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  claude: 'claude-3-5-haiku-20241022',
}

const KEY_FIELDS = {
  openai: 'openaiApiKey',
  gemini: 'geminiApiKey',
  claude: 'claudeApiKey',
}

function getProviderConfig() {
  const provider = storeService.get('llmProvider') || 'openai'
  const model    = storeService.get('llmModel')    || DEFAULT_MODELS[provider] || 'gpt-4o-mini'
  const apiKey   = storeService.get(KEY_FIELDS[provider] || 'openaiApiKey') || ''
  return { provider, model, apiKey }
}

function isConfigured() {
  const { apiKey } = getProviderConfig()
  return !!apiKey
}

/**
 * Unified LLM caller.
 * @param {{ system?: string, user: string, maxTokens?: number, temperature?: number }} opts
 * @returns {Promise<string>} response text
 */
async function callLLM({ system = '', user, maxTokens = null, temperature = 0.7 }) {
  const { provider, model, apiKey } = getProviderConfig()
  if (!apiKey) throw new Error('no_api_key')

  return enqueue(() => {
    switch (provider) {
      case 'gemini': return _gemini(apiKey, model, system, user, maxTokens, temperature)
      case 'claude': return _claude(apiKey, model, system, user, maxTokens, temperature)
      default:       return _openai(apiKey, model, system, user, maxTokens, temperature)
    }
  })
}

async function _openai(apiKey, model, system, user, maxTokens, temperature) {
  const { OpenAI } = require('openai')
  const client   = new OpenAI({ apiKey })
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: user })
  const params = { model, messages, temperature }
  if (maxTokens) params.max_tokens = maxTokens
  const res = await client.chat.completions.create(params)
  return res.choices[0].message.content.trim()
}

async function _gemini(apiKey, model, system, user, maxTokens, temperature) {
  const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const generationConfig = { temperature }
  if (maxTokens) generationConfig.maxOutputTokens = maxTokens
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig,
  }
  if (system) body.system_instruction = { parts: [{ text: system }] }
  const res = await axios.post(url, body, { timeout: 25000 })
  return res.data.candidates[0].content.parts[0].text.trim()
}

async function _claude(apiKey, model, system, user, maxTokens, temperature) {
  const body = {
    model,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens || 1024,  // Claude requires max_tokens
  }
  if (system) body.system = system
  if (temperature !== undefined) body.temperature = temperature
  const res = await axios.post('https://api.anthropic.com/v1/messages', body, {
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    timeout: 25000,
  })
  return res.data.content[0].text.trim()
}

module.exports = { callLLM, isConfigured }

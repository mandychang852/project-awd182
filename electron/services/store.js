const Store = require('electron-store')

const store = new Store({
  name: 'user-settings',
  defaults: {
    city: '',
    countyName: '',
    countyCid:  '',
    zodiacSign: '',
    morningNotificationTime: '07:00',
    // LLM provider settings
    llmProvider:  'openai',
    llmModel:     'gpt-4o-mini',
    openaiApiKey: '',
    geminiApiKey: '',
    claudeApiKey: '',
    weatherApiKey: '',
    exchangeRateToken: '',
    exchangeRateApiUrl: '',
    stocks: [],
    sinopacConnected: false,
    sinopacApiKey: '',
    onboardingComplete: false,
  },
})

function getSettings() {
  return store.store
}

function saveSettings(settings) {
  Object.entries(settings).forEach(([key, value]) => {
    store.set(key, value)
  })
  return store.store
}

function get(key) {
  return store.get(key)
}

function set(key, value) {
  store.set(key, value)
}

module.exports = { getSettings, saveSettings, get, set }

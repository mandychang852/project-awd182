const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings:    ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:   (settings) => ipcRenderer.invoke('save-settings', settings),

  // Weather
  getWeather:     (force)    => ipcRenderer.invoke('get-weather', { force: !!force }),

  // Horoscope
  getHoroscope:         ()  => ipcRenderer.invoke('get-horoscope'),
  getCombinedInsight:   ()  => ipcRenderer.invoke('get-combined-insight'),

  // Stocks
  getStocks:      ()          => ipcRenderer.invoke('get-stocks'),
  lookupStock:        (symbol) => ipcRenderer.invoke('lookup-stock', symbol),
  lookupStockByName:  (name)   => ipcRenderer.invoke('lookup-stock-by-name', name),
  addStock:       (stock)     => ipcRenderer.invoke('add-stock', stock),
  updateStock:    (stock)     => ipcRenderer.invoke('update-stock', stock),
  removeStock:    (symbol)    => ipcRenderer.invoke('remove-stock', symbol),
  reorderStocks:  (symbols)   => ipcRenderer.invoke('reorder-stocks', symbols),

  // Notifications
  getNotifications:  ()       => ipcRenderer.invoke('get-notifications'),
  getSmartSummary:   (opts)   => ipcRenderer.invoke('get-smart-summary', opts || {}),
  testLlm:           (settings) => ipcRenderer.invoke('test-llm', settings),
  aiReply:           (payload)  => ipcRenderer.invoke('ai-reply', payload),

  // Exchange Rates
  getExchangeRates:    (opts)    => ipcRenderer.invoke('get-exchange-rates', opts || {}),
  getBestRateAdvice:   (payload) => ipcRenderer.invoke('get-best-rate-advice', payload),
  getRateAlerts:       ()        => ipcRenderer.invoke('get-rate-alerts'),
  addRateAlert:        (alert)   => ipcRenderer.invoke('add-rate-alert', alert),
  removeRateAlert:     (id)      => ipcRenderer.invoke('remove-rate-alert', id),

  // Events pushed from main process
  onStockAlert:   (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('stock-alert', handler)
    return () => ipcRenderer.removeListener('stock-alert', handler)
  },
  onRateAlert:    (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('rate-alert', handler)
    return () => ipcRenderer.removeListener('rate-alert', handler)
  },
  onDataRefresh:  (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('data-refresh', handler)
    return () => ipcRenderer.removeListener('data-refresh', handler)
  },

  // Platform info
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
})

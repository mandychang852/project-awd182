# 我的小當家 — 個人化智慧通知助手

一款基於 Electron + React 的桌面 App，整合 AI 語言模型，協助你在回到電腦後快速掌握未讀訊息重點，並直接生成建議回覆。

---

## 功能介紹

### 🔔 智慧通知中心
- 自動讀取 macOS 通知中心未清除的訊息（需要完整磁碟存取權限），每 30 秒自動刷新
- 標題旁顯示「HH:MM 更新」，讓你隨時確認資料是否最新
- 透過 AI 一次性分析所有未讀通知，依話題自動分群（同一個人的不同話題拆成不同卡片）
- 每個話題顯示：AI 摘要、急迫程度（🔴 急 / 🟡 一般）、建議回覆內容
- 建議回覆可直接編輯；按「馬上回覆」會自動複製回覆文字到剪貼簿，並開啟對應 App（LINE、Slack 等）
- 標記「已處理」讓你知道哪些還沒處理（重整後清空）
- 按 ↻ 強制重新分析（即使通知內容沒變化）

### 📈 股票追蹤
- 追蹤台股（TSE / OTC）與美股即時報價
- 支援以中文名稱搜尋台股（例如「台積電」）
- 顯示損益試算，依幣別分開計算（台幣 / 美元）
- 設定目標高低價，達到時會彈出提醒通知

### ☀️ 天氣 & 星座運勢
- 顯示目前所在城市的天氣狀況
- 每日星座運勢摘要

### 💱 外幣匯率
- 顯示台灣銀行即時買入 / 賣出匯率
- 支援多種幣別，提供最佳換匯建議

### ⚙️ AI 設定
- 支援 Google Gemini（免費）、OpenAI、Anthropic Claude
- 可在設定頁面測試 API 金鑰是否連線正常

---

## 安裝與開發環境啟動

### 系統需求
- Node.js 18 以上
- npm 9 以上

### 步驟

```bash
# 1. 安裝依賴套件
npm install

# 2. 啟動開發模式（Vite + Electron 同時執行）
npm run dev
```

開發模式下會自動開啟 DevTools，可在 Console 看到 AI 輸出的原始 log。

---

## 打包成獨立 App

### Mac 使用者

```bash
npm run dist
```

打包完成後，`dist/` 資料夾會產生 `.dmg` 安裝檔。  
雙擊 `.dmg` → 將 App 拖入 Applications 資料夾即可使用。

> **注意（Mac 專屬）**：首次使用通知中心功能，需要授予「完整磁碟存取」權限：  
> 系統設定 → 隱私權與安全性 → 完整磁碟存取 → 加入本 App

### Windows 使用者

```bash
npm run dist
```

打包完成後，`dist/` 資料夾會產生 `.exe` 安裝檔（NSIS 格式）。  
雙擊安裝後即可使用。

> **注意**：Windows 版本已支援通知中心讀取功能。與 macOS 不同，Windows 不需要額外的「完整磁碟存取」權限，但仍建議以一般使用者權限執行即可。其他功能（股票、天氣、匯率、AI 設定）亦均可正常使用。

---

## 設定 API 金鑰

啟動 App 後，點擊右上角 ⚙️ 進入設定頁面：

| 功能 | 需要的 API |
|------|-----------|
| AI 通知分析 / 建議回覆 | Google Gemini（免費）或 OpenAI 或 Claude |
| 天氣 | OpenWeatherMap（免費） |
| 匯率 | 台灣銀行 Open API（免費，無需金鑰） |
| 股票 | Yahoo Finance（免費，無需金鑰） |

### 推薦：Google Gemini 免費 API 金鑰申請

1. 前往 [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. 點「Create API key」→「Create API key in new project」
3. 複製金鑰，貼入設定頁面的「Google Gemini API Key」欄位
4. 模型選 `gemini-2.5-flash`
5. 點「🔌 測試連線」確認成功

---

## 技術架構

- **前端**：React 18 + Vite
- **桌面殼**：Electron 29
- **資料儲存**：electron-store（設定）
- **通知讀取**：macOS `usernoted` SQLite DB，透過系統 `sqlite3` CLI 讀取（自動套用 WAL，解決資料停留問題）；Windows 使用 WPN SQLite DB
- **馬上回覆**：使用 Electron 原生 `clipboard.writeText()` 複製回覆；開啟 App 優先使用 URL Scheme（Slack `slack://`、Teams `msteams://` 等），其餘 App 使用 `open -b BundleID`
- **AI**：單次 LLM call，hash 快取避免重複打 API
- **股票資料**：Yahoo Finance API + TWSE / TPEx OpenAPI

---

## 授權

MIT

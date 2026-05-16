# 給 Claude Code 的工作指南

這個 repo 是「夜間打工仔」——三個 AI 模型輪番辯論幫使用者想事情的工具。**使用者大多不是工程師**，他們把這個 repo clone 下來、開 Claude Code、跟你說「幫我設定」就期待你接手。

你的工作有四類：
1. **第一次來的新使用者**：環境＋ key 設定
2. **「我想要夜間工人團隊幫我做 ___」**：跑一次任務
3. **設定長期重複使用的人設**：給「每天會用」的人客製化 `personal.json`
4. **故障排除**

---

## ⚠️ 環境限制（先確認你能跑下面這些）

這個工具需要：
- 跑 shell 指令（`git`, `node`, `npm`）
- 讀寫檔案
- **對外打 HTTP API**（呼叫 Groq / NVIDIA）

如果你發現自己卡在「shell 跑得了但 fetch / curl 對外被擋」（譬如 Claude Cowork 沙箱），**直接告訴使用者：「這個工具需要能對外打 API，這個環境擋了，請改用 Claude Code（CLI 或 Claude Desktop 的 Code 模式）」**，不要硬試。

---

## 情境 1：使用者第一次來

當使用者說「幫我設定」「我剛 clone 下來」「我想開始用」這類話，照下面做。**不要先問十個問題，先動手檢查環境**。

### Step 1 — 環境檢查（並列跑）
```bash
node --version          # 要 >= 20
ls .env 2>/dev/null     # 看 .env 在不在
ls config/personal*.json 2>/dev/null  # 看有沒有舊的個人設定
```

- Node < 20 或沒裝 → 引導使用者裝 Node 20+（macOS 推 `brew install node` 或 nvm）
- 沒 `.env` → 跑 `cp .env.example .env`
- **這個專案沒 npm dependency**，不用跑 `npm install`

### Step 2 — 拿 API key
**告訴使用者**（用他們的語言，不要照念）：
- 「需要兩個免費 key，都不用信用卡：
  1. **Groq**：開 https://console.groq.com/keys → Google 登入 → Create API Key → 複製 `gsk_...`
  2. **NVIDIA**（選配，主用 Kimi 模型）：開 https://build.nvidia.com → 註冊 → 右上頭像 → Generate Key → 複製 `nvapi-...`
- 拿到後貼給我，我幫你填進 `.env`」

**安全注意**：使用者把 key 貼給你時，**用 Edit 工具寫進 `.env`**，**不要 echo 或顯示在訊息裡、log 裡**。

### Step 3 — 完成 ✅

**不要在這裡叫他填人設**。直接告訴他：「環境好了，跟我說你想要夜間工人團隊幫你做什麼？」然後接到**情境 2**。

人設 / brand voice 那些**等知道任務之後再針對性問**，不要 onboarding 一開始就問一堆。

---

## 情境 2：「我想要夜間工人團隊幫我做 ___」

當使用者要設定一次任務時，照下面做。

### 任務範例（給沒想法的使用者參考）

- 💡 **明天可以發文的主題 + 完整文案**（IG / Threads / FB / blog）
- 📄 **改履歷**（給 JD + 現有履歷，三個模型辯論該怎麼改）
- 🤔 **A vs B vs C 方案哪個值得做**（譬如：接這個 case / 換工作 / 報這個課 / 買哪台筆電）
- 📚 **長文／email／提案的開場怎麼寫**（給背景 + 想達到的效果）
- 🎯 **下一季 / 下個月該主推什麼**（給目前狀況 + 目標 + 限制）
- 💔 **不太知道怎麼開口的對話**（跟伴侶冷戰、跟老闆提離職、跟家人講壞消息）
- 🧭 **遇到模糊 / 兩難情境想要第三方意見**

不適合的（要提醒使用者去別處）：
- 即時資訊查詢（沒接 web search）
- 需要算數字 / 跑程式碼的（請他直接用 Claude Code 寫 script）
- 醫療 / 法律 / 投資建議（請去找專業）

### Step 1 — 確認任務 + 看有沒有現成人設可以沿用

先 **`ls config/personal*.json`**。

**如果有舊檔**：跟使用者說「我看到你之前設定過 `personal.json`（裡面有你 brand voice / audience / 過去爆款這些）。這次任務要不要沿用？還是這次是不同情境想重新設？」

**如果沒舊檔**：跳到 Step 2。

### Step 2 — 問跟「這個任務」相關的最小必要資訊

**不要照 default.json 把整張表丟給使用者問**。看任務是哪類，問下面對應的：

| 任務類型 | 必問 | 可選（有最好沒有也行） |
|---|---|---|
| IG / 社群選題 | 你的領域、主受眾、brand voice 三句話、最近 3 篇爆款 hook | avoid_topics、CTA 關鍵字 |
| 改履歷 | 目標職位 JD（貼一段）、你現在履歷重點（3-5 條）、想突顯什麼 | 不想被看到什麼弱點 |
| ABC 方案選擇 | 三個方案內容、每個的成本/時間、你的紅線 | 你的偏好傾向、別人怎麼建議 |
| 長文 / email 開場 | 收件人是誰、你想要對方做什麼、調性偏好 | 你想避免的口氣 |
| 季度 / 月度方向 | 目前狀況（一段）、目標（具體）、限制（時間/錢/人） | 過去做過什麼有效 |
| 難開口的對話 | 對方是誰、你想說什麼、最在意對方什麼反應 | 過去類似嘗試結果 |
| 模糊 / 兩難判斷 | 兩條路各自是什麼、你的紅線、目前在意什麼 | 別人怎麼說 |

**一次問完，不要追問 5 個 round**。使用者跟你講三五句就要動手。

### Step 3 — 選辯論模式

給三個簡述讓使用者選（或你看任務直接決定，然後跟使用者確認）：
- **共識型**（廣撒網提案、收斂出最佳解）— 適合「我不知道有哪些選項」
- **對抗型**（一方提案、一方專挑翻車情境）— 適合「我已經有方向但怕踩雷」
- **文案職人型**（直接寫完整文案）— 適合「我要寫 IG / Threads / blog / 履歷 / email」

預設：IG 選題用文案職人型、改履歷用對抗型、其他用共識型。

### Step 4 — 建一份臨時 config

用 Write 工具建 `config/runs/YYYY-MM-DD-HHMM-{task-slug}.json`。從 default.json 複製過來當基底，然後**只覆蓋這次任務相關的欄位**：

- `current_focus` ← 使用者這次的任務描述 + 背景資料（**最重要的欄位**，模型主要靠這個工作）
- `debate_mode` ← 你選的模式
- `owner` / `topic_context` / `audience` / `brand_voice` ← 從使用者剛剛回答整理
- `recent_hits` / `avoid_topics` / `preferred_hook_types` ← 有就填、沒有就刪掉那段（不要留 `(請填...)` placeholder，模型會困惑）

如果使用者要保留這份設定下次用：另存 `config/personal-{task}.json`（已被 .gitignore）。

### Step 5 — 跑
```bash
CONFIG_PATH=config/runs/YYYY-MM-DD-HHMM-{task-slug}.json npm run debate
```

- 跑 90-150 秒
- NVIDIA timeout → fallback chain 接管，正常
- Groq 429 → 等 60 秒重跑

### Step 6 — 翻譯結果

**幫使用者讀 `results/latest.json`**：
- `rounds.round3.final_picks` 是最終建議
- `rounds.round3.owner_message` 是給使用者的訊息
- copy_writer 模式下 `ready_to_post` 是「直接複製貼上」版

**不要丟 raw JSON 給使用者看，翻成人話**。問他要不要：
- 換個辯論模式再跑一次
- 補充 `current_focus` 細節再跑
- 把結果存起來（Obsidian / Notion）

---

## 情境 3：設定長期重複使用的人設

使用者說「我要每天都用這個工具」「幫我設一份固定的 brand voice」「我之後要每天跑 IG 選題」這類話 → 走這個流程。

### Step 1 — 把資料整理進 `config/personal.json`

從 `config/default.json` 複製成 `config/personal.json`（已被 .gitignore，不會 push 出去），然後跟使用者一起填：

- `owner` — 名字 / 自稱
- `topic_context` — 領域定位 1-2 句
- `audience` — 受眾畫像
- `brand_voice` — 語氣風格（小心：這個改一點點影響很大）
- `avoid_topics` — 不想碰的主題 list
- `preferred_hook_types` — 偏好的 hook 範例
- `recent_hits` — 最近 3-5 篇爆款（title / hook / why_worked）
- `expansion_zones` — 想開拓的新領域
- `diversity_mandate` — 多樣性硬規定
- `current_focus` — 留空（情境 2 才動）

### Step 2 — 設成預設

跟使用者說：「之後要跑直接用 `CONFIG_PATH=config/personal.json npm run debate`，或我幫你加個 npm script `debate:me` 簡化指令」。

如果他要：編輯 `package.json` 加 `"debate:me": "CONFIG_PATH=config/personal.json node --env-file=.env scripts/debate.mjs"`。

### Step 3 — 跑一次驗證

確認 brand voice 抓對了。沒抓對就微調 `brand_voice` 跟 `preferred_hook_types`。

---

## 情境 4：故障排除

| 症狀 | 處理 |
|---|---|
| `Missing env var: GROQ_API_KEY` | `.env` 還沒設，回情境 1 step 2 |
| `nvidia timeout` 後切備胎 | 正常，NVIDIA 不穩 fallback 會接 |
| `Groq HTTP 429` | TPM bucket 滿，等 60 秒再試 |
| `Cannot parse JSON` | 模型吐壞了，重跑通常就好；常重複 → 換模型 |
| 結果 `success: false` | 看 `error` 欄位，照訊息處理 |
| 出來的主題重複舊主題 | 加進 `recent_hits` 並強化 `diversity_mandate` |
| `fetch failed` / 連線被擋（沙箱環境） | 環境不支援對外 API，請使用者改用 Claude Code（CLI 或 Desktop Code 模式） |

---

## 你的個性

- **動手快於問**。能查的查、能跑的跑，不要把 onboarding 變問卷
- **問題要分情境問**。情境 1 只問 key、情境 2 只問跟這次任務有關的、不要混在一起
- **翻人話**。不要丟 JSON / 程式碼給使用者，幫他讀出來
- **守安全**。API key 用 Edit 寫檔，不要在訊息或 log 顯示
- **不過度承諾**。模型有時會跑爛、會選爛建議，誠實講「這次可能不夠好，要不要再跑一次／換模式」

---

## 給你看的 repo 結構

```
night-worker/
├── README.md                # 給人讀的說明
├── CLAUDE.md                # 你正在讀這個
├── .env.example             # API key 範本
├── package.json             # npm scripts
├── config/
│   ├── default.json         # 通用範本（共識型辯論）
│   ├── copy-writer.json     # 通用範本（寫貼文模式）
│   ├── all-nvidia.json      # NVIDIA-only 備案
│   ├── personal*.json       # 個人設定（gitignored）
│   └── runs/                # 一次性任務 config（gitignored）
├── scripts/
│   ├── debate.mjs           # 主程式
│   ├── providers.mjs        # API 呼叫層（含 fallback chain）
│   └── strategies.mjs       # 4 種辯論模式的 prompt
├── results/                 # 跑出來的結果
│   ├── latest.json          # 最新一次
│   └── YYYY-MM-DD.json      # 每次按日期存
├── docs/                    # GitHub Pages 顯示頁
│   └── index.html
└── .github/workflows/       # GitHub Actions cron（選用）
    └── nightly-debate.yml
```

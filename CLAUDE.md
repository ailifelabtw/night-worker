# 給 Claude Code 的工作指南

這個 repo 是「夜間打工仔」——三個 AI 模型輪番辯論幫使用者想事情的工具。**使用者大多不是工程師**，他們把這個 repo clone 下來、開 Claude Code、跟你說「幫我設定」就期待你接手。

你的工作有三類：
1. **第一次來的新使用者**：onboarding
2. **「我今天想討論 ___」**：跑一次性辯論
3. **要客製化每日 IG 主題或建議**：改 `config/default.json`

下面按情境給你 SOP。

---

## 情境 1：使用者第一次來

當使用者說「幫我設定」「我剛 clone 下來」「我想開始用」這類話，照下面做。**不要先問十個問題，先動手檢查環境**：

### Step 1 — 環境檢查（並列跑）
```bash
node --version          # 要 >= 20
ls .env 2>/dev/null     # 看 .env 在不在
ls node_modules 2>/dev/null | head -1  # 看裝了沒
```

- Node < 20 或沒裝 → 引導使用者裝 Node 20+（macOS 推 `brew install node` 或 nvm）
- 沒 `.env` → 跑 `cp .env.example .env`
- 沒 `node_modules` → **這個專案沒 dependency**，跳過 npm install（純 Node ESM）

### Step 2 — 拿 API key
**告訴使用者**（用他們的語言，不要照念）：
- 「需要兩個免費 key，都不用信用卡：
  1. **Groq**：開 https://console.groq.com/keys → Google 登入 → Create API Key → 複製 `gsk_...`
  2. **NVIDIA**（選配，主用 Kimi 模型）：開 https://build.nvidia.com → 註冊 → 右上頭像 → Generate Key → 複製 `nvapi-...`
- 拿到後貼給我，我幫你填進 `.env`」

**安全注意**：使用者把 key 貼給你時，**用 Edit 工具寫進 `.env`**，**不要 echo 或顯示在訊息裡**。

### Step 3 — 跑一次測試
```bash
npm run debate:copy-writer
```
- 順利 → 跑 90-150 秒，結果寫進 `results/YYYY-MM-DD.json`
- NVIDIA timeout → fallback chain 會自動接管，這正常
- Groq 429 → 等 60 秒讓 TPM bucket 恢復後再試
- 任何錯誤 → 看 `cat results/YYYY-MM-DD.json` 的 `error` 欄位

### Step 4 — 解釋結果
**幫使用者讀 `results/latest.json`**：
- `rounds.round3.final_picks` 是最終建議
- `rounds.round3.owner_message` 是給使用者的早安訊息
- copy_writer 模式下 `ready_to_post` 是「直接複製貼上」版

不要丟 raw JSON 給使用者看，**翻成人話**。

---

## 情境 2：「我今天想討論 ___」

當使用者說「我想討論 X」「幫我想 Y」「我在猶豫 Z」這類具體問題，你要：

### Step 1 — 確認三件事（一次問完，不要連續追問）
1. **這次的決策是什麼？**（如果他講得不夠具體再追問）
2. **有沒有背景資料 / 已知的選項 / 紅線**？（沒有也 OK，他可能就是想要你開腦洞）
3. **想要哪種辯論模式**？給三個簡述讓他選：
   - 共識型（廣撒網提案、收斂出最佳解）— 適合「我不知道有哪些選項」
   - 對抗型（一方提案、一方專挑翻車情境）— 適合「我已經有方向但怕踩雷」
   - 文案職人型（直接寫完整貼文）— 適合「我要寫 IG/Threads/blog」

### Step 2 — 建一份臨時 config
用 Write 工具建 `config/runs/YYYY-MM-DD-HHMM.json`，繼承 default.json 的所有欄位但覆蓋：
- `current_focus`：填使用者今天的具體背景
- `debate_mode`：他選的模式
- 其他欄位（owner, brand_voice, recent_hits...）保留 default.json 的設定（除非他明顯不是 Linda 本人，那就改成他的人設）

### Step 3 — 跑
```bash
CONFIG_PATH=config/runs/YYYY-MM-DD-HHMM.json npm run debate
```

### Step 4 — 翻譯結果給使用者，問他要不要：
- 換個辯論模式再跑一次
- 改 `current_focus` 細節再跑
- 把結果存進 Obsidian / Notion / 任何他用的工具

---

## 情境 3：客製化每日 IG 主題（重度使用者）

當使用者說「幫我改 brand voice」「我最近爆款是 X 你幫我加進去」「expansion zones 多加一條」這類話，**直接編輯 `config/default.json`**。

關鍵欄位（看 README 的「System prompt 吃哪些 input」section 完整版）：
- `recent_hits` — 加進去他最新爆款，模型會學文案 DNA
- `avoid_topics` — 加進去他不想碰的領域
- `expansion_zones` — 加他想開拓的方向
- `brand_voice` — 改成他想要的語氣（小心：這個改一點點影響很大）
- `models` — 換模型（會用就放手換，不會就別動）

改完跑 `npm run debate` 驗證，再 commit。

---

## 情境 4：故障排除

| 症狀 | 處理 |
|---|---|
| `Missing env var: GROQ_API_KEY` | `.env` 還沒設，回到情境 1 step 2 |
| `nvidia timeout` 後切備胎 | 正常，NVIDIA 不穩 fallback 會接 |
| `Groq HTTP 429` | TPM bucket 滿，等 60 秒再試 |
| `Cannot parse JSON` | 模型吐壞了，重跑通常就好；常重複 → 換模型 |
| 結果 `success: false` | 看 `error` 欄位，照訊息處理 |
| 出來的主題重複舊主題 | 加進 `recent_hits` 並強化 `diversity_mandate` |

---

## 你的個性

- **動手快於問**。能查的查、能跑的跑，不要把 onboarding 變問卷
- **翻人話**。不要丟 JSON / 程式碼給使用者，幫他讀出來
- **守安全**。API key 用 Edit 寫檔，不要在訊息或 log 顯示
- **不過度承諾**。模型有時會跑爛、會選爛主題，誠實講「這次選的可能不夠好，要不要再跑一次／換模式」

---

## 給你看的 repo 結構

```
night-worker/
├── README.md                # 給人讀的說明
├── CLAUDE.md                # 你正在讀這個
├── .env.example             # API key 範本
├── package.json             # npm scripts
├── config/
│   ├── default.json         # 預設（共識型辯論）
│   ├── copy-writer.json     # 寫貼文模式
│   └── all-nvidia.json      # NVIDIA only 備案
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

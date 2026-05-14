# 🌙 夜間打工仔

**你睡覺的時候，3 個 AI 模型互相辯論你明天該發什麼 IG 主題。早上起來看 3 個已經吵完的最終結果。**

完全免費（每月 $0）、不用信用卡、零工程背景也能設定（5 分鐘）。

---

## 這是什麼

每天凌晨 02:00，GitHub Actions 自動觸發：

1. **Round 1（提案）**：Llama 3.3 70B 提案 5 個明日 IG 主題 + 自評分
2. **Round 2（評論）**：Kimi K2.6 給每個提案打分、挑出 top 3、給修改建議
3. **Round 3（仲裁）**：GPT-OSS 120B 最終拍板，選出 3 個 + 排出優先順序

結果存進 `results/YYYY-MM-DD.json`，你打開網頁就看得到（GitHub Pages）。

---

## 為什麼免費

| 服務 | 免費額度 | 註冊難度 |
|---|---|---|
| GitHub Actions（public repo） | **無限分鐘** | ✅ Google 登入，0 卡 |
| Groq API（Llama、GPT-OSS） | 30 RPM、14.4K req/天 | ✅ Google 登入，0 卡 |
| NVIDIA Build（Kimi、DeepSeek） | 40 RPM 多模型 | ✅ Email 註冊，0 卡 |
| GitHub Pages | 無限頻寬 | ✅ 內建 |

**每天大概用掉：每家 API 各 10-20 次呼叫，遠在免費 tier 內。**

---

## 5 分鐘設定步驟

### 1. Fork 這個 repo

點右上角「Use this template」→ 建你自己的 repo（公開或私人都行，公開的話 GitHub Actions 跑分鐘無限）。

### 2. 拿兩個 API key

**Groq:**
1. 開 https://console.groq.com/keys
2. Google 登入
3. 點「Create API Key」→ 命名隨意
4. 複製那串 `gsk_...`

**NVIDIA Build:**
1. 開 https://build.nvidia.com
2. 註冊（Email 或 Google）
3. 右上頭像 → Generate Key
4. 複製那串 `nvapi-...`

### 3. 把 key 貼進你 repo 的 Secrets

1. 進你 fork 的 repo
2. Settings → Secrets and variables → Actions
3. 點「New repository secret」
4. 加兩個：
   - Name: `GROQ_API_KEY`，Value: 你的 Groq key
   - Name: `NVIDIA_API_KEY`，Value: 你的 NVIDIA key

> **隱私保證**：GitHub Secrets 是加密儲存的，連你自己加完都看不到原值。Workflow logs 也會自動把 key redact 成 `***`。

### 4. 改 config 成你的人設

編輯 `config/default.json`：

```json
{
  "owner": "你的名字",
  "topic_context": "簡述你的領域與目標受眾",
  "audience": "你的目標受眾是誰",
  "brand_voice": "你想要的語氣風格",
  "avoid_topics": ["不想碰的主題1", "不想碰的主題2"],
  "preferred_hook_types": ["你偏好的 hook 風格1", "風格2"]
}
```

範例已經寫在預設 config 裡，照樣子改就好。**這個檔愈寫得具體，模型輸出愈精準。**

### 5. 第一次手動觸發測試

1. 進 Actions 分頁
2. 左邊點「🌙 Nightly Debate」
3. 右上「Run workflow」→ 確認 → 跑
4. 等 1-3 分鐘看綠勾
5. 進 `results/` 資料夾應該看到今天的 JSON

### 6. （可選）開 GitHub Pages 看美化結果

1. Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` / Folder: `/docs`
4. 等 1 分鐘，網址會在上方顯示

之後每天打開那個網址就看得到當天的 brainstorm 結果。

### 7. 自動排程已設定好

不用做任何事。每天 UTC 18:00（台北凌晨 02:00）自動跑一次。

---

## 怎麼看結果

### 方法 A：GitHub Pages（推薦）
打開你的 Pages 網址（譬如 `https://yourname.github.io/night-worker/`），自動顯示最新結果，卡片式設計、可看完整辯論紀錄。

### 方法 B：直接在 repo 看 JSON
`results/YYYY-MM-DD.json`，原始資料、適合 debug 或自己加工。

### 方法 C：拉去別的工具
寫個 script 把 `results/latest.json` 跟你的 IG 排程工具串接、發 LINE 通知自己⋯⋯隨你發揮。

---

## 自訂

### 想換模型？

編輯 `config/default.json` 的 `models` 區塊。可用選項：

**Groq（provider: `groq`）：**
- `llama-3.3-70b-versatile`
- `openai/gpt-oss-120b`
- `meta-llama/llama-4-scout-17b-16e-instruct`
- `qwen/qwen3-32b`

**NVIDIA（provider: `nvidia`）：**
- `moonshotai/kimi-k2.6`
- `deepseek-ai/deepseek-v4-pro`
- `z-ai/glm-5.1`
- `nvidia/nemotron-3-super-120b-a12b`

完整清單去 [build.nvidia.com](https://build.nvidia.com) 跟 [console.groq.com/docs/models](https://console.groq.com/docs/models) 看。

### 想換時間？

編輯 `.github/workflows/nightly-debate.yml` 的 `cron:` 那一行。格式是 UTC，譬如：
- `'0 18 * * *'` = 台北凌晨 02:00（預設）
- `'0 22 * * *'` = 台北早上 06:00
- `'0 10 * * *'` = 台北晚上 18:00

### 想加 web search、即時 chat？

這版（v1）刻意不做，理由：
- **Web search 有 prompt injection 風險**（模型讀到網頁上藏的指令會誤執行）。要做也要先設計安全層，避免你的「夜間助手」被某網站的隱藏指令劫持
- **即時 chat 需要藏 API key**，但 GitHub Pages 是純靜態，沒辦法當 proxy。要嘛朋友自己帶 key（限制只能用 Groq），要嘛自己另外架 Cloudflare Worker

這兩個之後版本會考慮。

---

## 常見問題

### 我會被收費嗎？
**不會**。所有用到的服務都免費 tier，且這個工具的用量非常低（每天 ~30 次 API 呼叫）。

### 朋友看得到我的辯論結果嗎？
- **公開 repo**：是，任何人都看得到你的 `results/` 跟 `config/`
- **私人 repo**：只有你看得到

不想公開可以選私人 repo（GitHub Actions 私人 repo 每月 2000 分鐘免費，這工具一次跑 1-3 分鐘，**月用 60-90 分鐘**，完全在範圍內）。

### 我的 API key 會被人偷嗎？
不會。GitHub Secrets 是加密儲存的，連你自己都讀不出原值。Workflow logs 也會自動 redact 成 `***`。只有兩個風險：
1. 你的 GitHub 帳號被駭（你自己保護好 2FA）
2. 別人有你 repo 的 write 權限，能修改 workflow（如果是 public template fork，**fork 不會帶 secrets 過去**）

### 模型亂選怎麼辦？
編輯 `config/default.json`，把 `avoid_topics` 寫具體一點，譬如 `["AI 不會取代你的廢話", "Notion 模板推薦", "ChatGPT prompt 大全"]`，模型會避開。

### 我想要每天 3 個主題改成每天 5 個？
編輯 `scripts/debate.mjs` 的提案輪 prompt（「提案 5 個」改成「提案 N 個」），跟仲裁輪的選擇邏輯。

### 為什麼有時候跑失敗？
通常是：
1. 上游 AI 商今天慢/掛（NVIDIA 免費 tier 偶爾不穩，Groq 比較穩）
2. 你 API key 配額用完了（每分鐘 RPM 上限）
3. 模型回的 JSON 格式跑掉（提高 maxTokens 或換更新版模型）

進 Actions 分頁看具體錯誤訊息。

---

## 進階：自己加東西

`scripts/debate.mjs` 是純 Node.js ES module，沒有任何 framework 依賴。想加什麼自己改。

幾個方向：
- **多輪迭代**：不滿意 round 3 → 再叫 round 4 給更嚴格的標準
- **主題分類**：除了 IG 主題，加「電子報主題」「YouTube 標題」⋯⋯
- **個案敘事生成**：第一輪挑主題，第二輪直接寫第一段
- **競品分析**：fetch 競品的近期貼文（要加 web search + 安全層）

---

## 這個工具不適合誰

- 想要「免費 ChatGPT 替代品」的人 → 用 [ChatGPT Next Web](https://github.com/Yidadaa/ChatGPT-Next-Web)
- 想要即時跟 AI 聊天 → 用 [Claude.ai](https://claude.ai) 或 [Groq 官方介面](https://groq.com)
- 不想設定任何東西 → 這工具最少要 5 分鐘設定

---

## 授權

MIT。隨便用、隨便改、隨便分享。

如果你 fork 後改得很好，歡迎發 PR 回主 repo，或自己也分享給朋友。

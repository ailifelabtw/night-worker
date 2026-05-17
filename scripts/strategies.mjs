// 辯論策略集合。每個策略都是 round1/round2/round3 三個函式，
// 接收 { config, context, previousRounds } 回傳 { system, user, jsonMode, maxTokens }。
// 把所有 prompt 工程集中在這裡，方便對照不同模式。

const RUBRIC = `打分標準（嚴格遵守，分數通膨會被人類發現）：
- 9-10：史詩級
- 8-9：很好
- 7-8：還行
- 6-7：普通
- 5 以下：別做

評分維度（重要！動態）：
- 如果 config 的 current_focus / rules 給了具體判斷標準 → 從規則裡萃取 3-5 個可打分維度
- 沒給 → 你自己依任務類型挑 3-5 個適合維度：
  - 寫貼文／文案 → hook 強度 / brand_fit / novelty / engagement
  - 改履歷 → 相關性 / 突顯亮點 / 誠實度 / 可信度
  - 感情／兩難 → 自我尊重 / 長期幸福 / 可逆性 / 對他人影響 / 直覺強度
  - ABC 方案 → 可行性 / 成本效益 / 風險 / 跟目標契合度
  - email／提案開場 → 收件人接受度 / 清晰度 / 行動力觸發

每個維度 1-10，total = 平均（最高 10）。
R2 / R3 必須沿用 R1 選出的 scoring_dimensions，不要換維度。`;

// ---------------------------------------------------------------
// 策略 1：consensus（共識型，預設）
//   R1 提案 → R2 評論挑 top 3 + 改寫 → R3 仲裁出最終 3 個
// ---------------------------------------------------------------
const consensus = {
  name: 'consensus',
  description: '共識型：提案 → 評論挑選 → 仲裁。預設模式，廣撒網收斂',
  round1: ({ context }) => ({
    system: `你是創意 IG 內容策略師。${context}

你的工作：提案 5 個明日可發的 IG 貼文主題，每個都附完整評分。

**多樣性硬規定（不遵守就是失敗）**：
- 5 個提案中最多 3 個是 AI 工具實測類
- 其餘 2 個必須從 expansion_zones 挑
- novelty 分數：跟最近爆款主題相似度高 → 6 分以下；真正開拓新領域 → 9 分以上

${RUBRIC}

輸出嚴格 JSON：
{
  "proposals": [
    {
      "id": 1,
      "zone": "ai-tools" 或 "expansion",
      "topic": "主題標題（10-25 字）",
      "hook": "第一行 hook（30 字內）",
      "angle": "切入角度的 1 句解釋",
      "scores": {"<維度 1>": 數字, "<維度 2>": 數字, "<維度 3>": 數字, "<維度 4>": 數字},
      "total": 數字
    }
  ]
}

不要解釋、不要 markdown 程式碼框、直接吐 JSON。`,
    user: `請開始提案 5 個明日主題。`,
    jsonMode: true,
    maxTokens: 3000,
  }),

  round2: ({ context, previousRounds }) => ({
    system: `你是冷酷的內容分析師。你會看到另一個模型的 5 個主題提案，你的工作：

1. 沿用 Round 1 選定的 scoring_dimensions 給每個提案打分（你可能比原模型嚴格）
2. 從 5 個裡挑出你覺得最有潛力的 3 個
3. 對被挑中的 3 個，給具體修改建議

${context}

${RUBRIC}

輸出 JSON：
{
  "my_scores_for_all": [{"id": 1, "scores": {...}, "total": X, "comment": "簡短評論"}],
  "top_3_ids": [數字, 數字, 數字],
  "revisions": [
    {
      "original_id": 數字,
      "revised_topic": "改寫後的主題",
      "revised_hook": "改寫後 hook",
      "what_changed": "改了什麼、為什麼",
      "new_scores": {...},
      "new_total": 數字
    }
  ]
}`,
    user: `這是上一輪的提案：\n\n${JSON.stringify(previousRounds.round1, null, 2)}\n\n請評分、選出 top 3、給修改建議。`,
    jsonMode: true,
    maxTokens: 4000,
  }),

  round3: ({ context, previousRounds }) => ({
    system: `你是資深品牌經理，要拍板明日要發的主題。前面兩個模型已經提案 + 評論修改。

1. 綜合兩輪意見，選出**最終 3 個**主題（從 round1 原版 + round2 修訂版中選）
2. 嚴格評分（不能通膨）
3. 告訴擁有者「為什麼這 3 個」+「明天先發哪一個」

**最終 3 個的多樣性硬規定**：
- 最多 2 個 AI 工具實測類
- 至少 1 個必須來自 expansion_zones
- 上一輪不夠多樣可以推翻，在 owner_message 標明

${context}

${RUBRIC}

輸出 JSON：
{
  "final_picks": [
    {
      "rank": 1,
      "zone": "ai-tools" 或 "expansion",
      "topic": "最終主題",
      "hook": "最終 hook",
      "angle": "切入角度",
      "final_scores": {...},
      "final_total": 數字,
      "why_this": "為什麼選這個（2-3 句）",
      "post_first": true/false
    }
  ],
  "owner_message": "給擁有者的早安訊息（3-5 句總結今晚討論成果，鼓舞但不打雞血）"
}`,
    user: `Round 1 原始提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\nRound 2 評論 + 修改：\n${JSON.stringify(previousRounds.round2, null, 2)}\n\n請仲裁出最終 3 個。`,
    jsonMode: true,
    maxTokens: 3000,
  }),
};

// ---------------------------------------------------------------
// 策略 2：adversarial（對抗型）
//   R1 提案 → R2 專找翻車情境 → R3 仲裁「值得冒險的」 + 「絕對不能發的」
// ---------------------------------------------------------------
const adversarial = {
  name: 'adversarial',
  description: '對抗型：一方提案、一方專挑翻車點、第三方仲裁。適合避免回音室',
  round1: ({ context }) => ({
    system: `你是樂觀的 IG 內容企劃，要 brainstorm 明天可以發的主題。盡情發想，分數可以給高一點，因為等等會有人專門找你問題。

${context}

提案 5 個，每個都要有「為什麼會爆」的樂觀論據。

${RUBRIC}

輸出 JSON：
{
  "proposals": [
    {
      "id": 1,
      "zone": "ai-tools" 或 "expansion",
      "topic": "主題標題",
      "hook": "第一行 hook",
      "angle": "切入角度",
      "why_will_explode": "為什麼預期會爆（2-3 句樂觀論據）",
      "scores": {"<維度 1>": 數字, "<維度 2>": 數字, "<維度 3>": 數字, "<維度 4>": 數字},
      "total": 數字
    }
  ]
}`,
    user: `請提案 5 個會爆的明日主題。`,
    jsonMode: true,
    maxTokens: 3000,
  }),

  round2: ({ context, previousRounds }) => ({
    system: `你是專門找碴的 red team 分析師。上一個模型給了 5 個樂觀提案，你的工作是**對每一個都找出最壞情境**：

1. 翻車風險（會被罵 / 沒人理 / 招來雜訊留言的具體原因）
2. 隱藏的品牌不契合（brand voice 沒看到的破綻）
3. 競品 / 相似 KOL 已經做過、會被覺得抄
4. 給「災難版打分」（沿用 R1 的 scoring_dimensions，每個 1-10，但這次是悲觀視角）

不要客氣，但也不要為反對而反對 — 有些主題真的沒大問題就誠實說。

${context}

輸出 JSON：
{
  "attacks": [
    {
      "id": 數字,
      "risk_summary": "一句話總結最大風險",
      "specific_failure_modes": ["翻車情境 1", "情境 2"],
      "brand_misfit_check": "有沒有偷踩 avoid_topics 或語氣不對",
      "saturation_check": "這個角度有沒有被講爛 / 哪個 KOL 講過",
      "disaster_scores": {"<同 R1 維度>": 數字},
      "disaster_total": 數字,
      "verdict": "salvageable" 或 "kill"
    }
  ]
}`,
    user: `Round 1 的樂觀提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\n對每一個提案找出最壞情境。`,
    jsonMode: true,
    maxTokens: 4000,
  }),

  round3: ({ context, previousRounds }) => ({
    system: `你是冷靜的品牌總監，看完了樂觀派與悲觀派的辯論。你的工作：

1. 選出 3 個「即使有風險也值得發」的主題，每個都標明風險與緩解策略
2. 點名 1 個「絕對不要發」的，講清楚為什麼
3. 給擁有者一段早安訊息

${context}

${RUBRIC}

輸出 JSON：
{
  "final_picks": [
    {
      "rank": 1,
      "topic": "...",
      "hook": "...",
      "angle": "...",
      "main_risk": "從 red team 報告挑出的最大風險",
      "mitigation": "怎麼緩解這個風險（譬如改 hook 角度、加 disclaimer、改 CTA）",
      "final_total": 數字,
      "post_first": true/false
    }
  ],
  "killed": {
    "topic": "...",
    "why_killed": "為什麼這個絕對不能發"
  },
  "owner_message": "早安訊息（3-5 句）"
}`,
    user: `樂觀提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\n紅隊報告：\n${JSON.stringify(previousRounds.round2, null, 2)}\n\n請仲裁。`,
    jsonMode: true,
    maxTokens: 3000,
  }),
};

// ---------------------------------------------------------------
// 策略 3：audience_simulation（受眾紅隊）
//   R1 提案 → R2 模擬多種受眾留言 → R3 根據反應預測 engagement 排序
// ---------------------------------------------------------------
const audience_simulation = {
  name: 'audience_simulation',
  description: '受眾紅隊：提案 → 模擬 5 種讀者反應 → 用反應預測 engagement',
  round1: ({ context }) => ({
    system: `你是 IG 內容策略師。提案 5 個明日主題。

${context}

${RUBRIC}

輸出 JSON：
{
  "proposals": [
    {"id": 1, "zone": "ai-tools" 或 "expansion", "topic": "...", "hook": "...", "angle": "...", "scores": {...}, "total": 數字}
  ]
}`,
    user: `提案 5 個明日主題。`,
    jsonMode: true,
    maxTokens: 3000,
  }),

  round2: ({ context, previousRounds }) => ({
    system: `你是 IG 受眾模擬器。針對每個提案，**模擬 5 種典型讀者的留言反應**：

1. **同行**（其他 KOL / 內容創作者）：會嫉妒、學習、還是覺得普通？
2. **苦主**（被 avoid_topics 戳到痛點的目標受眾）：會共鳴留言、儲存、私訊？
3. **路人**（演算法推來的陌生人）：滑過、好奇、嫌棄？
4. **競品支持者**（覺得我們的對手比較好的人）：會挑戰、嘲諷、無視？
5. **嫌棄者**（已經看膩你內容的舊粉）：會取消追蹤、檢舉、還是被勾起興趣？

每種讀者給「最可能寫出的留言原句」（10-30 字內）+ 預估有多少比例會這樣反應。

${context}

輸出 JSON：
{
  "audience_reactions": [
    {
      "id": 數字,
      "reactions": [
        {"persona": "同行", "likely_comment": "原句", "percent": 0-100, "energy": "positive" 或 "neutral" 或 "negative"},
        {"persona": "苦主", ...},
        {"persona": "路人", ...},
        {"persona": "競品支持者", ...},
        {"persona": "嫌棄者", ...}
      ],
      "predicted_engagement": {
        "comments_estimate": "預估留言量 - low/mid/high",
        "save_share_estimate": "預估儲存分享 - low/mid/high",
        "follow_unfollow_net": "預估淨追蹤變化 - +/0/-"
      },
      "verdict": "go" 或 "skip"
    }
  ]
}`,
    user: `Round 1 提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\n模擬 5 種受眾對每個的反應。`,
    jsonMode: true,
    maxTokens: 4000,
  }),

  round3: ({ context, previousRounds }) => ({
    system: `你是資料驅動的品牌經理。看完受眾反應模擬，挑 3 個。

選擇邏輯：
- 「苦主」共鳴率高且 energy positive → 優先（這代表會留言、儲存、轉介）
- 「路人」反應 neutral 以上 → 加分（演算法會推更遠）
- 「嫌棄者」會湧入或大量取消追蹤 → 減分
- 整體 verdict 是 "go" 的提案優先

${context}

輸出 JSON：
{
  "final_picks": [
    {
      "rank": 1,
      "topic": "...",
      "hook": "...",
      "key_audience_insight": "從受眾模擬挑出最關鍵那條留言，並解釋為什麼這代表會爆",
      "predicted_winning_audience": "哪一種讀者會最有反應",
      "final_total": 數字,
      "post_first": true/false
    }
  ],
  "owner_message": "早安訊息（含 1 個受眾洞察）"
}`,
    user: `Round 1：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\nRound 2 受眾反應：\n${JSON.stringify(previousRounds.round2, null, 2)}\n\n挑出 3 個。`,
    jsonMode: true,
    maxTokens: 3000,
  }),
};

// ---------------------------------------------------------------
// 策略 4：copy_writer（主題＋文案完整版）★ 這個是「明天 IG 發文」demo 主推
//   R1 提案 3 個主題 + 各寫完整貼文（hook/輪播/CTA/Threads 縮寫/留言關鍵字）
//   R2 評論每個文案的 hook + 節奏 + CTA → 改寫
//   R3 挑 1 個最終版，給「明天 9am 可直接複製貼上」的完整輸出
// ---------------------------------------------------------------
const copy_writer = {
  name: 'copy_writer',
  description: '主題＋文案：提案 3 個含完整貼文 → 改寫文案細節 → 仲裁出明天可直接用的版本',
  round1: ({ context }) => ({
    system: `你是 IG 文案職人，不只提主題、要直接寫完整貼文。提案 3 個明日主題（少而精，不要 5 個），每個都要寫到「明天就能發」的完整度。

${context}

輸出 JSON：
{
  "proposals": [
    {
      "id": 1,
      "zone": "ai-tools" 或 "expansion",
      "topic": "主題標題（10-25 字）",
      "hook": "第一行 hook（30 字內，要符合 preferred_hook_types）",
      "carousel": [
        "第 1 卡：標題卡（hook 強化版）",
        "第 2 卡：痛點 / 反差",
        "第 3 卡：具體 fact / 數字 / 例子",
        "第 4 卡：核心洞察",
        "第 5 卡：行動建議 + CTA tease"
      ],
      "ig_caption": "IG 內文（150-250 字，承接 hook，留 CTA 關鍵字觸發 Sky AI 私訊）",
      "threads_short": "Threads 版本縮寫（80-120 字，可以更直接、更脆弱）",
      "cta_keyword": "留言關鍵字（單一短詞如 LINE / 工具 / 免費）",
      "comment_reply_template": "Sky AI 看到關鍵字後私訊的開場（1-2 句，帶 ailifelab 文章連結）",
      "scores": {"<維度 1>": 數字, "<維度 2>": 數字, "<維度 3>": 數字, "<維度 4>": 數字},
      "total": 數字
    }
  ]
}

不要 markdown、不要解釋、直接吐 JSON。輪播每張至少 25 字（不能寫「短句」當作偷懶）。`,
    user: `請提案 3 個明日主題並寫完整貼文。`,
    jsonMode: true,
    maxTokens: 4500,
  }),

  round2: ({ context, previousRounds }) => ({
    system: `你是冷酷的文案編輯。針對上一輪每個提案，**找出文案的具體缺陷並改寫**：

針對每個提案檢查：
1. **hook 強度**：第一行能不能讓人停手？有沒有踩中 preferred_hook_types 的範例？太抽象就改具體
2. **節奏**：5 卡輪播有沒有節奏感？有沒有第 2 卡就洩漏結論的 anti-pattern？
3. **CTA 自然度**：CTA 關鍵字會不會太硬塞？留言觸發合不合理？
4. **Threads 一致性**：Threads 版有沒有「IG 縮短版」的偷懶感？應該是「同主題、不同語氣」
5. **brand voice**：有沒有踩到禁咒術詞、雞湯、粗口

如果某段沒問題就照原文。但 hook 至少要重寫過。

${context}

輸出 JSON：
{
  "critiques": [
    {
      "id": 數字,
      "hook_critique": "原 hook 的問題（1-2 句）",
      "rhythm_critique": "輪播節奏的問題",
      "cta_critique": "CTA 是否自然",
      "voice_critique": "brand voice 是否踩線",
      "revised": {
        "topic": "...",
        "hook": "更強的 hook",
        "carousel": ["改過的 5 卡"],
        "ig_caption": "改過的 IG 內文",
        "threads_short": "改過的 Threads 版",
        "cta_keyword": "...",
        "comment_reply_template": "..."
      },
      "what_actually_changed": "改了什麼、為什麼",
      "new_scores": {...},
      "new_total": 數字
    }
  ]
}`,
    user: `Round 1 提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\n針對每個提案改寫文案細節。`,
    jsonMode: true,
    maxTokens: 6000,
  }),

  round3: ({ context, previousRounds }) => ({
    system: `你是資深品牌經理 + 主編。前兩輪一個提了 3 個含完整文案的提案、一個改寫過細節。你的工作：

1. **挑 1 個明天主發** + **1 個備胎**（rank 1 跟 rank 2），其餘不要
2. 對主發那個，產出「**ready_to_post**」版本（明天 9am 直接複製貼上不用再改的最終版）
3. 對備胎，列出「保留原因 + 改用時機」
4. 給擁有者早安訊息：今天有什麼洞察、為什麼這個值得發、明天該幾點發、發完該觀察什麼指標

${context}

${RUBRIC}

輸出 JSON：
{
  "final_picks": [
    {
      "rank": 1,
      "post_first": true,
      "topic": "...",
      "ready_to_post": {
        "hook": "...",
        "carousel_slides": ["卡 1 完整文字", "卡 2", "卡 3", "卡 4", "卡 5"],
        "ig_caption": "完整 IG 內文",
        "threads_short": "Threads 版",
        "cta_keyword": "...",
        "comment_reply_template": "Sky AI 私訊範本",
        "suggested_post_time": "建議發文時段（譬如 09:00 / 12:30 / 21:00）+ 1 句理由"
      },
      "final_total": 數字,
      "why_this_wins": "為什麼這個贏（2-3 句）"
    },
    {
      "rank": 2,
      "post_first": false,
      "topic": "...",
      "summary_only": "備胎簡述（不寫完整文案）",
      "when_to_use": "什麼情況改用備胎（譬如主發互動冷、第二天追加）",
      "final_total": 數字
    }
  ],
  "owner_message": "早安訊息：建議的發文時間、發完看什麼指標、為什麼這個值得發",
  "metrics_to_watch": ["發文後 2 小時看什麼指標", "24 小時看什麼", "若觸發 Sky AI 看什麼"]
}`,
    user: `Round 1 提案：\n${JSON.stringify(previousRounds.round1, null, 2)}\n\nRound 2 改寫：\n${JSON.stringify(previousRounds.round2, null, 2)}\n\n挑 1 主發 + 1 備胎，主發給可直接複製貼上的版本。`,
    jsonMode: true,
    maxTokens: 5000,
  }),
};

export const STRATEGIES = {
  consensus,
  adversarial,
  audience_simulation,
  copy_writer,
};

export function getStrategy(mode) {
  const s = STRATEGIES[mode];
  if (!s) {
    const known = Object.keys(STRATEGIES).join(', ');
    throw new Error(`Unknown debate_mode: ${mode}. Known: ${known}`);
  }
  return s;
}

// 三模型辯論主迴圈 - brainstorm 明日 IG 主題

import fs from 'node:fs';
import path from 'node:path';
import { chatCompletion, tryJson } from './providers.mjs';

const CONFIG_PATH = process.env.CONFIG_PATH || 'config/default.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const RUBRIC = `打分標準（嚴格遵守，分數通膨會被人類發現）：
- 9-10：史詩級，預期破過去最佳互動率
- 8-9：很好，預期穩定爆
- 7-8：還行，可發但不會炸
- 6-7：普通，不如不發
- 5 以下：別發

評分維度（每個 1-10）：
1. hook 強度（前 1-2 行能不能讓人停手）
2. 與品牌契合（符合 brand voice + 不踩 avoid_topics）
3. 新穎程度（這個角度有沒有被講爛）
4. 互動潛力（會引發留言、分享、儲存）

total = 4 個維度平均`;

function buildContext(c) {
  let s = `【貼文擁有者背景】
- ${c.owner}
- 領域 / 定位：${c.topic_context}
- 受眾：${c.audience}

【Brand voice（嚴格遵守）】
${c.brand_voice}

【絕對避開】
${(c.avoid_topics || []).map(t => '- ' + t).join('\n')}

【偏好的 hook 類型（附範例）】
${(c.preferred_hook_types || []).map((t, i) => (i + 1) + '. ' + t).join('\n')}`;

  if (Array.isArray(c.recent_hits) && c.recent_hits.length > 0) {
    s += `\n\n【最近實際發過的爆款（學風格但不要重複主題）】
${c.recent_hits.map(h => `- 「${h.title}」\n  Hook: ${h.hook}\n  Why worked: ${h.why_worked}`).join('\n')}`;
  }

  if (Array.isArray(c.topic_categories_track_record) && c.topic_categories_track_record.length > 0) {
    s += `\n\n【主題類別績效紀錄】
${c.topic_categories_track_record.map(t => '- ' + t).join('\n')}`;
  }

  if (c.ideal_post_anatomy) {
    s += `\n\n【理想貼文結構（提案時請對齊）】
${c.ideal_post_anatomy}`;
  }

  return s;
}

const CONTEXT = buildContext(config);

async function round1Propose() {
  console.log(`\n=== Round 1: ${config.models.proposer.label} 提案 ===`);
  const result = await chatCompletion({
    provider: config.models.proposer.provider,
    model: config.models.proposer.id,
    system: `你是創意 IG 內容策略師。${CONTEXT}\n\n你的工作：提案 5 個明日可發的 IG 貼文主題，每個都附完整評分。\n\n${RUBRIC}\n\n輸出嚴格 JSON：\n{\n  "proposals": [\n    {\n      "id": 1,\n      "topic": "主題標題（10-25 字）",\n      "hook": "第一行 hook（30 字內）",\n      "angle": "切入角度的 1 句解釋",\n      "scores": {\n        "hook": 數字,\n        "brand_fit": 數字,\n        "novelty": 數字,\n        "engagement": 數字\n      },\n      "total": 數字\n    }\n  ]\n}\n\n不要解釋、不要加 markdown 程式碼框、直接吐 JSON。`,
    messages: [{ role: 'user', content: `請開始提案 5 個明日主題。` }],
    jsonMode: true,
    maxTokens: 3000,
  });
  const parsed = await tryJson(result.content);
  console.log(`提了 ${parsed.proposals?.length} 個主題`);
  return parsed;
}

async function round2Critique(round1) {
  console.log(`\n=== Round 2: ${config.models.critic.label} 評論 + 修改 ===`);
  const result = await chatCompletion({
    provider: config.models.critic.provider,
    model: config.models.critic.id,
    system: `你是冷酷的內容分析師。你會看到另一個模型的 5 個主題提案，你的工作：\n\n1. 用同樣的 4 維度給每個提案打分（你可能比原模型嚴格）\n2. 從 5 個裡挑出你覺得最有潛力的 3 個\n3. 對被挑中的 3 個，給具體修改建議（讓 hook 更強、avoid 更明顯的踩雷）\n\n${CONTEXT}\n\n${RUBRIC}\n\n輸出 JSON：\n{\n  "my_scores_for_all": [\n    {"id": 1, "scores": {...}, "total": X, "comment": "簡短評論"}\n  ],\n  "top_3_ids": [數字, 數字, 數字],\n  "revisions": [\n    {\n      "original_id": 數字,\n      "revised_topic": "改寫後的主題",\n      "revised_hook": "改寫後 hook",\n      "what_changed": "改了什麼、為什麼",\n      "new_scores": {...},\n      "new_total": 數字\n    }\n  ]\n}`,
    messages: [{
      role: 'user',
      content: `這是上一輪的提案：\n\n${JSON.stringify(round1, null, 2)}\n\n請進行評分、選出 top 3、給修改建議。`
    }],
    jsonMode: true,
    maxTokens: 4000,
  });
  const parsed = await tryJson(result.content);
  console.log(`挑出 top 3：${parsed.top_3_ids?.join(', ')}`);
  return parsed;
}

async function round3Finalize(round1, round2) {
  console.log(`\n=== Round 3: ${config.models.finalizer.label} 仲裁 ===`);
  const result = await chatCompletion({
    provider: config.models.finalizer.provider,
    model: config.models.finalizer.id,
    system: `你是資深品牌經理，要拍板明日要發的主題。前面兩個模型已經提案 + 評論修改，你的工作：\n\n1. 綜合兩輪意見，選出**最終 3 個**主題（從 round1 原版 + round2 修訂版中選）\n2. 每個給最終評分（不能再分數通膨，要嚴格）\n3. 告訴擁有者「為什麼這 3 個」+ 「明天先發哪一個」\n\n${CONTEXT}\n\n${RUBRIC}\n\n輸出 JSON：\n{\n  "final_picks": [\n    {\n      "rank": 1,\n      "topic": "最終主題",\n      "hook": "最終 hook",\n      "angle": "切入角度",\n      "final_scores": {...},\n      "final_total": 數字,\n      "why_this": "為什麼選這個（2-3 句）",\n      "post_first": true/false\n    }\n  ],\n  "owner_message": "給擁有者的早安訊息（3-5 句總結今晚討論成果，鼓舞但不打雞血）"\n}`,
    messages: [{
      role: 'user',
      content: `Round 1 原始提案：\n${JSON.stringify(round1, null, 2)}\n\nRound 2 評論 + 修改：\n${JSON.stringify(round2, null, 2)}\n\n請仲裁出最終 3 個。`
    }],
    jsonMode: true,
    maxTokens: 3000,
  });
  const parsed = await tryJson(result.content);
  console.log(`最終選出 ${parsed.final_picks?.length} 個`);
  return parsed;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`🌙 夜間打工仔 - 開工時間 ${startedAt}`);

  const results = {
    date: new Date().toISOString().slice(0, 10),
    started_at: startedAt,
    config_snapshot: {
      topic_context: config.topic_context,
      models: config.models,
    },
    rounds: {},
    error: null,
  };

  try {
    results.rounds.round1 = await round1Propose();
    results.rounds.round2 = await round2Critique(results.rounds.round1);
    results.rounds.round3 = await round3Finalize(
      results.rounds.round1,
      results.rounds.round2
    );
    results.success = true;
  } catch (e) {
    console.error('辯論失敗：', e.message);
    results.error = e.message;
    results.success = false;
  }

  results.finished_at = new Date().toISOString();
  results.duration_seconds = Math.round(
    (new Date(results.finished_at) - new Date(results.started_at)) / 1000
  );

  // 儲存結果
  const outPath = `results/${results.date}.json`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ 寫入 ${outPath} (耗時 ${results.duration_seconds}s)`);

  // 更新 latest.json 作為 UI 預設讀取
  fs.writeFileSync('results/latest.json', JSON.stringify(results, null, 2));

  if (!results.success) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

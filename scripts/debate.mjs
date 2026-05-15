// 三模型辯論主迴圈 - brainstorm 明日 IG 主題
// 支援多種辯論策略，由 config.debate_mode 切換（見 scripts/strategies.mjs）

import fs from 'node:fs';
import path from 'node:path';
import { chatCompletion, tryJson } from './providers.mjs';
import { getStrategy } from './strategies.mjs';

const CONFIG_PATH = process.env.CONFIG_PATH || 'config/default.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

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
    s += `\n\n【最近實際發過的爆款（學「文案 DNA」但這些主題已經做過了，要超越不要複製）】
${c.recent_hits.map(h => `- 「${h.title}」\n  Hook: ${h.hook}\n  Why worked: ${h.why_worked}`).join('\n')}`;
  }

  if (Array.isArray(c.topic_categories_track_record) && c.topic_categories_track_record.length > 0) {
    s += `\n\n【主題類別績效紀錄】
${c.topic_categories_track_record.map(t => '- ' + t).join('\n')}`;
  }

  if (Array.isArray(c.expansion_zones) && c.expansion_zones.length > 0) {
    s += `\n\n【⚠️ 重要：擴展領域（最近沒做但今天要主動探索）】
${c.expansion_zones.map((t, i) => (i + 1) + '. ' + t).join('\n')}`;
  }

  if (c.diversity_mandate) {
    s += `\n\n【多樣性硬規定】\n${c.diversity_mandate}`;
  }

  if (c.ideal_post_anatomy) {
    s += `\n\n【理想貼文結構（提案時請對齊）】\n${c.ideal_post_anatomy}`;
  }

  if (c.current_focus) {
    s += `\n\n【今天的特殊背景／焦點（重要，會影響主題選擇）】\n${c.current_focus}`;
  }

  if (Array.isArray(c.cta_keyword_options) && c.cta_keyword_options.length > 0) {
    s += `\n\n【可選的 CTA 關鍵字（從中選 1 個短詞用於留言觸發）】
${c.cta_keyword_options.map(k => '- ' + k).join('\n')}`;
  }

  if (c.platform_constraints) {
    s += `\n\n【平台限制 / 格式要求】\n${c.platform_constraints}`;
  }

  return s;
}

const CONTEXT = buildContext(config);
const MODE = config.debate_mode || 'consensus';
const STRATEGY = getStrategy(MODE);
const INTER_ROUND_DELAY_MS = Number(process.env.INTER_ROUND_DELAY_MS ?? config.inter_round_delay_ms ?? 15000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callWithFallback(model, args) {
  // 支援 fallback chain：先試 primary，失敗依序試 fallbacks[0..n]
  const chain = [model, ...(Array.isArray(model.fallbacks) ? model.fallbacks : []), ...(model.fallback ? [model.fallback] : [])];
  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    try {
      if (i > 0) {
        console.log(`  ⚠ 切換備胎 ${i}/${chain.length - 1}：${m.label}`);
      }
      return await chatCompletion({ provider: m.provider, model: m.id, ...args });
    } catch (e) {
      lastErr = e;
      const isLast = i === chain.length - 1;
      console.log(`  ${isLast ? '❌' : '⚠'} ${m.label} 失敗：${e.message?.slice(0, 80)}`);
      if (isLast) throw e;
    }
  }
  throw lastErr;
}

async function runRound(roundKey, modelKey, previousRounds) {
  const model = config.models[modelKey];
  if (!model) throw new Error(`Missing config.models.${modelKey}`);
  const builder = STRATEGY[roundKey];
  if (!builder) throw new Error(`Strategy "${MODE}" missing ${roundKey}`);

  console.log(`\n=== ${roundKey}: ${model.label} (${MODE}) ===`);
  const { system, user, jsonMode = true, maxTokens = 3000 } = builder({
    config,
    context: CONTEXT,
    previousRounds,
  });

  const result = await callWithFallback(model, {
    system,
    messages: [{ role: 'user', content: user }],
    jsonMode,
    maxTokens,
  });

  const parsed = await tryJson(result.content);
  return parsed;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`🌙 夜間打工仔 - 開工 ${startedAt}`);
  console.log(`策略模式：${MODE}（${STRATEGY.description}）`);

  const results = {
    date: new Date().toISOString().slice(0, 10),
    started_at: startedAt,
    config_snapshot: {
      debate_mode: MODE,
      strategy_description: STRATEGY.description,
      topic_context: config.topic_context,
      models: config.models,
      current_focus: config.current_focus || null,
    },
    rounds: {},
    error: null,
  };

  try {
    results.rounds.round1 = await runRound('round1', 'proposer', { });
    if (INTER_ROUND_DELAY_MS > 0) {
      console.log(`  …等 ${INTER_ROUND_DELAY_MS / 1000}s 讓 TPM bucket 喘口氣`);
      await sleep(INTER_ROUND_DELAY_MS);
    }
    results.rounds.round2 = await runRound('round2', 'critic', { round1: results.rounds.round1 });
    if (INTER_ROUND_DELAY_MS > 0) {
      console.log(`  …等 ${INTER_ROUND_DELAY_MS / 1000}s 讓 TPM bucket 喘口氣`);
      await sleep(INTER_ROUND_DELAY_MS);
    }
    results.rounds.round3 = await runRound('round3', 'finalizer', {
      round1: results.rounds.round1,
      round2: results.rounds.round2,
    });
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

  const outPath = `results/${results.date}.json`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ 寫入 ${outPath} (耗時 ${results.duration_seconds}s)`);

  fs.writeFileSync('results/latest.json', JSON.stringify(results, null, 2));

  if (!results.success) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

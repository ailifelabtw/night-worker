// 夜間智囊團 preview backend
// 部署：cd worker && npx wrangler deploy
// 設 secret：npx wrangler secret put GROQ_API_KEY (再來一次設 NVIDIA_API_KEY)

const ENDPOINTS = {
  groq:   'https://api.groq.com/openai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // /api/chat 是唯一 API endpoint，其它路徑交給 [assets] 靜態檔處理
    if (url.pathname !== '/api/chat') {
      // assets binding 會自動處理 / → public/index.html
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('not found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return jsonResp({ error: 'use POST' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ error: 'invalid JSON body' }, 400);
    }

    const { provider, model, system, messages, jsonMode, maxTokens, timeoutMs } = body;
    const endpoint = ENDPOINTS[provider];
    if (!endpoint) return jsonResp({ error: `unknown provider: ${provider}` }, 400);

    const apiKey = provider === 'groq' ? env.GROQ_API_KEY : env.NVIDIA_API_KEY;
    if (!apiKey) {
      return jsonResp({
        error: `Server missing ${provider.toUpperCase()}_API_KEY secret. 部署時請跑：npx wrangler secret put ${provider.toUpperCase()}_API_KEY`,
      }, 500);
    }

    const finalMessages = system
      ? [{ role: 'system', content: system }, ...(messages || [])]
      : (messages || []);

    const upstreamBody = {
      model,
      messages: finalMessages,
      max_tokens: maxTokens || 2000,
    };
    if (jsonMode) upstreamBody.response_format = { type: 'json_object' };

    // 預設 60s timeout，slow model（譬如 DeepSeek）可在 body 傳 timeoutMs 拉長
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs || 60000, 90000));

    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(upstreamBody),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e.name === 'AbortError' ? `${provider} timeout` : `${provider} fetch failed: ${e.message}`;
      return jsonResp({ error: msg }, 504);
    }
    clearTimeout(timer);

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};

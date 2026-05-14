// AI provider 抽象層 - 統一介面打 Groq / NVIDIA / 任何 OpenAI 相容 endpoint

const ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

const KEYS = {
  groq: 'GROQ_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const TIMEOUT_MS = 120000; // 120 秒
const MAX_RETRIES = 3;

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function chatCompletion({ provider, model, system, messages, jsonMode = false, maxTokens = 2000 }) {
  const url = ENDPOINTS[provider];
  const keyName = KEYS[provider];
  const apiKey = process.env[keyName];

  if (!url) throw new Error(`Unknown provider: ${provider}`);
  if (!apiKey) throw new Error(`Missing env var: ${keyName}`);

  const finalMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const body = {
    model,
    messages: finalMessages,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const t0 = Date.now();
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      // Retry only on transient errors
      if (!res.ok) {
        const t = await res.text();
        const transient = [502, 503, 504, 524, 429].includes(res.status);
        if (transient && attempt < MAX_RETRIES) {
          console.log(`  [attempt ${attempt}/${MAX_RETRIES}] ${provider} HTTP ${res.status}, retrying...`);
          await new Promise(r => setTimeout(r, 3000 * attempt));
          lastErr = new Error(`${provider} HTTP ${res.status}: ${t.slice(0, 200)}`);
          continue;
        }
        throw new Error(`${provider} HTTP ${res.status}: ${t.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${provider} returned no content`);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  [${provider}/${model}] OK in ${elapsed}s (attempt ${attempt})`);

      return { content, usage: data.usage, raw: data };
    } catch (e) {
      lastErr = e;
      const isAbort = e.name === 'AbortError';
      const isFetchFail = e.message?.includes('fetch failed');
      const retryable = isAbort || isFetchFail || e.message?.includes('ECONN');
      if (retryable && attempt < MAX_RETRIES) {
        console.log(`  [attempt ${attempt}/${MAX_RETRIES}] ${provider} ${isAbort ? 'timeout' : 'fetch fail'}, retrying...`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('Unknown error');
}

export async function tryJson(text) {
  // 容錯解析 - 模型有時會把 JSON 包在 ```json``` 裡
  const cleaned = text
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`Cannot parse JSON: ${text.slice(0, 200)}`);
  }
}

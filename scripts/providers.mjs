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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${provider} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider} returned no content`);

  return {
    content,
    usage: data.usage,
    raw: data,
  };
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
    // 找第一個 { 跟最後一個 }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`Cannot parse JSON: ${text.slice(0, 200)}`);
  }
}

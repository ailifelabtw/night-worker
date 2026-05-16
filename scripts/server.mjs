// 本機 UI server。同樣 /api/chat 介面，但用 .env 的 key 而不是雲端 secret。
// 跑：npm run ui  （等價於 node --env-file=.env scripts/server.mjs）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5174);
const HTML_PATH = path.join(__dirname, '..', 'worker', 'public', 'index.html');

const ENDPOINTS = {
  groq:   'https://api.groq.com/openai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
};

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // GET / HEAD 跟所有其它路徑 → 回 SPA HTML
  if ((req.method === 'GET' || req.method === 'HEAD') && req.url !== '/api/chat') {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf-8');
      return send(res, 200, html, 'text/html; charset=utf-8');
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: '找不到 HTML：' + HTML_PATH }));
    }
  }

  if (req.url !== '/api/chat' || req.method !== 'POST') {
    return send(res, 404, JSON.stringify({ error: 'not found' }));
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return send(res, 400, JSON.stringify({ error: 'invalid JSON body' })); }

  const { provider, model, system, messages, jsonMode, maxTokens } = body;
  const endpoint = ENDPOINTS[provider];
  if (!endpoint) return send(res, 400, JSON.stringify({ error: `unknown provider: ${provider}` }));

  const keyName = provider === 'groq' ? 'GROQ_API_KEY' : 'NVIDIA_API_KEY';
  const apiKey = process.env[keyName];
  if (!apiKey) {
    return send(res, 500, JSON.stringify({
      error: `本機 .env 缺少 ${keyName}。請開 .env 把它填上後重啟 server。`,
    }));
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e.name === 'AbortError' ? `${provider} timeout (60s)` : `${provider} fetch failed: ${e.message}`;
    return send(res, 504, JSON.stringify({ error: msg }));
  }
  clearTimeout(timer);

  const text = await upstream.text();
  return send(res, upstream.status, text);
});

server.listen(PORT, () => {
  console.log(`🌙 夜間智囊團 UI: http://localhost:${PORT}`);
  console.log(`   API endpoint:    http://localhost:${PORT}/api/chat`);
  console.log(`   按 Ctrl+C 結束`);
});

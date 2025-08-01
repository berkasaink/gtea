import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const keyPath = path.resolve('./api_key.json');
const apiKeys = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
let keyIndex = 0;

// ✅ Gunakan model stabil saja
const models = ['openai/gpt-3.5-turbo', 'meta-llama/llama-3.1-70b-instruct'];

function getKey() {
  return apiKeys[keyIndex++ % apiKeys.length];
}

export async function getAIComment(text) {
  // ✅ Escape karakter aneh agar tidak bikin request invalid
  const safePrompt = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/"/g, '\\"');
  const prompt = `Buat komentar singkat, sopan, relevan (1 kalimat) untuk postingan berikut:\n"${safePrompt}"`;

  for (let model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getKey()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          })
        });

        if (res.status === 400) {
          // ✅ Jangan tampilkan error HTTP 400 ke terminal
          return null; 
        }

        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;

      } catch (err) {
        continue;
      }
    }
  }
  return null;
}

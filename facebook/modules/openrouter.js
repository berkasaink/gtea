const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const apiKeysPath = path.join(__dirname, '../api_key.json');
const apiKeys = fs.existsSync(apiKeysPath) ? JSON.parse(fs.readFileSync(apiKeysPath)) : [];
let keyIndex = 0;

const MODELS = [
  'google/gemini-pro',
  'meta-llama/llama-3.1-70b-instruct',
  'mistralai/mistral-7b-instruct'
];
let modelIndex = 0;

function getNextKey() {
  const key = apiKeys[keyIndex];
  keyIndex = (keyIndex + 1) % apiKeys.length;
  return key;
}

function getNextModel() {
  const model = MODELS[modelIndex];
  modelIndex = (modelIndex + 1) % MODELS.length;
  return model;
}

async function getAIComment(postText) {
  const prompt = `Buat komentar singkat, sopan, relevan, dan natural (1 kalimat) untuk postingan berikut:\n"${postText}"`;

  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    const key = getNextKey();
    const model = getNextModel();

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 80
        })
      });

      if (!res.ok) {
        console.log(`⚠️ [AI] HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();

      if (reply && reply.length > 5) {
        console.log(`💬 Komentar AI: ${reply}`);
        return reply;
      }

      console.log('⚠️ [AI] Response kosong');
    } catch (err) {
      console.log(`❌ [AI] Gagal koneksi: ${err.message}`);
    }
  }

  return null;
}

module.exports = { getAIComment };

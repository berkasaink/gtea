const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const API_FILE = path.resolve(__dirname, '../api_key.json');

// ✅ Baca semua API Key
let apiKeys = [];
try {
  apiKeys = JSON.parse(fs.readFileSync(API_FILE, 'utf8')).filter(k => k.startsWith('sk-or-v1'));
} catch (err) {
  console.error('❌ Tidak bisa membaca api_key.json:', err.message);
}

// ✅ Daftar Model OpenRouter untuk fallback
const MODELS = [
  'openai/gpt-3.5-turbo',
  'openai/gpt-4o-mini',
  'google/gemini-pro',
  'meta-llama/llama-3.1-70b-instruct',
  'anthropic/claude-3-haiku'
];

let keyIndex = 0;
let modelIndex = 0;

function getKey() {
  if (apiKeys.length === 0) throw new Error('API Key OpenRouter tidak ditemukan!');
  const key = apiKeys[keyIndex % apiKeys.length];
  keyIndex++;
  return key;
}

function getModel() {
  const model = MODELS[modelIndex % MODELS.length];
  modelIndex++;
  return model;
}

// ✅ Fungsi Generate Komentar AI dengan fallback key + model
async function getAIComment(content) {
  const prompt = `Buat komentar singkat, sopan, relevan, dan natural (1 kalimat) untuk postingan berikut:\n"${content}"`;

  for (let attempt = 1; attempt <= apiKeys.length * MODELS.length; attempt++) {
    const key = getKey();
    const model = getModel();
    try {
      console.log(`🔗 [AI] Request (try ${attempt}) → Model: ${model}, Key: ${key.slice(0,10)}...`);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });

      if (!res.ok) {
        console.log(`⚠️ [AI] HTTP ${res.status}: ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      const comment = data?.choices?.[0]?.message?.content?.trim();

      if (comment) {
        console.log(`✅ [AI] Komentar: ${comment}`);
        return comment;
      } else {
        console.log('⚠️ [AI] Response kosong:', JSON.stringify(data));
      }
    } catch (err) {
      console.log(`❌ [AI] Error Request: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 3000)); // jeda sebelum retry
  }

  console.log('❌ [AI] Semua key & model gagal.');
  return null;
}

module.exports = { getAIComment };

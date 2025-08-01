// modules/openrouter.js fix 01
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const API_KEYS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../api_key.json'), 'utf8'));
let keyIndex = 0;

function getNextKey() {
  const key = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  return key;
}

// Fungsi untuk mendapatkan komentar dari OpenRouter
async function getAIComment(postText) {
  try {
    const apiKey = getNextKey();
    const prompt = `Buat komentar singkat, alami, dan tidak spam untuk postingan berikut:\n"${postText}"`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || "👍";
  } catch (err) {
    console.error('[OpenRouter] ERROR:', err.message);
    return "Mantap!";
  }
}

module.exports = { getAIComment };

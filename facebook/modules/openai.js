// modules/openai.js
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keyPath = path.resolve(__dirname, "../api_chatgpt.json");

// === Load API Keys ===
let apiKeys = [];
if (fs.existsSync(keyPath)) {
  try {
    apiKeys = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  } catch {
    console.error("❌ [OpenAI] Gagal membaca api_chatgpt.json");
  }
}
if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
  console.error("❌ [OpenAI] Tidak ada API key valid di api_chatgpt.json");
  process.exit(1);
}

let keyIndex = 0;
const getKey = () => apiKeys[keyIndex % apiKeys.length];

function rotateKey() {
  keyIndex++;
  console.warn(`⚠️ [OpenAI] Rotasi ke API Key berikutnya (${keyIndex + 1}/${apiKeys.length})`);
  return getKey();
}

// === Fungsi Utama untuk Ambil Komentar ===
export async function getAIComment(postText) {
  let attempt = 0;

  while (attempt < apiKeys.length) {
    const key = getKey();

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // ✅ gunakan model OpenAI resmi
          messages: [
            { role: "system", content: "anda bertindak sebagai nama lina, jawab singkat dan tidak menawarkan bantuan, tambah variasi emoticon, tanpa tanda kutip" },
            { role: "user", content: postText.slice(0, 500) }
          ],
          max_tokens: 100
        }),
      });

      if (response.status === 401) {
        console.error("❌ [OpenAI] HTTP 401: API Key invalid!");
        rotateKey();
        attempt++;
        continue;
      }
      if (response.status === 429) {
        console.error("⚠️ [OpenAI] Rate limit, tunggu 5 detik...");
        await new Promise(res => setTimeout(res, 5000));
        rotateKey();
        attempt++;
        continue;
      }

      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || "[AI_ERROR_EMPTY]";

    } catch (err) {
      console.error(`❌ [OpenAI] Request error: ${err.message}`);
      rotateKey();
      attempt++;
    }
  }

  return "[AI_ERROR_401]";
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getAIComment } from '../modules/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_replay.log');

// === Log Aman ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    if (!Array.isArray(logData)) throw new Error('Corrupt log');
  } catch {
    logData = [];
    fs.writeFileSync(logPath, '[]');
  }
} else fs.writeFileSync(logPath, '[]');

function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
function isLogged(id) { return logData.includes(id); }
const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Ambil komentar target dari halaman komentar.
 * Hanya mengambil komentar orang lain yang menyebut user (bukan komentar kita sendiri).
 */
async function getTargetComment(page, userName) {
  // Scroll beberapa kali agar semua komentar termuat
  for (let i = 1; i <= 6; i++) {
    console.log(`🔽 [DEBUG] Scroll komentar (${i}/6)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);
  }

  // Ambil semua komentar di DOM
  const comments = await page.$$eval('div[aria-label="Komentar"] div[dir="auto"] span', spans =>
    spans.map(el => el.innerText).filter(txt => txt && txt.trim())
  );

  if (!comments || comments.length === 0) return null;

  // Cari komentar yang bukan dari user kita
  const target = comments.find(c => !c.includes(userName) && c.length > 5);
  return target || null;
}

export async function autoReplay(page, browser) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });
  await delay(3000);

  const userName = 'Lina'; // Nama akun user untuk filter komentar sendiri
  let success = false;

  for (let scroll = 1; scroll <= 10 && !success; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2500);

    const mentions = await page.$$('a[href*="comment_mention"]');
    if (mentions.length === 0) continue;

    for (const mention of mentions) {
      const url = await page.evaluate(el => el.href, mention);
      const id = crypto.createHash('sha1').update(url).digest('hex');
      if (isLogged(id)) continue;

      console.log(`🎯 Target mention ditemukan: ${url}`);
      await mention.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 });

      // Simpan debug HTML untuk analisa jika gagal membaca
      const debugPath = path.resolve(__dirname, '../logs/debug_replay.html');
      fs.writeFileSync(debugPath, await page.content(), 'utf-8');
      console.log(`✅ Debug komentar disimpan: ${debugPath}`);

      // Ambil teks postingan
      const postText = await page.$eval('div[role="article"]', el => el.innerText.slice(0, 100)).catch(() => '');
      console.log(`📝 Postingan: "${postText}"`);

      // Ambil komentar target
      const targetComment = await getTargetComment(page, userName);
      if (!targetComment) {
        console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
        continue;
      }

      console.log(`💬 Komentar target: "${targetComment}"`);

      // Generate balasan AI
      const reply = await getAIComment(targetComment);
      if (!reply || reply.startsWith('[AI_ERROR]')) {
        console.log('⏭️ AI gagal membuat balasan.');
        continue;
      }
      console.log(`🤖 Balasan AI: ${reply}`);

      // Klik kolom balas komentar
      const replyBox = await page.$('div[contenteditable="true"][data-lexical-editor="true"]');
      if (!replyBox) {
        console.log('❌ Tidak menemukan kolom balas komentar.');
        continue;
      }

      await replyBox.focus();
      await page.keyboard.type(reply, { delay: 80 });
      await delay(1000);
      await page.keyboard.press('Enter');
      await delay(3000);

      console.log('✅ Balasan mention berhasil dikirim.');
      saveLog(id);
      success = true;
      break;
    }
  }

  if (!success) console.log('⚠️ Tidak ada mention yang berhasil dibalas.');
  console.log('✅ Menutup browser...');
  await browser.close();
  process.exit(success ? 0 : 1);
}

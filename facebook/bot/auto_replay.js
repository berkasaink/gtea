// ✅ auto_replay.js Fix 15
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAIComment } from '../modules/openai.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_replay.log');

const delay = ms => new Promise(res => setTimeout(res, ms));

// === Log untuk komentar yang sudah dibalas ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    if (!Array.isArray(logData)) logData = [];
  } catch {
    logData = [];
  }
} else fs.writeFileSync(logPath, '[]');

function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
function isLogged(id) {
  return logData.includes(id);
}

// ✅ Fungsi ambil komentar target (bukan komentar kita)
async function getTargetComment(page, userName) {
  return await page.evaluate((user) => {
    const allComments = Array.from(document.querySelectorAll('div[aria-label="Komentar"] div[dir="auto"]'));
    for (let el of allComments) {
      const text = el.innerText.trim();
      if (text && !text.includes(user)) {
        return text;
      }
    }
    return null;
  }, userName);
}

// ✅ Fungsi Utama Auto Replay
export async function autoReplay(page, browser) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });
  await delay(4000);

  let success = false;
  const userName = 'Lina'; // Sesuaikan dengan nama akun kamu

  // === Scroll Notifikasi Hingga 10x ===
  for (let i = 1; i <= 10 && !success; i++) {
    console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(3000);

    const notifLinks = await page.$$eval('a[href*="comment_id"]', links =>
      links.map(l => l.href)
    );

    for (const link of notifLinks) {
      const notifId = crypto.createHash('sha1').update(link).digest('hex');
      if (isLogged(notifId)) continue;

      console.log(`🎯 Target mention ditemukan: ${link}`);
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(5000);

      // ✅ Scroll komentar agar semua termuat
      for (let s = 1; s <= 6; s++) {
        console.log(`🔽 [DEBUG] Scroll komentar (${s}/6)`);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(2000);
      }

      // ✅ Ambil text komentar orang lain
      const komentarTarget = await getTargetComment(page, userName);
      if (!komentarTarget) {
        console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
        saveLog(notifId);
        continue;
      }

      console.log(`💬 Komentar target: "${komentarTarget}"`);

      // ✅ Generate balasan AI
      const balasan = await getAIComment(`Balas komentar berikut secara sopan sebagai ${userName}:\n"${komentarTarget}"`);
      if (!balasan) {
        console.log('⚠️ Gagal generate balasan AI.');
        continue;
      }
      console.log(`🤖 Balasan AI: ${balasan}`);

      // ✅ Cari kolom balas komentar
      const box = await page.$('div[contenteditable="true"][data-lexical-editor="true"]');
      if (!box) {
        console.log('❌ Kolom balasan tidak ditemukan.');
        continue;
      }

      // ✅ Ketik balasan
      await box.focus();
      await delay(1000);
      await page.keyboard.type(balasan, { delay: 80 });
      await delay(1500);
      await page.keyboard.press('Enter');
      await delay(4000);

      console.log('✅ Balasan mention berhasil dikirim.');
      saveLog(notifId);
      success = true;
      break;
    }
  }

  if (!success) console.log('⚠️ Tidak ada mention yang berhasil dibalas.');
  console.log('✅ Menutup browser...');
  if (browser) await browser.close();
  process.exit(success ? 0 : 1);
}

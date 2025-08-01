import { getAIComment } from '../modules/openrouter.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Lokasi file log khusus auto_komen ===
const logPath = path.resolve(__dirname, '../logs/auto_komen.log');

// ✅ Aman parsing log
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    const raw = fs.readFileSync(logPath, 'utf-8').trim();
    logData = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(logData)) throw new Error('Log bukan array');
  } catch {
    console.warn('⚠️ [LOG] auto_komen.log rusak, reset log.');
    logData = [];
    fs.writeFileSync(logPath, '[]');
  }
} else {
  fs.writeFileSync(logPath, '[]');
}

// === Fungsi log lokal ===
function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
function isLogged(id) { return logData.includes(id); }
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function autoComment(page, browser = null) {
  console.log('[WAIT] Scrolling batch 1...');

  let batch = 1;
  let success = false;

  while (batch <= 10 && !success) {
    const posts = await page.$$('[data-ad-preview="message"]');
    console.log(`🔍 Batch ${batch}: ${posts.length} postingan ditemukan`);

    if (posts.length === 0) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(3000);
      batch++;
      continue;
    }

    for (let i = 0; i < posts.length && !success; i++) {
      const post = posts[i];
      const text = await post.evaluate(el => el.innerText || '');

      if (!text.trim()) {
        console.log(`⏭️ [${batch}-${i + 1}] Tidak ada teks`);
        continue;
      }

      const postId = crypto.createHash('sha1').update(text.slice(0, 120)).digest('hex');
      if (isLogged(postId)) {
        console.log(`⏭️ [${batch}-${i + 1}] Sudah pernah dikomentari`);
        continue;
      }

      console.log(`🎯 [${batch}-${i + 1}] ${text.slice(0, 60).replace(/\n/g, ' ')}...`);

      // ✅ Ambil komentar dari AI
      const comment = await getAIComment(text);
      if (!comment || comment.startsWith('[AI_ERROR_400]')) {  // filter error AI 400
        console.log(`⚠️ [${batch}-${i + 1}] Gagal generate komentar AI`);
        continue;
      }

      console.log(`💬 Komentar AI: ${comment}`);
      await post.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await delay(2500);

      try {
        const clicked = await post.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('div[role="button"] span'))
            .find(b => /oment/i.test(b.innerText));
          if (btn) { btn.click(); return true; }
          return false;
        });

        if (!clicked) {
          console.log(`🔴 [DEBUG] Tombol komentar tidak ditemukan`);
          continue;
        }

        console.log('🟢 [DEBUG] Tombol komentar diklik, tunggu kolom...');
        await delay(4000);

        let box = await page.$('div[contenteditable="true"][data-lexical-editor="true"]');
        if (!box) box = await page.$('div[aria-label="Tulis komentar"]');
        if (!box) box = await page.$('div[contenteditable="true"]');

        if (!box) {
          console.log(`🔴 [DEBUG] Tidak ada kolom komentar ditemukan`);
          continue;
        }

        console.log('🟢 [DEBUG] Kolom komentar ditemukan, mengetik...');
        await box.focus();
        await delay(1000);

        let typed = false;
        for (let t = 0; t < 3; t++) {
          await page.keyboard.type(comment, { delay: 90 });
          await delay(1500);
          const currentText = await page.evaluate(el => el.innerText, box);
          if (currentText.includes(comment.slice(0, 5))) { typed = true; break; }
          console.log('⚠️ [DEBUG] Teks belum masuk, ulangi...');
        }

        if (!typed) {
          console.log(`❌ [${batch}-${i + 1}] Gagal mengetik komentar`);
          continue;
        }

        await page.keyboard.press('Enter');
        await delay(4000);

        console.log(`✅ Komentar berhasil dikirim ke postingan [${batch}-${i + 1}]`);
        saveLog(postId);
        success = true;

        // ✅ Tutup kolom komentar setelah kirim
        await page.keyboard.press('Escape');
        await delay(1000);
        console.log('🔵 [DEBUG] Kolom komentar ditutup.');

      } catch (err) {
        console.log(`❌ [${batch}-${i + 1}] Gagal komentar: ${err.message}`);
      }
    }

    if (!success) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(3500);
      batch++;
    }
  }

  // ✅ Exit behavior hanya jika browser ada
  if (browser) {
    console.log(success ? '✅ Semua komentar selesai. Menutup browser...' : '⚠️ Tidak ada komentar yang terkirim. Menutup browser...');
    await browser.close();
  }
  process.exit(success ? 0 : 1);
}

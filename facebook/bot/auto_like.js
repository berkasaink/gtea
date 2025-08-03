import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_like.log');

// === Log Aman ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    const raw = fs.readFileSync(logPath, 'utf-8').trim();
    logData = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(logData)) throw new Error('Log bukan array');
  } catch {
    console.warn('⚠️ [LOG] auto_like.log rusak, reset log.');
    logData = [];
    fs.writeFileSync(logPath, '[]');
  }
} else {
  fs.writeFileSync(logPath, '[]');
}

function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
function isLogged(id) { return logData.includes(id); }
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function autoLike(page, browser = null) {
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
        console.log(`⏭️ [${batch}-${i + 1}] Sudah pernah di-like`);
        continue;
      }

      console.log(`🎯 [${batch}-${i + 1}] Target Like: ${text.slice(0, 60).replace(/\n/g, ' ')}...`);

      try {
        // ✅ Cari tombol Like dan klik
        const liked = await post.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('div[role="button"] span'))
            .find(b => /Suka|Like/i.test(b.innerText));
          if (btn) { btn.click(); return true; }
          return false;
        });

        if (!liked) {
          console.log(`🔴 [DEBUG] Tombol Like tidak ditemukan`);
          continue;
        }

        console.log(`🟢 [DEBUG] Tombol Like berhasil diklik`);
        saveLog(postId);
        success = true;

        // ✅ Tambahkan waktu tunggu agar aksi Like terlihat di browser
        console.log('[WAIT] Menunggu konfirmasi Like muncul di UI...');
        await delay(5000); // <-- Delay tambahan agar Like terlihat

      } catch (err) {
        console.log(`❌ [${batch}-${i + 1}] Gagal Like: ${err.message}`);
      }
    }

    if (!success) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(3500);
      batch++;
    }
  }

  if (browser) {
    console.log(success ? '✅ Semua like selesai. Menutup browser...' : '⚠️ Tidak ada postingan yang di-like. Menutup browser...');
    await delay(2000); // ✅ Delay sebelum benar-benar menutup browser
    await browser.close();
  }
  process.exit(success ? 0 : 1);
}

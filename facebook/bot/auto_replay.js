import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAIComment } from '../modules/openai.js';

const logPath = path.resolve('./logs/auto_replay.log');

let logData = [];
if (fs.existsSync(logPath)) {
  try {
    logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    if (!Array.isArray(logData)) throw new Error();
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

export async function autoReplay(page, browser) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 0 });

  let found = false;

  for (let scroll = 1; scroll <= 10 && !found; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(3000);

    const notifLinks = await page.$$eval('a[href*="comment_id"][href*="reply_comment_id"]', as =>
      as.map(a => a.href)
    );

    for (const url of notifLinks) {
      const notifId = crypto.createHash('sha1').update(url).digest('hex');
      if (isLogged(notifId)) {
        console.log('⏭️ Sudah dibalas sebelumnya, skip...');
        continue;
      }

      console.log(`🎯 Target mention ditemukan: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(5000);

      // Scroll maksimal untuk memuat semua komentar
      for (let i = 1; i <= 10; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(1200);
      }

      // Ambil nama user login
      const userSelf = await page.$eval('div[aria-label="Akun Anda"] span', el => el.innerText).catch(() => 'ME');

      // === Ambil komentar target dengan 3 metode ===
      let target = null;

      // ✅ 1. Cari komentar yang memiliki highlight (biasanya ada kelas khusus)
      target = await page.$eval('div[aria-label="Komentar"][style*="background"]', el => {
        const name = el.querySelector('h3 a')?.innerText || 'Unknown';
        const text = el.querySelector('span')?.innerText || '';
        return { name, text };
      }).catch(() => null);

      // ✅ 2. Jika gagal, cari link reply_comment_id lalu naik ke parent
      if (!target) {
        target = await page.$eval('a[href*="reply_comment_id"]', el => {
          const parent = el.closest('div[aria-label="Komentar"]');
          if (!parent) return null;
          const name = parent.querySelector('h3 a')?.innerText || 'Unknown';
          const text = parent.querySelector('span')?.innerText || '';
          return { name, text };
        }).catch(() => null);
      }

      // ✅ 3. Fallback: Ambil komentar terakhir di thread
      if (!target) {
        target = await page.$$eval('div[aria-label="Komentar"]', els => {
          if (els.length === 0) return null;
          const el = els[els.length - 1];
          const name = el.querySelector('h3 a')?.innerText || 'Unknown';
          const text = el.querySelector('span')?.innerText || '';
          return { name, text };
        }).catch(() => null);
      }

      if (!target || target.name === 'Unknown' || target.text.length < 3) {
        console.log('⏭️ Komentar target tidak ditemukan.');
        continue;
      }

      if (target.name.includes(userSelf)) {
        console.log(`⏭️ Komentar milik sendiri (${target.name}), skip.`);
        continue;
      }

      console.log(`💬 Komentar oleh "${target.name}": ${target.text}`);

      // Debug
      fs.writeFileSync('./logs/debug_replay.html', await page.content());

      // AI Reply
      const aiReply = await getAIComment(target.text);
      if (!aiReply) {
        console.log('⚠️ Gagal mendapatkan balasan AI.');
        continue;
      }

      console.log(`🤖 Balasan AI: ${aiReply}`);

      // Kolom balasan
      let replyBox = await page.$('div[aria-label="Balas"][contenteditable="true"]')
        || await page.$('div[contenteditable="true"][role="textbox"]');
      if (!replyBox) {
        console.log('❌ Kolom balas tidak ditemukan.');
        continue;
      }

      try {
        await replyBox.focus();
        await page.keyboard.type(aiReply, { delay: 80 });
        await delay(1000);
        await page.keyboard.press('Enter');
        await delay(3000);

        console.log('✅ Balasan berhasil dikirim.');
        saveLog(notifId);
        found = true;
        break;

      } catch (err) {
        console.log(`❌ ERROR saat mengirim balasan: ${err.message}`);
      }
    }
  }

  if (!found) console.log('⚠️ Tidak ada komentar yang berhasil dibalas.');

  console.log('✅ Menutup browser...');
  await browser.close();
}

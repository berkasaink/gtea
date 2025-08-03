import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getAIComment } from '../modules/openai.js';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logPath = path.resolve(__dirname, '../logs/auto_replay.log');
const cookiesPath = path.resolve(__dirname, '../cookies.json');

// === Log aman ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    logData = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim()) || [];
  } catch {
    console.warn('⚠️ [LOG] auto_replay.log rusak, reset log.');
    logData = [];
  }
}
const saveLog = id => {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
};
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(res => setTimeout(res, ms));

// === Jalankan Bot ===
export async function autoReplay() {
  console.log('[WAIT] Membuka browser...');
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // ✅ Load cookies
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
    await page.setCookie(...cookies);
  }

  // ✅ Buka halaman notifikasi Facebook
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });
  console.log('👤 Nama akun login terdeteksi: ME');

  let success = false;
  let batch = 1;

  while (batch <= 10 && !success) {
    console.log(`[WAIT] Scrolling notifikasi... (${batch}/10)`);
    await delay(3000);

    const notifLinks = await page.$$eval('a[href*="comment_id"]', links =>
      links.map(a => ({ url: a.href, text: a.innerText }))
    );

    for (const notif of notifLinks) {
      const mentionUser = (notif.text.match(/([\w\s]+) menyebut anda/) || [])[1] || 'Belum';
      console.log(`🎯 Target mention dari: ${mentionUser}`);
      console.log(`🌐 URL: ${notif.url}`);

      const notifId = crypto.createHash('sha1').update(notif.url).digest('hex');
      if (isLogged(notifId)) {
        console.log('⏭️ Sudah pernah dibalas, skip.');
        continue;
      }

      // ✅ Buka komentar target
      await page.goto(notif.url, { waitUntil: 'networkidle2' });
      await delay(5000);

      // ✅ Dump komentar untuk debug
      const html = await page.content();
      fs.writeFileSync(path.resolve(__dirname, '../logs/comments_dump.html'), html);

      // ✅ Cari komentar terbaru dari user yang mention
      const comments = await page.$$eval('div[aria-label="Komentar"] div[dir="auto"]', els =>
        els.map(e => ({ user: e.closest('[aria-label="Komentar"]').innerText.split('\n')[0], text: e.innerText }))
      );

      if (!comments.length) {
        console.log('⏭️ Tidak ada komentar ditemukan.');
        continue;
      }

      // ✅ Filter komentar milik user yang mention
      const targetComments = comments.filter(c => c.user.includes(mentionUser));
      if (!targetComments.length) {
        console.log('⏭️ Tidak ada komentar dari target user ditemukan.');
        continue;
      }

      // ✅ Ambil komentar terbaru user tersebut
      const latest = targetComments[targetComments.length - 1];
      console.log(`💬 Target: "${latest.text}" oleh ${latest.user}`);

      // ✅ Ambil balasan AI
      const replyText = await getAIComment(latest.text);
      if (!replyText || replyText.startsWith('[AI_ERROR')) {
        console.log('❌ [AI] Gagal generate balasan, skip.');
        continue;
      }
      console.log(`🤖 Balasan AI: ${replyText}`);

      // ✅ Klik tombol balas & ketik
      try {
        const replyBtn = await page.$x("//span[contains(text(),'Balas')]");
        if (replyBtn.length) await replyBtn[replyBtn.length - 1].click();
        await delay(2000);

        const box = await page.$('div[contenteditable="true"]');
        if (!box) throw new Error('Kolom balas tidak ditemukan');

        await box.focus();
        await page.keyboard.type(replyText, { delay: 90 });
        await delay(1000);
        await page.keyboard.press('Enter');
        await delay(3000);

        console.log('✅ Balasan berhasil dikirim.');
        saveLog(notifId);
        success = true;
      } catch (err) {
        console.log(`❌ [ERROR] Gagal membalas: ${err.message}`);
      }
    }

    if (!success) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      batch++;
      await delay(3000);
    }
  }

  console.log(success ? '✅ Semua balasan selesai.' : '⚠️ Tidak ada balasan terkirim.');
  await browser.close();
  process.exit(success ? 0 : 1);
}

// ✅ Auto-run jika dipanggil langsung
if (import.meta.url === `file://${process.argv[1]}`) {
  autoReplay();
}

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWorker } from 'tesseract.js';
import { getAIComment } from '../modules/openai.js';

const logPath = path.resolve('./logs/auto_replay.log');
let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]') : [];
if (!Array.isArray(logData)) logData = [];

const delay = ms => new Promise(res => setTimeout(res, ms));
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); fs.writeFileSync(logPath, JSON.stringify(logData.slice(-1000), null, 2)); } };
const isLogged = id => logData.includes(id);

// ✅ OCR fallback
async function ocrExtractText(page, selector) {
  const el = await page.$(selector);
  if (!el) return '';
  const screenshotPath = './logs/ocr_target.png';
  await el.screenshot({ path: screenshotPath });
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(screenshotPath);
  await worker.terminate();
  return text.trim();
}

export async function autoReplay(page, browser) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 0 });

  // Deteksi nama akun sendiri
  const userSelf = await (async () => {
    try { return await page.$eval('a[aria-label*="Profil"] span', el => el.innerText.trim()); }
    catch { return 'ME'; }
  })();
  console.log(`👤 Nama akun login terdeteksi: ${userSelf}`);

  let found = false;

  for (let scroll = 1; scroll <= 10 && !found; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);

    // Ambil semua notifikasi
    const notifItems = await page.$$eval('div[role="link"], a[href*="comment_id"]', els =>
      els.map(el => ({
        href: el.href || '',
        text: el.innerText || '',
        html: el.innerHTML || ''
      }))
    );

    for (const notif of notifItems) {
      if (!notif.href.includes('comment_id')) continue;

      const notifId = crypto.createHash('sha1').update(notif.href).digest('hex');
      if (isLogged(notifId)) { console.log('⏭️ Sudah dibalas sebelumnya.'); continue; }

      // ✅ Ambil nama mention dari teks notifikasi
      let targetUser = 'Belum';
      const regex1 = notif.text.match(/^(.+?) (menyebut anda|mentioned you|replied)/i);
      if (regex1) targetUser = regex1[1];

      // ✅ Fallback: ambil dari HTML
      if (targetUser === 'Belum') {
        const regex2 = notif.html.match(/>([^<]+)<\/strong>/i);
        if (regex2) targetUser = regex2[1].trim();
      }

      console.log(`🎯 Target mention dari: ${targetUser}`);
      console.log(`🌐 URL: ${notif.href}`);

      await page.goto(notif.href, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(4000);

      // Scroll komentar
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, window.innerHeight)); await delay(1200); }

      fs.writeFileSync('./logs/comments_dump.html', await page.content());
      console.log('📝 Dump HTML komentar ke logs/comments_dump.html');

      // ✅ Ambil semua komentar dari DOM
      const comments = await page.$$eval('div[role="article"]', nodes =>
        nodes.map((n, i) => ({
          idx: i + 1,
          user: (n.querySelector('h3 a, strong a, span a')?.innerText || '').trim(),
          text: (n.querySelector('div[dir="auto"] span')?.innerText || '').trim()
        }))
      );

      if (!comments.length) console.log('❌ DOM komentar kosong, OCR fallback...');

      // ✅ OCR fallback jika komentar gagal terbaca
      if (!comments.length) {
        const ocrText = await ocrExtractText(page, 'body');
        fs.writeFileSync('./logs/comments_ocr.txt', ocrText);
        console.log('📄 OCR Komentar:', ocrText.slice(0, 300));
      }

      // Filter komentar terbaru dari target user
      const targetComments = comments.filter(c => c.user.toLowerCase().includes(targetUser.toLowerCase()));
      if (!targetComments.length) { console.log('⏭️ Tidak ada komentar dari target user ditemukan.'); continue; }

      const lastComment = targetComments[targetComments.length - 1];
      console.log(`💬 Komentar terbaru dari ${lastComment.user}: "${lastComment.text}"`);

      // Klik Balas
      const replyXPath = `(//div[role="article"])[${lastComment.idx}]//span[contains(text(),'Balas')]`;
      const [replyBtn] = await page.$x(replyXPath);
      if (!replyBtn) { console.log('❌ Tombol Balas tidak ditemukan.'); continue; }

      await replyBtn.click();
      console.log('✅ Klik tombol Balas sukses.');
      await delay(1000);

      const replyBox = await page.$('div[contenteditable="true"][role="textbox"]');
      if (!replyBox) { console.log('❌ Kolom input balas tidak muncul.'); continue; }

      const aiReply = await getAIComment(lastComment.text);
      console.log(`🤖 AI Reply: ${aiReply}`);
      await replyBox.focus();
      for (const char of aiReply) await page.keyboard.type(char, { delay: 30 });
      await page.keyboard.press('Enter');
      await delay(1200);

      console.log('✅ Komentar terkirim.');
      saveLog(notifId);
      found = true;
      break;
    }
  }

  if (!found) console.log('[GAGAL] auto_replay tidak menemukan komentar valid.');
  console.log('✅ Menutup browser...');
  await browser.close();
}

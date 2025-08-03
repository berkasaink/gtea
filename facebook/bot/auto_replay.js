import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAIComment } from '../modules/openai.js';

const logPath = path.resolve('./logs/auto_replay.log');
let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]') : [];
if (!Array.isArray(logData)) logData = [];

const delay = ms => new Promise(res => setTimeout(res, ms));
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); fs.writeFileSync(logPath, JSON.stringify(logData.slice(-1000), null, 2)); } };
const isLogged = id => logData.includes(id);

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

    // Ambil semua notifikasi termasuk innerHTML
    const notifLinks = await page.$$eval('a[href*="comment_id"]', as =>
      as.map(a => ({
        href: a.href,
        html: a.innerHTML,
        text: a.innerText.trim()
      }))
    );

    for (const notif of notifLinks) {
      const notifId = crypto.createHash('sha1').update(notif.href).digest('hex');
      if (isLogged(notifId)) { console.log('⏭️ Sudah dibalas sebelumnya.'); continue; }

      // ✅ Ekstrak nama user mention dengan regex
      let targetUser = 'Belum';
      const regexMention = notif.text.match(/^(.+?) (menyebut anda|mentioned you|replied)/i);
      if (regexMention) targetUser = regexMention[1];

      // ✅ Jika gagal, ambil dari innerHTML dengan regex
      if (targetUser === 'Belum') {
        const regexHTML = notif.html.match(/>([^<]+)<\/strong>/i);
        if (regexHTML) targetUser = regexHTML[1].trim();
      }

      console.log(`🎯 Target mention dari: ${targetUser}`);
      console.log(`🌐 URL: ${notif.href}`);

      await page.goto(notif.href, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(5000);

      // Scroll komentar
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, window.innerHeight)); await delay(1500); }

      fs.writeFileSync('./logs/comments_dump.html', await page.content());
      console.log('📝 Dump HTML komentar ke logs/comments_dump.html');

      // Ambil semua komentar
      const comments = await page.$$eval('div[role="article"]', nodes =>
        nodes.map((n, i) => ({
          idx: i + 1,
          user: (n.querySelector('h3 a, strong a, span a')?.innerText || '').trim(),
          text: (n.querySelector('div[dir="auto"] span')?.innerText || '').trim()
        }))
      );

      console.log('📌 Semua komentar terdeteksi:', comments.map(c => `${c.user}: ${c.text}`).slice(-10));

      // Filter komentar dari user mention
      const targetComments = comments.filter(c => c.user && c.text && c.user.toLowerCase().includes(targetUser.toLowerCase()));
      if (!targetComments.length) { console.log('⏭️ Tidak ada komentar dari target user ditemukan.'); continue; }

      // Ambil komentar terbaru
      const lastComment = targetComments[targetComments.length - 1];
      console.log(`💬 Komentar terbaru dari ${lastComment.user}: "${lastComment.text}"`);

      // Klik Balas
      const replyXPath = `(//div[role="article"])[${lastComment.idx}]//span[contains(text(),'Balas')]`;
      const [replyBtn] = await page.$x(replyXPath);
      if (!replyBtn) { console.log('❌ Tombol Balas tidak ditemukan.'); continue; }

      await replyBtn.click();
      console.log('✅ Klik tombol Balas sukses.');
      await delay(1200);

      const replyBox = await page.$('div[contenteditable="true"][role="textbox"]');
      if (!replyBox) { console.log('❌ Kolom input balas tidak muncul.'); continue; }

      const aiReply = await getAIComment(lastComment.text);
      console.log(`🤖 AI Reply: ${aiReply}`);
      await replyBox.focus();
      for (const char of aiReply) await page.keyboard.type(char, { delay: 40 });
      await page.keyboard.press('Enter');
      await delay(1500);

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

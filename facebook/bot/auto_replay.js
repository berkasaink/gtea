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

  const userSelf = await (async () => {
    try {
      return await page.$eval('a[aria-label*="Profil"] span', el => el.innerText.trim());
    } catch { return 'ME'; }
  })();
  console.log(`👤 Nama akun login terdeteksi: ${userSelf}`);

  let found = false;

  for (let scroll = 1; scroll <= 10 && !found; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);

    // Ambil semua link notifikasi yang menuju komentar
    const notifLinks = await page.$$eval('a[href*="comment_id"][href*="reply_comment_id"]', as =>
      as.map(a => ({
        href: a.href,
        user: a.innerText.split(' ')[0] || 'Unknown',
        fullText: a.innerText
      }))
    );

    for (const notif of notifLinks) {
      const notifId = crypto.createHash('sha1').update(notif.href).digest('hex');
      if (isLogged(notifId)) { console.log('⏭️ Sudah dibalas sebelumnya.'); continue; }

      // Ambil nama user dari notifikasi
      let targetUser = notif.user;
      const match = notif.fullText.match(/^(.+?) menyebut anda/);
      if (match) targetUser = match[1];
      console.log(`🎯 Target mention dari: ${targetUser}`);
      console.log(`🌐 URL: ${notif.href}`);

      // Buka halaman komentar
      await page.goto(notif.href, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(4000);

      // Scroll untuk memuat semua komentar
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(1000);
      }

      // Dump HTML untuk debugging
      fs.writeFileSync('./logs/comments_dump.html', await page.content());
      console.log('📝 Dump HTML komentar ke logs/comments_dump.html');

      // Ambil semua komentar di halaman
      const comments = await page.$$eval('div[role="article"], ul li[role="article"]', nodes =>
        nodes.map(n => ({
          user: (n.querySelector('h3 a, strong a, span a')?.innerText || '').trim(),
          text: (n.querySelector('div[dir="auto"] span')?.innerText || '').trim(),
          xpathIndex: Array.from(n.parentNode.children).indexOf(n) + 1 // untuk pilih via XPath
        }))
      );

      // Filter komentar dari target user
      const targetComments = comments.filter(c => c.user.toLowerCase().includes(targetUser.toLowerCase()) && c.text);
      if (!targetComments.length) { console.log('⏭️ Tidak ada komentar dari target user ditemukan.'); continue; }

      // Ambil komentar terbaru (elemen paling akhir)
      const lastComment = targetComments[targetComments.length - 1];
      console.log(`💬 Komentar terbaru dari ${lastComment.user}: "${lastComment.text}"`);

      // Klik tombol Balas pada komentar terbaru
      const replyXPath = `(//div[role="article"])[${lastComment.xpathIndex}]//span[contains(text(),'Balas')]`;
      const [replyBtn] = await page.$x(replyXPath);
      if (!replyBtn) { console.log('❌ Tombol Balas tidak ditemukan.'); continue; }

      await replyBtn.click();
      console.log('✅ Klik tombol Balas sukses.');
      await delay(1500);

      // Ketik balasan
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

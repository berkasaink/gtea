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

  // ✅ Ambil nama akun login
  const userSelf = await (async () => {
    try {
      await page.waitForSelector('a[aria-label*="Profil"] span', { timeout: 5000 });
      return await page.$eval('a[aria-label*="Profil"] span', el => el.innerText.trim());
    } catch { return 'ME'; }
  })();
  console.log(`👤 Nama akun login terdeteksi: ${userSelf}`);

  let found = false;

  for (let scroll = 1; scroll <= 10 && !found; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2000);

    const notifLinks = await page.$$eval('a[href*="comment_id"][href*="reply_comment_id"]', as => as.map(a => a.href));
    for (const url of notifLinks) {
      const notifId = crypto.createHash('sha1').update(url).digest('hex');
      if (isLogged(notifId)) { console.log('⏭️ Sudah dibalas sebelumnya.'); continue; }

      console.log(`🎯 Target mention: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(4000);

      // Scroll agar semua komentar termuat
      for (let i = 0; i < 5; i++) { 
        await page.evaluate(() => window.scrollBy(0, window.innerHeight)); 
        await delay(800); 
      }

      // ✅ Dump seluruh HTML untuk debug
      const html = await page.content();
      fs.writeFileSync('./logs/comments_dump.html', html);
      console.log('📝 Dump HTML komentar ke logs/comments_dump.html');

      // ✅ Ambil komentar dengan selector fallback
      const comments = await page.$$eval('ul li[role="article"], div[role="article"]', nodes =>
        nodes.map(n => ({
          user: (n.querySelector('h3, strong, a span')?.innerText || 'Unknown').trim(),
          text: (n.querySelector('div[dir="auto"] span')?.innerText || '').trim()
        }))
      );

      if (!comments.length) { console.log('⏭️ Tidak ada komentar ditemukan di DOM.'); continue; }

      // ✅ Filter komentar bukan milik akun login
      const target = comments.find(c => c.text.length > 3 && !c.user.includes(userSelf));
      if (!target) { console.log('⏭️ Semua komentar adalah milik sendiri → skip.'); continue; }

      console.log(`💬 Target: "${target.text}" oleh ${target.user}`);

      // ✅ Cari tombol Balas (XPath dinamis)
      const [replyBtn] = await page.$x("//span[contains(text(),'Balas')]");
      if (!replyBtn) { console.log('❌ Tombol Balas tidak ditemukan.'); continue; }

      const box = await replyBtn.boundingBox();
      if (!box) { console.log('❌ boundingBox tombol Balas gagal.'); continue; }

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      console.log('✅ Klik tombol Balas sukses.');
      await delay(1500);

      // ✅ Input balasan
      const replyBox = await page.$('div[contenteditable="true"][role="textbox"]');
      if (!replyBox) { console.log('❌ Kolom input tidak muncul.'); continue; }

      const aiReply = await getAIComment(target.text);
      console.log(`🤖 AI Reply: ${aiReply}`);
      await replyBox.focus();
      for (const char of aiReply) await page.keyboard.type(char, { delay: 40 });
      await page.keyboard.press('Enter');
      await delay(2000);

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

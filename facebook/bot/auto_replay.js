import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getAIComment } from '../modules/openai.js';

const logPath = path.resolve('./logs/auto_replay.log');
const dumpPath = path.resolve('./logs/comments_dump.json');

let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8') || '[]') : [];
if (!Array.isArray(logData)) logData = [];

function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
const delay = ms => new Promise(res => setTimeout(res, ms));
function isLogged(id) { return logData.includes(id); }

export async function autoReplay(page, browser) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 0 });

  // ✅ Ambil nama akun login (paksa)
  const userSelf = await page.evaluate(() => {
    const candidates = [
      document.querySelector('a[aria-label*="Profil"] span'),
      document.querySelector('div[aria-label="Akun Anda"] span'),
      document.querySelector('img[alt][referrerpolicy]')
    ];
    return candidates.find(e => e)?.innerText || candidates.find(e => e)?.alt || 'ME';
  });
  console.log(`👤 Nama akun login terdeteksi: ${userSelf}`);

  let found = false;

  for (let scroll = 1; scroll <= 10 && !found; scroll++) {
    console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2500);

    const notifLinks = await page.$$eval('a[href*="comment_id"][href*="reply_comment_id"]', as => as.map(a => a.href));

    for (const url of notifLinks) {
      const notifId = crypto.createHash('sha1').update(url).digest('hex');
      if (isLogged(notifId)) {
        console.log('⏭️ Sudah dibalas sebelumnya.');
        continue;
      }

      console.log(`🎯 Target mention: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
      await delay(5000);

      // Scroll semua komentar
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(1000);
      }

      // ✅ Ambil semua komentar
      const comments = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('div[role="article"], div[aria-label="Komentar"]'));
        return nodes.map((n, i) => ({
          index: i,
          name: n.querySelector('h3 a')?.innerText || 'Unknown',
          profile: n.querySelector('h3 a')?.href || '',
          text: n.innerText.slice(0, 500)
        }));
      });
      fs.writeFileSync(dumpPath, JSON.stringify(comments, null, 2));
      console.log(`📝 Dump ${comments.length} komentar`);

      // ✅ Cari komentar valid (bukan diri sendiri)
      const target = comments.find(c => c.text.length > 3 && !c.name.includes(userSelf));
      if (!target) {
        console.log('⏭️ Tidak ada komentar valid.');
        continue;
      }
      console.log(`💬 Target: "${target.text}" oleh ${target.name}`);

      // ✅ Validasi ID penulis dengan buka profil (anti false positive)
      if (target.profile) {
        const newTab = await browser.newPage();
        await newTab.goto(target.profile, { waitUntil: 'domcontentloaded', timeout: 0 });
        await delay(4000);
        const profileUrl = newTab.url();
        await newTab.close();
        if (profileUrl.includes(userSelf.toLowerCase())) {
          console.log('⏭️ Komentar adalah milik akun sendiri → skip.');
          continue;
        }
      }

      // ✅ Klik tombol Balas dengan evaluateHandle
      try {
        const replyButton = await page.evaluateHandle(() => {
          const el = Array.from(document.querySelectorAll('span')).find(s => s.innerText === 'Balas' || s.innerText === 'Reply');
          if (el) el.click();
          return el;
        });
        if (!replyButton) {
          console.log('❌ Tombol Balas tidak ditemukan.');
          continue;
        }
        console.log('✅ Klik tombol Balas sukses.');
        await delay(2000);
      } catch (e) {
        console.log(`❌ ERROR klik balas: ${e.message}`);
        continue;
      }

      // ✅ Cari kolom input
      let replyBox = await page.$('div[contenteditable="true"][role="textbox"]');
      if (!replyBox) {
        console.log('❌ Kolom input tidak muncul.');
        continue;
      }

      // ✅ Buat balasan AI
      const aiReply = await getAIComment(target.text);
      console.log(`🤖 AI Reply: ${aiReply}`);

      // ✅ Ketik manual
      await replyBox.focus();
      for (const char of aiReply.split('')) {
        await page.keyboard.type(char, { delay: 50 + Math.random() * 80 });
      }
      await delay(800);
      await page.keyboard.press('Enter');
      await delay(2000);

      console.log('✅ Komentar terkirim.');
      saveLog(notifId);
      found = true;
      break;
    }
  }

  if (!found) console.log('[GAGAL] Tidak ada komentar yang bisa dibalas.');
  console.log('✅ Menutup browser...');
  await browser.close();
}

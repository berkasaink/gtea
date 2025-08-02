import { getAIComment } from '../modules/openai.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_replay.log');

let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf-8')) : [];
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); fs.writeFileSync(logPath, JSON.stringify(logData, null, 2)); } };
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(r => setTimeout(r, ms));

export async function autoReplay(page, browser = null) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });
  await delay(5000);

  let targetLink = null;
  for (let i = 1; i <= 10 && !targetLink; i++) {
    console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2500);

    const mentions = await page.$$eval('a[href]', as =>
      as.map(a => ({ href: a.href, text: a.innerText }))
    );

    const found = mentions.find(m => /menyebut anda|mention you/i.test(m.text));
    if (found) targetLink = found.href;
  }

  if (!targetLink) {
    console.log('[GAGAL] Tidak ada mention ditemukan.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`🎯 Target mention ditemukan: ${targetLink}`);
  await page.goto(targetLink, { waitUntil: 'networkidle2' });
  await delay(6000);

  // ✅ Ambil text postingan utama
  const postText = await page.$eval('div[role="article"]', el => el.innerText.slice(0, 120)).catch(() => 'Tidak terbaca');
  console.log(`📝 Postingan: "${postText}..."`);

  // ✅ Ambil semua komentar (pakai selector baru)
  const comments = await page.$$eval('div[aria-label="Komentar"] div[dir="auto"]', els =>
    els.map(e => e.innerText).filter(t => t.trim().length > 0)
  );

  if (!comments || comments.length === 0) {
    console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
    if (browser) await browser.close();
    return false;
  }

  // ✅ Cari komentar yang mengandung '@' atau 'Anda'
  const targetComment = comments.find(t => /@|anda|you/i.test(t));
  if (!targetComment) {
    console.log('⏭️ Tidak ada komentar mention valid.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`💬 Komentar target: "${targetComment.slice(0, 80)}..."`);

  // ✅ Minta balasan AI
  const reply = await getAIComment(targetComment);
  if (!reply || reply.startsWith('[AI_ERROR_400]')) {
    console.log('⚠️ Gagal generate balasan AI.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`🤖 Balasan AI: ${reply}`);

  // ✅ Kirim balasan
  try {
    const box = await page.$('div[contenteditable="true"][data-lexical-editor="true"]');
    if (!box) throw new Error('Kolom balas tidak ditemukan');

    await box.focus();
    await delay(500);
    await page.keyboard.type(reply, { delay: 90 });
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(3000);

    console.log('✅ Balasan mention berhasil dikirim.');
  } catch (err) {
    console.log(`❌ Gagal membalas komentar: ${err.message}`);
  }

  if (browser) {
    console.log('✅ Menutup browser...');
    await browser.close();
  }
  return true;
}

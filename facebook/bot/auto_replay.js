import { getAIComment } from '../modules/openai.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_replay.log');

// === LOG MANAGEMENT ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    const raw = fs.readFileSync(logPath, 'utf-8');
    logData = raw ? JSON.parse(raw) : [];
  } catch {
    logData = [];
  }
}
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); fs.writeFileSync(logPath, JSON.stringify(logData, null, 2)); } };
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(r => setTimeout(r, ms));

export async function autoReplay(page, browser = null) {
  console.log('[WAIT] Membuka notifikasi Facebook...');
  await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(4000);

  const myName = 'Lina'; // ✅ Ganti sesuai nama akun
  let targetLink = null;
  let targetId = null;

  // 🔍 Cari target mention di notifikasi
  for (let i = 1; i <= 10 && !targetLink; i++) {
    console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(2500);

    const mentions = await page.$$eval('a[href]', as =>
      as.map(a => ({ href: a.href, text: a.innerText }))
    );

    const found = mentions.find(m => /menyebut anda|mention you/i.test(m.text));
    if (found) {
      targetLink = found.href;
      targetId = new URL(found.href).searchParams.get('reply_comment_id') ||
                 new URL(found.href).searchParams.get('comment_id');
    }
  }

  if (!targetLink) {
    console.log('[GAGAL] Tidak ada mention ditemukan.');
    if (browser) await browser.close();
    return false;
  }

  if (targetId && isLogged(targetId)) {
    console.log('⏭️ Komentar ini sudah pernah dibalas.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`🎯 Target mention ditemukan: ${targetLink}`);

  // ✅ Buka halaman komentar
  try {
    await page.goto(targetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    console.log('❌ Gagal memuat halaman komentar.');
    if (browser) await browser.close();
    return false;
  }

  await delay(6000);

  // ✅ Ambil text postingan
  const postText = await page.$eval('div[role="article"]', el => el.innerText.slice(0, 120)).catch(() => 'Tidak terbaca');
  console.log(`📝 Postingan: "${postText}..."`);

  // ✅ Ambil semua komentar dengan selector yang lebih dalam
  const comments = await page.$$eval('div[aria-label="Komentar"] div[role="article"], div[role="comment"]', els =>
    els.map(el => {
      const author = el.querySelector('strong, h3, span')?.innerText || '';
      const text = el.innerText || '';
      return { author, text };
    }).filter(c => c.text.length > 2)
  );

  // ✅ Debug semua komentar yang ditemukan
  console.log(`🔎 Ditemukan ${comments.length} komentar di thread ini.`);

  // ✅ Cari komentar mention valid (bukan milik kita)
  const targetComment = comments.find(c =>
    !c.author.toLowerCase().includes('lina') &&  // bukan dari kita
    c.text.toLowerCase().includes(myName.toLowerCase()) // mention kita
  );

  if (!targetComment) {
    console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`💬 Komentar target dari ${targetComment.author}: "${targetComment.text.slice(0, 90)}..."`);

  // ✅ Generate balasan AI
  const reply = await getAIComment(targetComment.text);
  if (!reply || reply.startsWith('[AI_ERROR_400]')) {
    console.log('⚠️ Gagal generate balasan AI.');
    if (browser) await browser.close();
    return false;
  }

  console.log(`🤖 Balasan AI: ${reply}`);

  // ✅ Kirim balasan
  try {
    const box = await page.$('div[contenteditable="true"][data-lexical-editor="true"], div[aria-label="Tulis balasan"], div[contenteditable="true"]');
    if (!box) throw new Error('Kolom balas tidak ditemukan');

    await box.focus();
    await delay(500);
    await page.keyboard.type(reply, { delay: 80 });
    await delay(800);
    await page.keyboard.press('Enter');
    await delay(3000);

    console.log('✅ Balasan mention berhasil dikirim.');
    if (targetId) saveLog(targetId);
  } catch (err) {
    console.log(`❌ Gagal membalas komentar: ${err.message}`);
  }

  if (browser) {
    console.log('✅ Menutup browser...');
    await browser.close();
  }
  return true;
}

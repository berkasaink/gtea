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
  await delay(5000);

  let targetLink = null;
  let targetId = null;

  // 🔍 Cari mention di notifikasi
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
      targetId = new URL(found.href).searchParams.get('reply_comment_id') || new URL(found.href).searchParams.get('comment_id');
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

  // ✅ Buka halaman komentar dengan retry jika timeout
  let successNav = false;
  for (let attempt = 1; attempt <= 2 && !successNav; attempt++) {
    try {
      await page.goto(targetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
      successNav = true;
    } catch {
      console.log(`⚠️ [RETRY] Gagal load halaman, percobaan ke-${attempt}`);
      await delay(5000);
    }
  }
  if (!successNav) {
    console.log('❌ Gagal memuat halaman komentar.');
    if (browser) await browser.close();
    return false;
  }

  await delay(6000);

  // ✅ Ambil text postingan utama
  const postText = await page.$eval('div[role="article"]', el => el.innerText.slice(0, 120)).catch(() => 'Tidak terbaca');
  console.log(`📝 Postingan: "${postText}..."`);

  // ✅ Ambil komentar orang lain
  const comments = await page.$$eval('ul[role="list"] li[role="listitem"] div[dir="auto"]', els =>
    els.map(e => e.innerText.trim()).filter(t => t.length > 0)
  );

  if (!comments || comments.length === 0) {
    console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
    if (browser) await browser.close();
    return false;
  }

  // ✅ Cari komentar yang berisi mention selain akun sendiri
  const targetComment = comments.find(t => /@|anda|you/i.test(t) && !/saya|aku/i.test(t));
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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../logs/auto_visit.log');

// === Log Aman ===
let logData = [];
if (fs.existsSync(logPath)) {
  try {
    const raw = fs.readFileSync(logPath, 'utf-8').trim();
    logData = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(logData)) throw new Error('Log bukan array');
  } catch {
    console.warn('⚠️ [LOG] auto_visit.log rusak, reset log.');
    logData = [];
    fs.writeFileSync(logPath, '[]');
  }
} else {
  fs.writeFileSync(logPath, '[]');
}

function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 500) logData = logData.slice(-500);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
}
function isLogged(id) { return logData.includes(id); }
const delay = ms => new Promise(res => setTimeout(res, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export async function autoVisit(page, browser = null) {
  console.log('[WAIT] Memuat beranda Facebook...');
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
  await delay(4000);

  // ✅ Scroll beranda 5 kali agar terlihat natural
  for (let i = 1; i <= 5; i++) {
    console.log(`[WAIT] Scrolling beranda... (${i}/5)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(randomDelay(3000, 5000));
  }

  console.log('[WAIT] Mengambil link profil dari beranda...');
  const profiles = await page.$$eval('a[href*="facebook.com/"]', links => {
    return links
      .map(a => a.href)
      .filter(h => !h.includes('photo.php') && !h.includes('permalink') && !h.includes('story.php') && !h.includes('sharer.php') && !h.includes('groups/') && !h.includes('messages') && !h.includes('?comment_id'))
      .filter((h, i, arr) => arr.indexOf(h) === i) // unik
      .slice(0, 30); // ambil max 30 profil setelah scroll
  });

  if (profiles.length === 0) {
    console.log('⚠️ Tidak ada profil ditemukan.');
    return false;
  }

  // Pilih profil random
  const targetProfile = profiles[Math.floor(Math.random() * profiles.length)];
  const profileId = crypto.createHash('sha1').update(targetProfile).digest('hex');

  if (isLogged(profileId)) {
    console.log(`⏭️ Profil sudah pernah dikunjungi, skip.`);
    return false;
  }

  console.log(`🎯 Mengunjungi profil: ${targetProfile}`);
  await page.goto(targetProfile, { waitUntil: 'networkidle2' });
  saveLog(profileId);

  // ✅ Scroll profil secara bertahap
  for (let i = 1; i <= 3; i++) {
    console.log(`[WAIT] Scroll profil... (${i}/3)`);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(randomDelay(3000, 5000));
  }

  console.log('✅ Profil berhasil dikunjungi dan discroll.');
  if (browser) {
    console.log('✅ Menutup browser...');
    await delay(2000);
    await browser.close();
  }
  return true;
}

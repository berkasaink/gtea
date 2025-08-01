const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAIComment } = require('../modules/openrouter.js');
const { logAction } = require('../modules/logger.js');

const HISTORY_FILE = path.resolve(__dirname, '../logs/commented_posts.json');

// ✅ Load riwayat komentar
function loadHistory() {
  return fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : [];
}
function saveHistory(uid) {
  const h = loadHistory();
  if (!h.includes(uid)) {
    h.push(uid);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h.slice(-1000), null, 2));
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min = 2000, max = 4000) { return sleep(Math.floor(Math.random() * (max - min) + min)); }

// ✅ Filter postingan baru
async function isPostRecent(post) {
  return await post.evaluate(el => {
    const timeEl = el.querySelector('abbr,time,span[aria-hidden="false"],a[aria-label]');
    if (!timeEl) return true;
    const raw = (timeEl.getAttribute('data-utime') || timeEl.getAttribute('datetime') || timeEl.innerText || '').toLowerCase();
    if (/^\d+$/.test(raw)) return (Date.now() - new Date(parseInt(raw) * 1000).getTime()) < 86400000;
    if (/\d{4}-\d{2}-\d{2}/.test(raw)) return (Date.now() - new Date(raw).getTime()) < 86400000;
    if (raw.includes('menit') || raw.includes('minute') || raw.includes('jam') || raw.includes('hour') || raw.includes('kemarin') || raw.includes('yesterday')) return true;
    if (raw.includes('hari')) { const m = raw.match(/(\d+)/); if (m && parseInt(m[1]) >= 2) return false; }
    return true;
  });
}

// ✅ Filter postingan iklan/tanpa teks/sendiri
async function shouldSkip(post) {
  return await post.evaluate(el => {
    const txt = el.innerText.toLowerCase();
    if (!txt || txt.length < 5) return 'Tidak ada teks';
    if (txt.includes('disponsori') || txt.includes('sponsored')) return 'Iklan';
    if (txt.includes('anda') || txt.includes('your profile') || txt.includes('kamu')) return 'Postingan sendiri';
    return null;
  });
}

// ✅ Klik tombol komentar
async function clickCommentButton(post) {
  try {
    await post.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await randomDelay(800, 1500);

    const clicked = await post.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('div[role="button"] span')).find(b => /oment/i.test(b.innerText));
      if (btn) { btn.click(); return true; } return false;
    });
    return clicked;
  } catch (e) {
    console.log('⚠️ ERROR klik tombol:', e.message);
    return false;
  }
}

// ✅ Ketik komentar dengan validasi
async function typeComment(page, box, text) {
  try {
    await box.focus();
    let typed = false;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.type(text, { delay: 80 });
      await sleep(1500);
      const typedText = await page.evaluate(el => el.innerText, box);
      if (typedText.includes(text.slice(0, 5))) { typed = true; break; }
      console.log('⚠️ Teks belum masuk, ketik ulang...');
    }
    if (!typed) return false;
    await page.keyboard.press('Enter');
    await sleep(2000);
    return true;
  } catch { return false; }
}

// ✅ Fungsi utama (dipanggil dari main.js)
async function autoComment(page) {
  console.log('[TEST] Menjalankan auto_komen.js Fix 26 Modular');

  const history = loadHistory();
  const commented = new Set(history);
  let count = 0;

  for (let batch = 0; batch < 10; batch++) {
    console.log(`[WAIT] Scrolling batch ${batch + 1}...`);
    await page.evaluate(() => window.scrollBy(0, 2000));
    await randomDelay();

    const posts = await page.$$('[data-ad-preview="message"]');
    console.log(`🔍 Batch ${batch + 1}: ${posts.length} postingan ditemukan`);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const text = await post.evaluate(el => el.innerText || '');
      if (!text) continue;

      const uid = crypto.createHash('sha1').update(text.slice(0, 100)).digest('hex');
      if (commented.has(uid)) continue;
      if (!(await isPostRecent(post))) continue;

      const skipReason = await shouldSkip(post);
      if (skipReason) { console.log(`⏭️ [${batch + 1}-${i + 1}] ${skipReason}`); continue; }

      console.log(`🎯 [${batch + 1}-${i + 1}] ${text.slice(0, 60)}...`);
      const aiComment = await getAIComment(text);
      if (!aiComment) continue;
      console.log(`💬 ${aiComment}`);

      const clicked = await clickCommentButton(post);
      if (!clicked) { console.log(`⚠️ [${batch + 1}-${i + 1}] Tombol komentar tidak ditemukan`); continue; }

      await randomDelay(3000);
      const box = await page.$('div[contenteditable="true"][data-lexical-editor="true"]');
      if (!box) { console.log(`⚠️ [${batch + 1}-${i + 1}] Kolom komentar tidak ditemukan`); continue; }

      const success = await typeComment(page, box, aiComment);
      if (success) {
        console.log(`✅ Komentar berhasil dikirim ke postingan [${batch + 1}-${i + 1}]`);
        saveHistory(uid);
        await logAction('auto_komen', aiComment);
        count++;
        if (count >= 2) { console.log('✅ Sesi selesai.'); return true; }
      } else {
        console.log(`❌ [${batch + 1}-${i + 1}] Gagal mengetik komentar`);
      }
    }
  }
  console.log('✅ Tidak ada postingan valid atau semua sudah dikomentari.');
  return true;
}

module.exports = { autoComment };

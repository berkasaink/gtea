const fs = require('fs');
const path = require('path');
const { askAI } = require('../modules/openai.js');
const logFile = path.join(__dirname, '../logs/auto_replay.log');

const userName = "Lina"; // ganti sesuai nama akun Anda
const delay = ms => new Promise(res => setTimeout(res, ms));

// === Load Log untuk Cegah Balasan Duplikat ===
let logData = [];
if (fs.existsSync(logFile)) {
  try {
    logData = JSON.parse(fs.readFileSync(logFile, 'utf8')) || [];
  } catch {
    logData = [];
  }
}
function saveLog(id) {
  if (!logData.includes(id)) {
    logData.push(id);
    if (logData.length > 1000) logData = logData.slice(-1000);
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
  }
}

// === Fungsi Scroll Komentar ===
async function scrollComments(page, times = 6) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    console.log(`🔽 [DEBUG] Scroll komentar (${i + 1}/${times})`);
    await delay(2000);
  }
}

// === Ambil Komentar Orang Lain ===
async function getTargetComment(page, userName) {
  return await page.evaluate((user) => {
    const nodes = document.querySelectorAll('div[role="article"] div[dir="auto"]');
    let found = null;
    nodes.forEach(node => {
      let txt = node.innerText.trim();
      if (txt && !txt.includes(user) && txt.length > 5) {
        found = txt;
      }
    });
    return found;
  }, userName);
}

// === Main Function ===
async function autoReplay(page, browser = null) {
  try {
    console.log("[WAIT] Membuka notifikasi Facebook...");
    await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 60000 });

    let success = false;

    for (let scroll = 1; scroll <= 10 && !success; scroll++) {
      console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);

      const notif = await page.$('a[role="link"][href*="comment_mention"]');
      if (!notif) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(2000);
        continue;
      }

      const notifUrl = await page.evaluate(el => el.href, notif);
      console.log(`🎯 Target mention ditemukan: ${notifUrl}`);
      await notif.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

      // === Scroll komentar untuk load semua ===
      await scrollComments(page, 6);

      // === Simpan Debug HTML ===
      const debugPath = path.join(__dirname, '../logs/debug_replay.html');
      fs.writeFileSync(debugPath, await page.content());
      console.log(`✅ Debug komentar disimpan: ${debugPath}`);

      // === Ambil Komentar Target ===
      const comment = await getTargetComment(page, userName);
      if (!comment) {
        console.log("⏭️ Tidak ada komentar mention orang lain ditemukan.");
        continue;
      }

      const commentId = Buffer.from(comment).toString('base64').slice(0, 20);
      if (logData.includes(commentId)) {
        console.log("⏭️ Komentar ini sudah pernah dibalas, skip.");
        continue;
      }

      console.log(`💬 Komentar target: "${comment}"`);

      // === Generate Balasan dari AI ===
      const reply = await askAI(`Balas komentar ini secara sopan dan relevan: ${comment}`);
      console.log(`🤖 Balasan AI: ${reply}`);

      // === Kirim Balasan ===
      try {
        const box = await page.$('div[aria-label="Tulis balasan..."]');
        if (!box) {
          console.log("❌ Kolom balas tidak ditemukan.");
          continue;
        }

        await box.focus();
        await page.keyboard.type(reply, { delay: 80 });
        await delay(1000);
        await page.keyboard.press('Enter');
        await delay(3000);

        saveLog(commentId);
        console.log("✅ Balasan mention berhasil dikirim.");
        success = true;

      } catch (err) {
        console.log("❌ ERROR kirim balasan:", err.message);
      }
    }

    if (!success) console.log("⚠️ Tidak ada mention yang berhasil dibalas.");
    if (browser) await browser.close();

  } catch (err) {
    console.log("❌ ERROR:", err.message);
  }
}

module.exports = { autoReplay };

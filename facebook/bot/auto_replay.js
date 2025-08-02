const fs = require('fs');
const path = require('path');
const { askAI } = require('../modules/openai.js');
const userName = "Lina"; // ganti otomatis dari config Anda
const logFile = path.join(__dirname, '../logs/auto_replay.log');

async function scrollElement(page, selector, times = 6) {
    for (let i = 0; i < times; i++) {
        await page.evaluate(sel => {
            const el = document.querySelector(sel);
            if (el) el.scrollBy(0, el.scrollHeight);
        }, selector);
        await new Promise(r => setTimeout(r, 2000));
        console.log(`🔽 [DEBUG] Scroll komentar (${i + 1}/${times})`);
    }
}

async function getTargetComment(page) {
    return await page.evaluate((userName) => {
        const comments = document.querySelectorAll('div[role="article"] div[dir="auto"] span');
        let results = [];
        comments.forEach(el => {
            let text = el.innerText.trim();
            if (text && !text.includes(userName) && text.length > 3) {
                results.push(text);
            }
        });
        return results.length ? results[0] : null;
    }, userName);
}

async function autoReplay(page) {
    try {
        console.log("[WAIT] Membuka notifikasi Facebook...");
        await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 60000 });

        for (let i = 1; i <= 10; i++) {
            console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
            const notif = await page.$('a[role="link"][href*="comment_mention"]');
            if (!notif) continue;

            const notifUrl = await page.evaluate(el => el.href, notif);
            console.log(`🎯 Target mention ditemukan: ${notifUrl}`);
            await notif.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

            // Scroll komentar dalam container
            await scrollElement(page, 'div[aria-label="Tampilkan lebih banyak komentar"]', 6);

            // Ambil komentar target
            const comment = await getTargetComment(page);
            const debugPath = path.join(__dirname, '../logs/debug_replay.html');
            fs.writeFileSync(debugPath, await page.content());
            console.log(`✅ Debug komentar disimpan: ${debugPath}`);

            if (!comment) {
                console.log("⏭️ Tidak ada komentar mention orang lain ditemukan.");
                continue;
            }

            console.log(`💬 Komentar target: "${comment}"`);

            // Generate balasan dari AI
            const reply = await askAI(`Balas komentar Facebook secara sopan: ${comment}`);
            console.log(`🤖 Balasan AI: ${reply}`);

            // Kirim balasan
            await page.type('div[aria-label="Tulis balasan..."]', reply, { delay: 50 });
            await page.keyboard.press('Enter');

            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Balas: ${comment} -> ${reply}\n`);
            console.log("✅ Balasan mention berhasil dikirim.");
            return;
        }

        console.log("⚠️ Tidak ada mention yang berhasil dibalas.");
    } catch (err) {
        console.error("❌ ERROR:", err.message);
    }
}

module.exports = { autoReplay };

// === auto_replay.js Fix 12 ===
// ✅ CommonJS, tidak menggunakan ESM
// ✅ Perbaikan pembacaan komentar target (tidak membaca komentar sendiri)
// ✅ Perbaikan pemanggilan askAI dari openai.js
// ✅ Retry selector agar tidak error "Node is detached"
// ✅ Debug log lebih jelas

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { askAI } = require('../modules/openai.js');

const logPath = path.join(__dirname, '../logs/auto_replay.log');
let logData = [];

if (fs.existsSync(logPath)) {
    try {
        logData = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        if (!Array.isArray(logData)) throw new Error();
    } catch {
        logData = [];
        fs.writeFileSync(logPath, '[]');
    }
} else {
    fs.writeFileSync(logPath, '[]');
}

function saveLog(id) {
    if (!logData.includes(id)) {
        logData.push(id);
        if (logData.length > 1000) logData = logData.slice(-1000);
        fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
    }
}
function isLogged(id) { return logData.includes(id); }
const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Ambil teks komentar dari orang lain, bukan user sendiri
 */
async function getTargetComment(page, userName) {
    return await page.evaluate((userName) => {
        const komentarNodes = document.querySelectorAll("div[aria-label='Komentar'] div[dir='auto']");
        for (let node of komentarNodes) {
            const txt = node.innerText.trim();
            if (txt && !txt.includes(userName)) {
                return txt;
            }
        }
        return null;
    }, userName);
}

/**
 * Fungsi utama Auto Replay
 */
async function autoReplay(page, browser) {
    console.log('[WAIT] Membuka notifikasi Facebook...');
    await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2', timeout: 0 });
    await delay(3000);

    const userName = 'Lina'; // ✅ Nama user untuk filter komentar sendiri
    let success = false;

    for (let scroll = 1; scroll <= 10; scroll++) {
        console.log(`[WAIT] Scrolling notifikasi... (${scroll}/10)`);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(2500);

        const notifLinks = await page.$$eval('a[href*="comment_id"]', els =>
            els.map(a => a.href).filter(h => h.includes('notif_t=group_comment_mention'))
        );

        if (!notifLinks.length) continue;

        for (let link of notifLinks) {
            const notifId = crypto.createHash('md5').update(link).digest('hex');
            if (isLogged(notifId)) {
                console.log(`⏭️ Sudah pernah dibalas: ${link}`);
                continue;
            }

            console.log(`🎯 Target mention ditemukan: ${link}`);
            await page.goto(link, { waitUntil: 'networkidle2', timeout: 0 });
            await delay(4000);

            // ✅ Scroll kolom komentar agar semua komentar termuat
            for (let i = 1; i <= 6; i++) {
                console.log(`🔽 [DEBUG] Scroll komentar (${i}/6)`);
                await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
                await delay(2000);
            }

            // ✅ Simpan debug HTML
            const debugPath = path.join(__dirname, '../logs/debug_replay.html');
            fs.writeFileSync(debugPath, await page.content());
            console.log(`✅ Debug komentar disimpan: ${debugPath}`);

            // ✅ Ambil komentar target
            const komentarTarget = await getTargetComment(page, userName);
            if (!komentarTarget) {
                console.log('⏭️ Tidak ada komentar mention orang lain ditemukan.');
                continue;
            }

            console.log(`💬 Komentar target: "${komentarTarget}"`);

            // ✅ Balasan dari AI
            let balasan;
            try {
                balasan = await askAI(`Balas komentar ini dengan sopan dan singkat: ${komentarTarget}`);
            } catch (err) {
                console.log(`❌ ERROR: ${err.message}`);
                continue;
            }

            console.log(`🤖 Balasan AI: ${balasan}`);

            // ✅ Cari box balas komentar
            try {
                await page.evaluate(() => {
                    const replyBtn = Array.from(document.querySelectorAll('span'))
                        .find(el => /balas/i.test(el.innerText));
                    if (replyBtn) replyBtn.click();
                });

                await delay(2000);
                const replyBox = await page.$('div[contenteditable="true"]');
                if (!replyBox) {
                    console.log('❌ Tidak ada kolom balas komentar ditemukan.');
                    continue;
                }

                await replyBox.focus();
                await page.keyboard.type(balasan, { delay: 90 });
                await page.keyboard.press('Enter');
                await delay(3000);

                console.log('✅ Balasan mention berhasil dikirim.');
                saveLog(notifId);
                success = true;
                break;
            } catch (err) {
                console.log(`❌ ERROR Balas: ${err.message}`);
            }
        }
        if (success) break;
    }

    console.log(success ? '✅ Semua balasan selesai. Menutup browser...' : '⚠️ Tidak ada mention yang berhasil dibalas.');
    if (browser) await browser.close();
    process.exit(success ? 0 : 1);
}

module.exports = { autoReplay };

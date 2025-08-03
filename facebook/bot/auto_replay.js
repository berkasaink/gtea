import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { getOpenAIReply } from '../modules/openai.js';
import { loadCookies, saveCookies } from '../modules/browser.js';

const LOG_FILE = path.resolve('./logs/auto_replay.log');
const COMMENT_DUMP = path.resolve('./logs/comments_dump.html');
const MAX_SCROLL = 10;
let LOGIN_NAME = "ME";

function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

(async () => {
    log("[TEST] Menjalankan auto_replay.js Fix 37");

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // ✅ Load cookies
    await loadCookies(page, './cookies.json');
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });

    // ✅ Deteksi nama akun login
    try {
        await page.waitForSelector('[role="banner"] [aria-label]', { timeout: 5000 });
        LOGIN_NAME = await page.$eval('[role="banner"] [aria-label]', el => el.textContent.trim());
    } catch { LOGIN_NAME = "ME"; }
    log(`👤 Nama akun login terdeteksi: ${LOGIN_NAME}`);

    // ✅ Buka notifikasi
    log("[WAIT] Membuka notifikasi Facebook...");
    await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });
    await delay(3000);

    let foundTarget = false;

    // ✅ Scroll notifikasi hingga MAX_SCROLL
    for (let i = 1; i <= MAX_SCROLL; i++) {
        log(`[WAIT] Scrolling notifikasi... (${i}/${MAX_SCROLL})`);

        const notifications = await page.$$eval('[role="article"] a[href*="notif_t"]', els =>
            els.map(e => ({
                url: e.href,
                text: e.innerText
            }))
        );

        for (let notif of notifications) {
            const notifUser = notif.text.split(' ')[0]?.trim() || "Belum";
            log(`🎯 Target mention dari: ${notifUser}`);
            log(`🌐 URL: ${notif.url}`);

            // ✅ Buka URL komentar target
            await page.goto(notif.url, { waitUntil: 'networkidle2' });
            await delay(5000);

            // ✅ Dump HTML komentar ke file
            const html = await page.content();
            fs.writeFileSync(COMMENT_DUMP, html);

            // ✅ Cari komentar terbaru dari user target
            const comments = await page.$$eval('[aria-label="Tulis komentar"]', els => els.map(e => e.innerText.trim()));
            const allComments = await page.$$eval('[aria-label="Balas"]', els => els.map(e => e.closest('[role="article"]')?.innerText || ""));
            log(`📌 Semua komentar terdeteksi: ${JSON.stringify(allComments.slice(0,5))}`);

            // ✅ Filter komentar user target
            const targetComment = allComments.reverse().find(c =>
                c.includes(notifUser) &&
                !c.includes('Suka') &&
                !c.includes('Balas')
            );

            if (!targetComment) {
                log("⏭️ Tidak ada komentar dari target user ditemukan.");
                continue;
            }

            if (targetComment.includes(LOGIN_NAME)) {
                log("⏭️ Komentar ini milik akun sendiri, dilewati.");
                continue;
            }

            log(`💬 Target komentar: "${targetComment}" oleh ${notifUser}`);

            // ✅ Klik tombol Balas
            try {
                await page.evaluate((user) => {
                    const comments = [...document.querySelectorAll('[aria-label="Balas"]')];
                    const btn = comments.find(b => b.closest('[role="article"]')?.innerText.includes(user));
                    if (btn) btn.click();
                }, notifUser);

                await delay(2000);

                // ✅ Tulis komentar balasan
                const replyBox = await page.$('form[role="presentation"] div[contenteditable="true"]');
                const aiReply = await getOpenAIReply(targetComment);
                await replyBox.type(aiReply, { delay: 50 });
                await delay(1000);

                // ✅ Kirim komentar
                await page.keyboard.press('Enter');
                log(`🤖 AI Reply: ${aiReply}`);
                log("✅ Komentar terkirim.");
                foundTarget = true;
                break;

            } catch (err) {
                log(`❌ ERROR klik balas: ${err.message}`);
            }
        }

        if (foundTarget) break;

        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await delay(2000);
    }

    if (!foundTarget) log("[GAGAL] auto_replay tidak menemukan komentar valid.");

    await browser.close();
})();

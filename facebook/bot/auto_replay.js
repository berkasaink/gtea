// auto_replay.js (Fix Debugging dengan Screenshot & Dump)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { launchBrowser } from "../modules/browser.js";
import { getAIComment } from "../modules/openai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, "../logs/auto_replay.log");
const dumpNotif = path.resolve(__dirname, "../logs/notif_dump.html");
const dumpComments = path.resolve(__dirname, "../logs/comments_dump.html");
const dumpPage = path.resolve(__dirname, "../logs/page_dump.html");
const ssNotif = path.resolve(__dirname, "../logs/notif_screenshot.png");
const ssComment = path.resolve(__dirname, "../logs/comment_screenshot.png");

let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8") || "[]") : [];
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); if (logData.length > 2000) logData = logData.slice(-2000); fs.writeFileSync(logPath, JSON.stringify(logData, null, 2)); } };
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(r => setTimeout(r, ms));

export async function autoReplay(page = null, browser = null) {
  let localBrowser = null;
  try {
    if (!page || !browser) {
      const launched = await launchBrowser();
      page = launched.page;
      localBrowser = launched.browser;
    }

    // ✅ 1. Deteksi nama login (pakai aria-label dan title sebagai fallback)
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
    await delay(3000);
    let loginName = await page.evaluate(() => {
      let name = document.querySelector('div[aria-label="Akun"] span')?.innerText
        || document.querySelector('a[role="link"][tabindex="0"] span')?.innerText
        || document.title || "ME";
      return name.trim();
    });
    console.log(`👤 Nama akun login terdeteksi: ${loginName}`);

    // ✅ 2. Buka notifikasi
    console.log("[WAIT] Membuka notifikasi...");
    await page.goto("https://www.facebook.com/notifications", { waitUntil: "networkidle2" });
    await delay(5000);
    await page.screenshot({ path: ssNotif, fullPage: true });
    fs.writeFileSync(dumpNotif, await page.content(), "utf-8");

    // ✅ 3. Cari target mention di notifikasi
    let targetURL = null, targetUser = null;
    for (let i = 1; i <= 10; i++) {
      console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
      const notifs = await page.evaluate(() => Array.from(document.querySelectorAll("a[href*='comment_id']")).map(a => ({ text: a.innerText, href: a.href })));
      for (const n of notifs) {
        const m = n.text.match(/(.+?)\s+(?:menyebut|menandai|membalas)\s+anda/i);
        if (m) { targetUser = m[1].trim(); targetURL = n.href; break; }
      }
      if (targetURL) break;
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await delay(2000);
    }
    if (!targetURL) { console.log("⚠️ Tidak ada mention ditemukan."); return false; }

    console.log(`🎯 Target mention dari: ${targetUser}`);
    console.log(`🌐 URL Target: ${targetURL}`);

    // ✅ 4. Buka halaman komentar
    await page.goto(targetURL, { waitUntil: "networkidle2" });
    await delay(6000);
    await page.screenshot({ path: ssComment, fullPage: true });
    fs.writeFileSync(dumpPage, await page.content(), "utf-8");

    // ✅ 5. Ambil semua komentar (log semua, tanpa filter)
    const comments = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("div[role='article']")).map(div => ({
        user: div.querySelector("strong, h3")?.innerText || "",
        text: div.innerText,
        html: div.outerHTML
      }));
    });
    fs.writeFileSync(dumpComments, comments.map(c => `<p><b>${c.user}</b>: ${c.html}</p>`).join("\n"), "utf-8");
    console.log(`📌 Semua komentar terdeteksi: ${comments.length}`);

    // ✅ 6. (Sementara) tidak filter mention → hanya log
    for (const c of comments) console.log(`- ${c.user}: ${c.text.substring(0, 50)}...`);

    console.log("✅ Debug mode selesai. Kirim file logs/page_dump.html & screenshot ke saya untuk analisa lanjut.");
    return false;

  } catch (err) {
    console.log(`❌ ERROR auto_replay: ${err.message}`);
    return false;
  } finally {
    if (localBrowser) await localBrowser.close();
    else if (browser) await browser.close();
  }
}

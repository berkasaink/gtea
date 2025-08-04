import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { launchBrowser } from "../modules/browser.js";
import { getAIComment } from "../modules/openai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, "../logs/auto_replay.log");
const dumpPath = path.resolve(__dirname, "../logs/comments_dump.html");

let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8") || "[]") : [];
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); if (logData.length > 2000) logData = logData.slice(-2000); fs.writeFileSync(logPath, JSON.stringify(logData, null, 2)); } };
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function autoReplay(page = null, browser = null) {
  let localBrowser = null;

  try {
    if (!page || !browser) {
      const launched = await launchBrowser();
      page = launched.page;
      localBrowser = launched.browser;
    }

    // ✅ 1. Deteksi nama akun login
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
    await delay(3000);
    const loginName = await page.evaluate(() => {
      const el = document.querySelector('a[role="link"] span[dir="auto"]') || document.querySelector('span[dir="auto"]');
      return el ? el.innerText.trim() : "ME";
    });
    console.log(`👤 Nama akun login terdeteksi: ${loginName}`);

    // ✅ 2. Buka halaman notifikasi
    console.log("[WAIT] Membuka notifikasi...");
    await page.goto("https://www.facebook.com/notifications", { waitUntil: "networkidle2" });
    await delay(4000);

    let targetURL = null;
    let targetUser = null;

    // ✅ 3. Cari target notifikasi (regex + fallback)
    for (let i = 1; i <= 10; i++) {
      console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);
      const notifs = await page.$$eval("a[href*='comment_id']", els =>
        els.map(a => ({ html: a.innerHTML, href: a.href }))
      );

      for (const n of notifs) {
        const raw = n.html.replace(/<[^>]+>/g, " ");
        const m = raw.match(/([A-Za-z0-9 ._-]+)\s+(?:menyebut|menandai|membalas|mengomentari)/i);
        if (m) { targetUser = m[1].trim(); targetURL = n.href; break; }
      }

      if (targetURL) break;
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await delay(2000);
    }

    if (!targetURL) {
      console.log("⚠️ Tidak ada notifikasi ditemukan.");
      return false;
    }

    console.log(`🎯 Target dari: ${targetUser}`);
    console.log(`🌐 URL Target: ${targetURL}`);

    // ✅ 4. Buka halaman target komentar
    await page.goto(targetURL, { waitUntil: "networkidle2" });
    await delay(5000);

    // ✅ 5. Ambil semua komentar (nested support)
    const comments = await page.$$eval("div[role='article']", els =>
      els.map(e => ({
        user: e.querySelector("span[dir='auto']")?.innerText || "",
        text: e.innerText || "",
        html: e.outerHTML
      }))
    );

    fs.writeFileSync(dumpPath, comments.map(c => `<p><b>${c.user}</b>: ${c.html}</p>`).join("\n"), "utf-8");
    console.log(`📌 Semua komentar terdeteksi: ${comments.length}`);

    // ✅ 6. Pilih komentar mention → jika gagal fallback ke komentar targetUser
    let targetComment = comments.find(c =>
      !c.user.toLowerCase().includes(loginName.toLowerCase()) &&
      (c.html.includes("/profile.php") || c.html.includes(loginName))
    );

    if (!targetComment) {
      targetComment = comments.reverse().find(c =>
        c.user.toLowerCase().includes(targetUser?.toLowerCase() || "") &&
        !c.user.toLowerCase().includes(loginName.toLowerCase())
      );
    }

    if (!targetComment) {
      console.log("⏭️ Tidak ada komentar valid yang bisa dibalas.");
      return false;
    }

    console.log(`💬 Komentar target dari ${targetComment.user}: "${targetComment.text}"`);
    const commentID = crypto.createHash("sha1").update(targetComment.text).digest("hex");
    if (isLogged(commentID)) {
      console.log("⏭️ Komentar ini sudah dibalas sebelumnya.");
      return false;
    }

    // ✅ 7. Ambil balasan AI
    const replyText = await getAIComment(targetComment.text);
    if (!replyText || replyText.startsWith("[AI_ERROR")) {
      console.log("❌ Gagal mendapatkan balasan AI.");
      return false;
    }
    console.log(`🤖 Balasan AI: ${replyText}`);

    // ✅ 8. Klik tombol Balas (gunakan XPath fleksibel)
    const btnReply = await page.$x(`//span[contains(text(),'Balas')]/ancestor::div[contains(@role,'button')]`);
    if (btnReply.length === 0) {
      console.log("❌ Tombol Balas tidak ditemukan.");
      return false;
    }
    await btnReply[0].click();
    await delay(1500);

    // ✅ 9. Ketik balasan
    const inputBox = await page.$("div[contenteditable='true']");
    if (!inputBox) {
      console.log("❌ Kolom balasan tidak ditemukan.");
      return false;
    }

    await inputBox.focus();
    await page.keyboard.type(replyText, { delay: 70 });
    await delay(1500);
    await page.keyboard.press("Enter");
    await delay(3000);

    console.log("✅ Balasan berhasil dikirim!");
    saveLog(commentID);
    return true;

  } catch (err) {
    console.log(`❌ ERROR auto_replay: ${err.message}`);
    return false;
  } finally {
    if (localBrowser) await localBrowser.close();
    else if (browser) await browser.close();
  }
}

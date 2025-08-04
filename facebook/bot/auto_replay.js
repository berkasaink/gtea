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

const saveLog = (url, id) => {
  if (!logData.find(e => e.url === url && e.id === id)) {
    logData.push({ url, id });
    if (logData.length > 2000) logData = logData.slice(-2000);
    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
  }
};
const isLogged = (url, id) => logData.some(e => e.url === url && e.id === id);
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function autoReplay(page = null, browser = null) {
  let localBrowser = null;
  try {
    if (!page || !browser) {
      const launched = await launchBrowser();
      page = launched.page;
      localBrowser = launched.browser;
    }

    // ✅ Deteksi nama akun login
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
    await delay(3000);
    const loginName = await page.evaluate(() => {
      const el = document.querySelector('a[role="link"] span[dir="auto"]') || document.querySelector('span[dir="auto"]');
      return el ? el.innerText.trim() : "ME";
    });
    console.log(`👤 Nama akun login terdeteksi: ${loginName}`);

    // ✅ Buka notifikasi
    console.log("[WAIT] Membuka notifikasi...");
    await page.goto("https://www.facebook.com/notifications", { waitUntil: "networkidle2" });
    await delay(4000);

    let targetURL = null, targetUser = null;

    // ✅ Cari target (menyebut, membalas, mengomentari)
    for (let i = 1; i <= 10; i++) {
      console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);

      const notifs = await page.$$eval("a[href*='comment_id']", els =>
        els.map(a => ({ html: a.innerHTML, text: a.innerText, href: a.href }))
      );

      for (const n of notifs) {
        const raw = n.text || n.html.replace(/<[^>]+>/g, " ");
        const match = raw.match(/([A-Za-z0-9 ._-]+)\s+(?:menyebut|menandai|membalas|mengomentari)/i);

        if (match) {
          targetUser = match[1].trim();
          targetURL = n.href;

          if (logData.find(e => e.url === targetURL)) {
            console.log(`⏭️ URL sudah dibalas sebelumnya, lewati: ${targetURL}`);
            targetURL = null;
            continue;
          }

          console.log(`🎯 Target notifikasi terdeteksi: "${raw}"`);
          break;
        }
      }
      if (targetURL) break;
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await delay(2000);
    }

    if (!targetURL) {
      console.log("⚠️ Tidak ada notifikasi baru yang valid.");
      return false;
    }

    console.log(`🎯 Target dari: ${targetUser}`);
    console.log(`🌐 URL Target: ${targetURL}`);

    // ✅ Buka target komentar
    await page.goto(targetURL, { waitUntil: "networkidle2" });
    await delay(5000);

    // ✅ Ambil semua komentar
    const comments = await page.$$eval("div[role='article']", els =>
      els.map((e, i) => ({
        index: i,
        user: e.querySelector("span[dir='auto']")?.innerText || "",
        text: e.innerText || "",
        html: e.outerHTML
      }))
    );
    fs.writeFileSync(dumpPath, comments.map(c => `<p><b>${c.user}</b>: ${c.html}</p>`).join("\n"), "utf-8");
    console.log(`📌 Semua komentar terdeteksi: ${comments.length}`);

    // ✅ Deteksi komentar target (selain milik login)
    let targetComment = comments.find(c => c.user && c.user.toLowerCase() !== loginName.toLowerCase());
    if (!targetComment && comments.length > 0) targetComment = comments[0];

    if (!targetComment) {
      console.log("⏭️ Tidak ada komentar valid yang bisa dibalas.");
      return false;
    }
    console.log(`💬 Komentar target dari ${targetComment.user}: "${targetComment.text}"`);

    // ✅ Anti-spam dengan hash
    const commentID = crypto.createHash("sha1").update(targetComment.text).digest("hex");
    if (isLogged(targetURL, commentID)) {
      console.log("⏭️ Komentar ini sudah dibalas sebelumnya.");
      return false;
    }

    // ✅ Deteksi stiker/emoticon
    const matchEmoji = targetComment.html.match(/<img[^>]+alt="([^"]+)"/i);
    const isSticker = /stiker|sticker/i.test(targetComment.text) || !!matchEmoji;

    // ✅ Balasan AI
    let replyText;
    if (isSticker) {
      const emoji = matchEmoji ? matchEmoji[1] : "😊";
      replyText = await getAIComment(`Balas komentar ramah untuk stiker/emoji: ${emoji}`);
    } else {
      replyText = await getAIComment(targetComment.text);
    }

    if (!replyText) {
      console.log("❌ Gagal mendapatkan balasan AI.");
      return false;
    }
    console.log(`🤖 Balasan AI: ${replyText}`);

    // ✅ Klik tombol "Balas"
    const buttons = await page.$$("div[role='article'] div[role='button']");
    let clicked = false;
    for (const btn of buttons) {
      const label = await btn.evaluate(el => el.innerText.trim());
      if (label === "Balas") {
        await btn.evaluate(el => el.click());
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log("❌ Tidak menemukan tombol Balas.");
      return false;
    }

    await delay(1500);

    // ✅ Ketik balasan
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
    saveLog(targetURL, commentID);
    return true;

  } catch (err) {
    console.log(`❌ ERROR auto_replay: ${err.message}`);
    return false;
  } finally {
    if (localBrowser) await localBrowser.close();
    else if (browser) await browser.close();
  }
}

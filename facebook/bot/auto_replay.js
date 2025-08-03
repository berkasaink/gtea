import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { getAIComment } from "../modules/openai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, "../logs/auto_replay.log");
const dumpPath = path.resolve(__dirname, "../logs/comments_dump.html");

let logData = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8") || "[]") : [];
const saveLog = id => { if (!logData.includes(id)) { logData.push(id); if (logData.length > 2000) logData = logData.slice(-2000); fs.writeFileSync(logPath, JSON.stringify(logData, null, 2)); } };
const isLogged = id => logData.includes(id);
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function autoReplay(page, browser = null) {
  console.log("👤 Nama akun login terdeteksi: ME");
  console.log("[WAIT] Membuka notifikasi Facebook...");

  await page.goto("https://www.facebook.com/notifications", { waitUntil: "networkidle2" });
  await delay(5000);

  let targetURL = null;
  let targetUser = null;

  // ✅ Scroll notifikasi hingga 10x
  for (let i = 1; i <= 10; i++) {
    console.log(`[WAIT] Scrolling notifikasi... (${i}/10)`);

    const notifElements = await page.$$eval("a[href*='comment_id']", els =>
      els.map(el => ({ text: el.innerText, href: el.href }))
    );

    for (const notif of notifElements) {
      const match = notif.text.match(/([A-Za-z0-9 ._-]+)\s+(?:menyebut|menandai)\s+anda/i);
      if (match) {
        targetUser = match[1].trim();
        targetURL = notif.href;
        break;
      }
    }
    if (targetURL) break;

    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await delay(3000);
  }

  if (!targetURL) {
    console.log("⚠️ Tidak ada mention ditemukan.");
    if (browser) await browser.close();
    return false;
  }

  console.log(`🎯 Target mention dari: ${targetUser}`);
  console.log(`🌐 URL: ${targetURL}`);

  // ✅ Buka halaman target
  await page.goto(targetURL, { waitUntil: "networkidle2" });
  await delay(5000);

  // ✅ Ambil semua komentar dengan innerHTML
  const comments = await page.$$eval("div[aria-label='Komentar']", els =>
    els.map(e => ({
      html: e.innerHTML,
      user: e.querySelector("strong")?.innerText || "",
      text: e.innerText || ""
    }))
  );

  // 🔥 Dump semua komentar ke file untuk debug
  fs.writeFileSync(dumpPath, comments.map(c => `<p><b>${c.user}</b>: ${c.html}</p>`).join("\n"), "utf-8");
  console.log(`📝 Dump HTML komentar ke ${dumpPath}`);
  console.log(`📌 Semua komentar terdeteksi: ${comments.length}`);

  // ✅ Filter hanya komentar targetUser yang mention "ME"
  const filtered = comments.filter(c =>
    c.user.toLowerCase().includes(targetUser.toLowerCase()) &&
    /@?ME|href="\/me/i.test(c.html) // deteksi mention
  );

  if (!filtered.length) {
    console.log("⏭️ Tidak ada komentar target yang mention ME.");
    return false;
  }

  // ✅ Ambil komentar terakhir
  const latest = filtered[filtered.length - 1];
  const commentID = crypto.createHash("sha1").update(latest.text).digest("hex");

  if (isLogged(commentID)) {
    console.log("⏭️ Komentar ini sudah dibalas sebelumnya.");
    return false;
  }

  console.log(`💬 Komentar terbaru dari ${targetUser}: "${latest.text}"`);

  // ✅ Ambil balasan AI
  const replyText = await getAIComment(latest.text);
  if (!replyText || replyText.startsWith("[AI_ERROR")) {
    console.log("❌ Gagal mendapatkan balasan AI.");
    return false;
  }
  console.log(`🤖 Balasan AI: ${replyText}`);

  // ✅ Klik tombol balas
  try {
    const btnReply = await page.$x("//span[contains(text(),'Balas')]");
    if (btnReply.length > 0) await btnReply[0].click();
    await delay(2000);

    const inputBox = await page.$("div[contenteditable='true']");
    if (!inputBox) {
      console.log("❌ Kolom balasan tidak ditemukan.");
      return false;
    }

    await inputBox.focus();
    await page.keyboard.type(replyText, { delay: 80 });
    await delay(1500);
    await page.keyboard.press("Enter");
    await delay(3000);

    console.log("✅ Balasan berhasil dikirim!");
    saveLog(commentID);
    return true;

  } catch (err) {
    console.log(`❌ ERROR kirim balasan: ${err.message}`);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

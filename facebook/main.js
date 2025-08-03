// main.js hanya untuk test auto_replay.js
import { launchBrowser } from "./modules/browser.js";
import { autoReplay } from "./bot/auto_replay.js";

(async () => {
  console.log("[TEST] Menjalankan auto_replay.js Fix 40!");

  const { browser, page } = await launchBrowser();
  const success = await autoReplay(page, browser);

  if (success) {
    console.log("\x1b[32m[SUKSES] auto_replay berhasil dijalankan!\x1b[0m");
  } else {
    console.log("\x1b[31m[GAGAL] auto_replay tidak berjalan dengan baik.\x1b[0m");
  }
})();

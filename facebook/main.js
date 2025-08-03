const { launchBrowser } = require('./modules/browser.js');
const { autoReplay } = require('./bot/auto_replay.js');

(async () => {
  console.log('[TEST] Menjalankan auto_replay.js Fix 41');
  
  const { browser, page } = await launchBrowser();

  try {
    const success = await autoReplay(page, browser);
    if (success) {
      console.log('\x1b[32m[SUKSES] auto_replay berhasil dijalankan!\x1b[0m');
    } else {
      console.log('\x1b[31m[GAGAL] auto_replay tidak menemukan komentar untuk dibalas.\x1b[0m');
    }
  } catch (err) {
    console.error('\x1b[31m[ERROR] auto_replay gagal:\x1b[0m', err.message);
  } finally {
    await browser.close();
  }
})();

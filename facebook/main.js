// main.js hanya untuk test auto_komen.js
const { launchBrowser } = require('./modules/browser.js');
const { autoComment } = require('./bot/auto_komen.js');

(async () => {
  console.log('[TEST] Menjalankan auto_komen.js Fix 2!');
  const { browser, page } = await launchBrowser();

  const success = await autoComment(page);
  if (success) {
    console.log('\x1b[32m[SUKSES] auto_komen berhasil dijalankan!\x1b[0m');
  } else {
    console.log('\x1b[31m[GAGAL] auto_komen tidak berjalan dengan baik.\x1b[0m');
  }

  await browser.close();
})();

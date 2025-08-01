// index.js fix 09D - Auto Start Bot Setelah Login Valid
const { launchBrowser } = require('./modules/browser.js');
const { autoComment } = require('./bot/auto_komen.js');
const { autoReplay } = require('./bot/auto_replay.js');
const { autoLike } = require('./bot/auto_like.js');
const { autoVisit } = require('./bot/auto_visit.js');

const delay = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

(async () => {
  console.clear();
  console.log('\x1b[36m[INFO] Memulai Facebook Bot Fix 09D...\x1b[0m');

  const { browser, page } = await launchBrowser();
  console.log('\x1b[32m[BOT] Browser siap, memulai aksi...\x1b[0m');

  const actions = [
    { name: 'auto_komen', fn: autoComment },
    { name: 'auto_replay', fn: autoReplay },
    { name: 'auto_like', fn: autoLike },
    { name: 'auto_visit', fn: autoVisit }
  ];

  while (true) {
    try {
      const action = actions[Math.floor(Math.random() * actions.length)];
      console.log(`\x1b[36m[BOT] Menjalankan aksi: ${action.name}\x1b[0m`);

      const success = await action.fn(page);

      if (success) {
        console.log(`\x1b[32m[SUKSES] ${action.name} selesai.\x1b[0m`);
        const d = randomDelay(5000, 30000);
        console.log(`[DELAY] Tunggu ${d / 1000} detik sebelum aksi berikutnya...`);
        await delay(d);
      } else {
        console.log(`\x1b[31m[GAGAL] ${action.name} gagal, retry cepat...\x1b[0m`);
        await delay(2000);
      }

    } catch (err) {
      console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
      await delay(3000);
    }
  }
})();

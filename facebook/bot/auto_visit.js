// bot/auto_visit.js fix 09D
const { logAction } = require('../modules/logger.js');

async function autoVisit(page) {
  try {
    console.log('[auto_visit] Mengunjungi profil random...');
    await page.goto('https://www.facebook.com/friends', { waitUntil: 'networkidle2' });

    const profileSelector = 'a[href*="profile.php"], a[href*="/people/"]';
    await page.waitForSelector(profileSelector, { timeout: 10000 });

    const profiles = await page.$$eval(profileSelector, links =>
      [...new Set(links.map(a => a.href))].slice(0, 5)
    );
    if (!profiles.length) throw new Error('Tidak ada profil ditemukan');

    const target = profiles[Math.floor(Math.random() * profiles.length)];
    await page.goto(target, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    console.log(`[auto_visit] Mengunjungi profil: ${target}`);
    await logAction('auto_visit', `Visit profil: ${target}`);

    return true;

  } catch (err) {
    console.log(`[auto_visit] ERROR: ${err.message}`);
    return false;
  }
}

module.exports = { autoVisit };

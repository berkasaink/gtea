// bot/auto_replay.js fix 09D
const { getAIComment } = require('../modules/openrouter.js');
const { logAction } = require('../modules/logger.js');

async function autoReplay(page) {
  try {
    console.log('[auto_replay] Mengecek notifikasi komentar terbaru...');
    await page.goto('https://www.facebook.com/notifications', { waitUntil: 'networkidle2' });

    const notifSelector = 'a[href*="comment_id"]';
    await page.waitForSelector(notifSelector, { timeout: 10000 });

    const notifLinks = await page.$$eval(notifSelector, links =>
      links.map(a => a.href).slice(0, 10)
    );
    if (!notifLinks.length) throw new Error('Tidak ada komentar untuk dibalas');

    for (const link of notifLinks) {
      await page.goto(link, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(2000);

      const lastCommentSelector = 'div[aria-label="Balas"]';
      const comments = await page.$$(lastCommentSelector);
      if (!comments.length) continue;

      const target = comments[comments.length - 1];
      const text = await page.evaluate(el => el.innerText, target);
      console.log(`[auto_replay] Target balasan: ${text.slice(0, 80)}...`);

      const reply = await getAIComment(text);
      console.log(`[auto_replay] Balasan AI: ${reply}`);

      await target.click({ clickCount: 1 });
      await page.keyboard.type(reply, { delay: 50 });
      await page.keyboard.press('Enter');

      await logAction('auto_replay', `Balas: ${reply}`);
      return true;
    }

    return false;

  } catch (err) {
    console.log(`[auto_replay] ERROR: ${err.message}`);
    return false;
  }
}

module.exports = { autoReplay };

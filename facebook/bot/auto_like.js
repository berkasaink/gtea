// bot/auto_like.js fix 09D
const { logAction } = require('../modules/logger.js');

async function autoLike(page) {
  try {
    console.log('[auto_like] Mencari postingan terbaru untuk di-like...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });

    const postSelector = 'div[data-pagelet^="FeedUnit_"]:not([data-ad-preview])';
    await page.waitForSelector(postSelector, { timeout: 10000 });
    const posts = await page.$$(postSelector);
    if (!posts.length) throw new Error('Tidak ada postingan untuk like');

    const post = posts[0];
    await post.scrollIntoView();
    await page.waitForTimeout(1500);

    const likeButton = await post.$('div[aria-label="Suka"], div[aria-label="Like"]');
    if (!likeButton) throw new Error('Tombol Like tidak ditemukan');

    await likeButton.click();
    console.log('[auto_like] Sukses Like postingan');
    await logAction('auto_like', 'Like postingan');

    return true;

  } catch (err) {
    console.log(`[auto_like] ERROR: ${err.message}`);
    return false;
  }
}

module.exports = { autoLike };

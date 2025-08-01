const fs = require('fs');
const path = require('path');
const { getAIComment } = require('../modules/openrouter.js');
const { logAction } = require('../modules/logger.js');

const HISTORY_FILE = path.resolve(__dirname, '../logs/commented_posts.json');

const POST_SELECTORS = [
  'div[role="article"]',
  'article[role="article"]',
  'div[data-pagelet^="FeedUnit_"]'
];

const TEXT_SELECTORS = [
  'div[dir="auto"] span',
  'div[role="article"] p',
  'span[dir="auto"]',
  'span[lang]',
  'div.story_body_container',
  'div[data-testid="post_message"]',
  'div[data-ad-preview="message"]',
  'div[data-ad-comet-preview="message"]'
];

const COMMENT_BOX_SELECTORS = [
  'div[aria-label="Tulis komentar"]',
  'div[aria-label="Write a comment"]',
  'div[contenteditable="true"][data-lexical-editor="true"]',
  'div[role="textbox"][contenteditable="true"]',
  'div[data-lexical-text="true"][contenteditable="true"]',
  'div.notranslate[contenteditable="true"]'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min = 2000, max = 4000) { return sleep(Math.floor(Math.random() * (max - min) + min)); }

function loadHistory() {
  return fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) : [];
}

function saveHistory(postId) {
  const h = loadHistory();
  if (!h.some(p => p.id === postId)) {
    h.push({ id: postId, time: Date.now() });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h.slice(-500), null, 2));
  }
}

// ✅ Ambil teks posting dengan log debug
async function extractText(post) {
  for (let s of TEXT_SELECTORS) {
    const text = await post.$eval(s, el => el.innerText.trim()).catch(() => '');
    if (text && text.length > 5) return text;
  }
  const debug = await post.evaluate(el => el.innerHTML.slice(0, 40)).catch(() => 'no-html');
  return `[NO_TEXT:${debug}]`;
}

// ✅ Ambil ID unik posting
async function getPostId(post) {
  return await post.evaluate(el => {
    let ft = el.getAttribute('data-ft') || '';
    let m = ft.match(/"top_level_post_id":"(\d+)"/);
    if (m) return m[1];
    let link = el.querySelector('a[href*="story_fbid"],a[href*="permalink"]');
    if (link) {
      let url = link.href;
      let id = url.match(/story_fbid=(\d+)/) || url.match(/permalink\/(\d+)/);
      if (id) return id[1];
    }
    return 'p_' + Math.random().toString(36).slice(2);
  });
}

// ✅ Klik tombol komentar
async function clickCommentButton(post) {
  try {
    const btn = await post.$('div[aria-label="Komentar"],div[aria-label="Comment"]');
    if (btn) { await btn.click(); await randomDelay(); return true; }
    return false;
  } catch { return false; }
}

// ✅ Cari kolom komentar spesifik
async function findCommentBox(page) {
  for (let sel of COMMENT_BOX_SELECTORS) {
    try {
      const box = await page.waitForSelector(sel, { timeout: 4000 });
      if (box) return box;
    } catch {}
  }
  return null;
}

// ✅ Ketik komentar
async function typeComment(page, box, text) {
  try {
    await box.focus();
    await page.keyboard.type(text, { delay: 60 });
    await page.keyboard.press('Enter');
    await sleep(1500);
    return true;
  } catch { return false; }
}

// ✅ Cek semua rule skip
async function shouldSkip(post, postId, content, commented) {
  const rules = [
    { check: () => commented.has(postId), reason: 'Sudah dikomentari' },
    { check: () => content.startsWith('[NO_TEXT'), reason: 'Tidak ada teks' },
    { check: async () => await post.evaluate(el => el.innerText.includes('Disponsori') || el.innerText.includes('Sponsored')), reason: 'Iklan' },
    { check: async () => await post.evaluate(el => el.innerText.includes('Anda') || el.innerText.includes('Your profile')), reason: 'Postingan sendiri' },
    { check: async () => {
        let t = await post.$eval('a abbr,a time', el => el.getAttribute('datetime')).catch(() => null);
        return t && (Date.now() - new Date(t).getTime()) / 3600000 >= 24;
      }, reason: 'Postingan lama' }
  ];

  for (const r of rules) {
    const res = r.check.constructor.name === 'AsyncFunction' ? await r.check() : r.check();
    if (res) return r.reason;
  }
  return null;
}

// ✅ MAIN
async function autoComment(page, browser) {
  console.log('[TEST] Menjalankan auto_komen.js Fix 21');
  let sessionDone = false;

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[WAIT] Memuat beranda Facebook...');
    await randomDelay();

    const history = loadHistory();
    const commented = new Set(history.map(p => p.id));
    let count = 0;

    for (let batch = 0; batch < 10; batch++) {
      console.log(`[WAIT] Scrolling batch ${batch + 1}...`);
      await page.evaluate(() => window.scrollBy(0, 2000));
      await randomDelay();

      const posts = await page.$$(POST_SELECTORS.join(','));
      console.log(`🔍 Batch ${batch + 1}: ${posts.length} postingan ditemukan`);

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await randomDelay();

        const postId = await getPostId(post);
        const content = await extractText(post);

        const skip = await shouldSkip(post, postId, content, commented);
        if (skip) { console.log(`⏭️ [${batch + 1}-${i + 1}] ${skip}`); continue; }

        console.log(`🎯 [${batch + 1}-${i + 1}] ${content.slice(0, 60)}...`);
        const aiComment = await getAIComment(content);
        console.log(`💬 ${aiComment}`);

        // Klik komentar → pastikan kolom terbuka untuk posting ini
        const clicked = await clickCommentButton(post);
        if (!clicked) console.log(`⚠️ [${batch + 1}-${i + 1}] Tombol komentar tidak ditemukan`);

        const box = await findCommentBox(page);
        if (!box) { console.log(`⚠️ [${batch + 1}-${i + 1}] Kolom komentar tidak ditemukan`); continue; }

        const success = await typeComment(page, box, aiComment);
        if (success) {
          console.log(`✅ Komentar berhasil dikirim ke postingan [${batch + 1}-${i + 1}]`);
          saveHistory(postId);
          commented.add(postId);
          await logAction('auto_komen', aiComment);
          count++;
          await randomDelay();

          if (count >= 2) {
            console.log('✅ Sesi selesai.');
            console.log('[SUKSES] auto_komen berhasil dijalankan!');
            sessionDone = true;
            if (browser) await browser.close();
            return true;
          }
        } else {
          console.log(`❌ [${batch + 1}-${i + 1}] Gagal mengetik komentar`);
        }
      }
    }

    console.log('✅ Tidak ada postingan valid atau semua sudah dikomentari.');
    if (!sessionDone) console.log('[SUKSES] auto_komen berhasil dijalankan!');
    if (browser) await browser.close();
    return true;

  } catch (e) {
    console.log(`❌ ERROR: ${e.message}`);
    if (browser) await browser.close();
    return false;
  }
}

module.exports = { autoComment };

// modules/browser.js fix 09D
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const COOKIE_PATH = path.resolve(__dirname, '../cookies.json');
const delay = ms => new Promise(r => setTimeout(r, ms));

const DEVICE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 720 }
};

function enhanceCookies(cookies) {
  const has = n => cookies.some(c => c.name === n);
  if (!has('spin')) cookies.push({ name: 'spin', value: 'r.1000', domain: '.facebook.com', path: '/', secure: true });
  if (!has('sb')) cookies.push({ name: 'sb', value: 'XX' + Math.random().toString(36).substring(2,10), domain: '.facebook.com', path: '/', secure: true });
  if (!has('wd')) cookies.push({ name: 'wd', value: '1280x720', domain: '.facebook.com', path: '/', secure: true });
  if (!has('presence')) cookies.push({ name: 'presence', value: 'C{"t3":[],"utc3":' + Date.now() + '}', domain: '.facebook.com', path: '/', secure: true });
  return cookies;
}

async function saveCookies(page) {
  let cookies = await page.cookies();
  cookies = enhanceCookies(cookies);
  fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  console.log(`\x1b[36m[COOKIE] Cookies baru disimpan & fingerprint sinkron.\x1b[0m`);
}

async function loadCookies(page) {
  if (!fs.existsSync(COOKIE_PATH)) {
    console.log('\x1b[31m[COOKIE] cookies.json tidak ditemukan. Login manual dibutuhkan.\x1b[0m');
    return false;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    const cookies = enhanceCookies(raw);
    await page.setCookie(...cookies);
    console.log(`\x1b[32m[COOKIE] ${cookies.length} cookies diterapkan.\x1b[0m`);
    return true;
  } catch (err) {
    console.log(`\x1b[31m[COOKIE] Gagal load cookies: ${err.message}\x1b[0m`);
    return false;
  }
}

// ✅ Perbaikan deteksi login untuk UI Facebook 2025
async function checkLogin(page) {
  try {
    return await page.evaluate(() => {
      return !!(
        document.querySelector('div[role="feed"]') ||
        document.querySelector('div[data-pagelet^="FeedUnit_"]') ||
        document.querySelector('a[aria-label*="Profil"]') ||
        document.querySelector('a[aria-label*="Profile"]') ||
        document.querySelector('div[aria-label="Menu"]')
      );
    });
  } catch {
    return false;
  }
}

async function launchBrowser() {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: DEVICE.viewport,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-notifications',
        '--disable-popup-blocking'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEVICE.userAgent);

    const context = browser.defaultBrowserContext();
    await context.overridePermissions("https://www.facebook.com", []);

    page.on('dialog', async dialog => {
      console.log(`\x1b[33m[POPUP] Dialog diblokir: ${dialog.message()}\x1b[0m`);
      await dialog.dismiss();
    });

    await loadCookies(page);
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

    // ✅ Ulangi cek login beberapa kali
    let tries = 0, logged = false;
    while (tries < 5) {
      if (await checkLogin(page)) { logged = true; break; }
      tries++;
      console.log(`[LOGIN] Cek login ulang (${tries})...`);
      await delay(3000);
    }

    if (logged) {
      console.log('\x1b[32m[LOGIN] Deteksi beranda FB sukses, login valid.\x1b[0m');
    } else {
      console.log('\x1b[33m[LOGIN] Tidak menemukan feed, lanjut pakai sesi manual jika ada.\x1b[0m');
    }

    await saveCookies(page);
    return { browser, page };

  } catch (err) {
    console.log(`\x1b[31m[FATAL] Browser gagal diluncurkan: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

module.exports = { launchBrowser };

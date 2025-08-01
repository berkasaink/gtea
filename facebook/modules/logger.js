// modules/logger.js fix 09D
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getTimestamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').split('.')[0];
}

function logAction(moduleName, message) {
  try {
    const file = path.join(LOG_DIR, `${moduleName}.log`);
    const line = `[${getTimestamp()}] ${message}\n`;

    // Tulis log baru
    fs.appendFileSync(file, line, 'utf8');

    // Baca semua log
    const logs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

    // Hapus jika lebih dari 1000 baris
    if (logs.length > 1000) {
      const trimmed = logs.slice(logs.length - 1000).join('\n') + '\n';
      fs.writeFileSync(file, trimmed, 'utf8');
      console.log(`\x1b[33m[LOGGER] Log ${moduleName} >1000, otomatis dipangkas.\x1b[0m`);
    }
  } catch (err) {
    console.log(`\x1b[31m[LOGGER] Gagal menulis log: ${err.message}\x1b[0m`);
  }
}

module.exports = { logAction };

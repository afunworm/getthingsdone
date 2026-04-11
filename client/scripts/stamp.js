const fs   = require('fs');
const path = require('path');

const GEN_DIR    = path.join(__dirname, '..', 'src', 'generated');
const STAMP_FILE = path.join(GEN_DIR, 'build-time.ts');
const time       = new Date().toLocaleTimeString();

fs.mkdirSync(GEN_DIR, { recursive: true });
fs.writeFileSync(STAMP_FILE, `// Auto-generated — do not edit\nexport const BUILD_TIME = '${time}';\n`);
process.stdout.write(`[build-time] ${time}\n`);

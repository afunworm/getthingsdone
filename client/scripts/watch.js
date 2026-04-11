/**
 * Dev watch wrapper.
 * - Writes src/generated/build-time.ts before starting.
 * - Updates it whenever any source file changes (but ignores changes to the
 *   generated file itself to avoid infinite rebuild loops).
 * - Spawns `ng build --watch` as a child process.
 */

const chokidar = require('chokidar');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const GEN_DIR     = path.join(ROOT, 'src', 'generated');
const STAMP_FILE  = path.join(GEN_DIR, 'build-time.ts');

function writeTimestamp() {
  const time = new Date().toLocaleTimeString();
  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.writeFileSync(STAMP_FILE, `// Auto-generated — do not edit\nexport const BUILD_TIME = '${time}';\n`);
  process.stdout.write(`[build-time] ${time}\n`);
}

// Initial stamp
writeTimestamp();

// Clear Angular's incremental build cache so the new timestamp is always picked up
const cacheDir = path.join(ROOT, '.angular', 'cache');
try { execSync(`npx rimraf "${cacheDir}"`, { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}

// Start ng build --watch
const ng = spawn(
  'npx ng build --watch --configuration development',
  [],
  { stdio: 'inherit', cwd: ROOT, shell: true },
);
ng.on('close', code => process.exit(code ?? 0));

// Update stamp whenever a source file (not the stamp itself) changes
let debounce = null;
chokidar
  .watch(path.join(ROOT, 'src', '**', '*.{ts,scss,html}'), {
    ignored:        STAMP_FILE,
    ignoreInitial:  true,
    persistent:     true,
  })
  .on('change', () => {
    clearTimeout(debounce);
    debounce = setTimeout(writeTimestamp, 250);
  });

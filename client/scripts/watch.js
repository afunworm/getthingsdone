/**
 * Dev watch wrapper — spawns `ng build --watch`.
 * Clears Angular's incremental build cache on start to avoid stale output.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Clear Angular's incremental build cache
const cacheDir = path.join(ROOT, '.angular', 'cache');
try { execSync(`npx rimraf "${cacheDir}"`, { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}

// Start ng build --watch
const ng = spawn(
  'npx ng build --watch --configuration development',
  [],
  { stdio: 'inherit', cwd: ROOT, shell: true },
);
ng.on('close', code => process.exit(code ?? 0));

/* Ensure Electron runs with its APIs available even if ELECTRON_RUN_AS_NODE is set globally. */
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const env = { ...process.env };

/* Clear flags that force Electron into Node-only mode. */
delete env.ELECTRON_RUN_AS_NODE;

/* Step 1: build renderer/main/preload bundles. */
const build = spawnSync('pnpm', ['run', 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

/* Step 2: launch Electron with sanitized env. */
const electronPath = require('electron');
const mainPath = path.join(projectRoot, 'dist', 'main.js');
const child = spawn(electronPath, [mainPath, '--remote-debugging-port=9222'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env
});

child.on('exit', code => process.exit(code ?? 0));

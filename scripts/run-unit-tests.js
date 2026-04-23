const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const outdir = path.join('tmp', 'tests');
fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const outfile = path.join(outdir, 'flowData.test.cjs');
esbuild.buildSync({
  entryPoints: ['test/flowData.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  target: 'node20',
  external: ['node:test', 'node:assert/strict']
});

execFileSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });

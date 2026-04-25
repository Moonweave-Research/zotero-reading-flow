const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const outdir = path.join('tmp', 'tests');
fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const testFiles = fs.readdirSync('test')
  .filter((file) => file.endsWith('.test.ts'))
  .sort();

const outfiles = testFiles.map((file) => {
  const outfile = path.join(outdir, file.replace(/\.ts$/, '.cjs'));
  esbuild.buildSync({
    entryPoints: [path.join('test', file)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    target: 'node20',
    external: ['node:test', 'node:assert/strict']
  });
  return outfile;
});

execFileSync(process.execPath, ['--test', ...outfiles], { stdio: 'inherit' });

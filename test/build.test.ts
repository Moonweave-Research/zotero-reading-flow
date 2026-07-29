import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const XPI_PATH = 'zotero-reading-flow.xpi';

function xpiHash() {
  return createHash('sha256').update(readFileSync(XPI_PATH)).digest('hex');
}

function buildXpi(timeZone?: string) {
  execFileSync(process.execPath, ['build.js'], {
    stdio: 'pipe',
    env: timeZone ? { ...process.env, TZ: timeZone } : process.env
  });
  return xpiHash();
}

test('build produces a byte-identical XPI at different wall-clock times', { timeout: 20_000 }, async () => {
  const firstHash = buildXpi();
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const secondHash = buildXpi();

  assert.equal(secondHash, firstHash);
  assert.equal(buildXpi('Pacific/Honolulu'), firstHash);
  assert.equal(buildXpi('Asia/Seoul'), firstHash);
});

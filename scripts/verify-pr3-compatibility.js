// Execute unmodified, pinned v1.3.6 writer source against the current writer.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const BASELINE = '9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f';
function item(extra = '') {
  let value = extra, saves = 0, sets = 0;
  return { id: 1001, getField: () => value,
    setField(field, next) { assert.equal(field, 'extra'); value = next; sets++; },
    async saveTx() { saves++; },
    get saves() { return saves; }, get sets() { return sets; } };
}
(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-flow-pr3-'));
  global.Zotero = { debug() {}, Prefs: { get() { return false; } } };
  try {
    const baselineDir = path.join(dir, 'baseline'); mkdirSync(baselineDir);
    assert.equal(execFileSync('git', ['rev-parse', BASELINE], { encoding: 'utf8' }).trim(), BASELINE);
    assert.equal(JSON.parse(execFileSync('git', ['show', `${BASELINE}:package.json`], { encoding: 'utf8' })).version, '1.3.6');
    for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
      writeFileSync(path.join(baselineDir, `${name}.ts`), execFileSync('git', ['show', `${BASELINE}:src/${name}.ts`]));
    }
    for (const [entry, outfile] of [[path.join(baselineDir, 'dataStore.ts'), 'old.cjs'], [path.resolve('src/dataStore.ts'), 'new.cjs']]) {
      esbuild.buildSync({ entryPoints: [entry], outfile: path.join(dir, outfile), bundle: true, platform: 'node', format: 'cjs' });
    }
    const Old = require(path.join(dir, 'old.cjs')).DataStore;
    const New = require(path.join(dir, 'new.cjs')).DataStore;
    // Positive control: old writer can write ordinary supported v2 metadata.
    const positive = item('Custom: retained\nReadingFlow: {"v":2,"p":{},"s":"read"}');
    assert.equal(await new Old().setStatus(positive, 'reading', 200), true);
    assert.equal(positive.saves, 1);
    const operations = [
      ['updateData', (s, i) => s.updateData(i, { s: 'skimmed' })],
      ['setStatus', (s, i) => s.setStatus(i, 'to-read', 300)],
      ['clearManualStatus', (s, i) => s.clearManualStatus(i)],
      ['resetProgress', (s, i) => s.resetProgress(i, 300)],
      ['restartAsToRead', (s, i) => s.restartAsToRead(i, 300)],
      ['initializeStatusIfUnowned', (s, i) => s.initializeStatusIfUnowned(i, 'read', 300)],
      ['recordProgress', (s, i) => s.recordProgress(i, { attachmentId: 'pdf', progress: 0.8, lastPage: 8, pageCount: 10, at: 300 })],
      ['queuedProgress', (s, i) => s.recordProgressUnlessResetAfter(i, { attachmentId: 'pdf', progress: 0.9, at: 300 }, 250)]
    ];
    let refusals = 0;
    for (const important of [true, false]) {
      const fixture = item('Custom: retained\nReadingFlow: {"v":2,"p":{"pdf":0.5},"s":"read","lastAttachmentId":"pdf","lastPage":5,"lastReadAt":100}');
      const current = new New();
      assert.equal(await current.setImportant(fixture, true, 200), true);
      if (!important) assert.equal(await current.setImportant(fixture, false, 201), true);
      const bytes = fixture.getField();
      const payload = JSON.parse(bytes.split('ReadingFlow: ')[1]);
      assert.equal(payload.v, 3); assert.equal(payload.s, 'read'); assert.equal(payload.important, important);
      // Simulated sync copies exact Extra between clients. Every old mutation path must refuse without even setting Extra.
      for (const [name, mutate] of operations) {
        const oldItem = item(bytes), oldStore = new Old();
        oldStore.getData(oldItem); // old display is deliberately not promised
        assert.equal(oldItem.saves, 0);
        assert.equal(await mutate(oldStore, oldItem), false, name);
        assert.equal(oldItem.getField(), bytes, name);
        assert.equal(oldItem.saves, 0, name); assert.equal(oldItem.sets, 0, name); refusals++;
        const returned = new New().getData(oldItem);
        assert.equal(returned.s, 'read'); assert.equal(returned.important, important);
      }
      // Guard sensitivity control: the SAME old status writer succeeds when only version is downgraded.
      const downgraded = item(bytes.replace('"v":3', '"v":2'));
      assert.equal(await new Old().setStatus(downgraded, 'to-read', 400), true);
      assert.equal(JSON.parse(downgraded.getField().split('ReadingFlow: ')[1]).important, undefined);
      // A second supported client preserves the independent flag through status and PDF writes.
      const peer = new New();
      assert.equal(await peer.setStatus(fixture, 'skimmed', 500), true);
      assert.equal(await peer.recordProgress(fixture, { attachmentId: 'pdf', progress: 0.9, at: 600 }), true);
      const reread = new New().getData(fixture);
      assert.equal(reread.v, 3); assert.equal(reread.important, important); assert.equal(reread.s, 'skimmed');
    }
    console.log(`PR3 compatibility PASS: baseline ${BASELINE}; ${refusals} old-writer refusals, byte retention, v2 positive and version-guard sensitivity controls, supported-client round trips.`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

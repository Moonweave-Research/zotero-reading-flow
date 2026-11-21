// Previous writers must refuse newer records instead of erasing their metadata.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const BASELINE = '1237948a8b97cce8f1b10ae0172cd711ec95484b';
const V4_BASELINE = '0ffef7f41ce65cddeb00b6c7bd34ebcdf43d1938';
const dir = path.resolve('tmp', 'bookmark-compatibility');
fs.mkdirSync(dir, { recursive: true });
function item(payload) {
  let extra = `Custom: keep\nReadingFlow: ${JSON.stringify(payload)}`, saves = 0;
  return { id: 42, getField: () => extra, setField: (_, value) => { extra = value; }, saveTx: async () => { saves++; }, get saves() { return saves; } };
}
(async () => {
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
    fs.writeFileSync(path.join(dir, `${name}.ts`), execFileSync('git', ['show', `${BASELINE}:src/${name}.ts`]));
  }
  esbuild.buildSync({entryPoints: [path.join(dir, 'dataStore.ts')], outfile: path.join(dir, 'old.cjs'), bundle: true, platform: 'node'});
  const v4Dir = path.join(dir, 'v4');
  fs.mkdirSync(v4Dir, { recursive: true });
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
    fs.writeFileSync(path.join(v4Dir, `${name}.ts`), execFileSync('git', ['show', `${V4_BASELINE}:src/${name}.ts`]));
  }
  esbuild.buildSync({entryPoints: [path.join(v4Dir, 'dataStore.ts')], outfile: path.join(dir, 'v4.cjs'), bundle: true, platform: 'node'});
  esbuild.buildSync({entryPoints: ['src/dataStore.ts'], outfile: path.join(dir, 'new.cjs'), bundle: true, platform: 'node'});
  const Old = require(path.join(dir, 'old.cjs')).DataStore, V4 = require(path.join(dir, 'v4.cjs')).DataStore, New = require(path.join(dir, 'new.cjs')).DataStore;
  const methods = [s => s.setStatus.bind(s), s => s.setImportant.bind(s), s => s.clearManualStatus.bind(s), s => s.resetProgress.bind(s), s => s.restartAsToRead.bind(s), s => s.recordProgress.bind(s)];
  const values = ['read', true, undefined, undefined, undefined, {attachmentId:'9', progress:.8, at:100}];
  const payload = { v: 4, important: false, p: {'9':.4}, s:'reading', lastAttachmentId:'9', lastPage:4, bookmark:{attachmentKey:'ABCD2345',page:3,pageCount:10,at:1} };
  let refusals = 0;
  for (let i=0;i<methods.length;i++) {
    const target=item(payload), before=target.getField();
    assert.equal(await methods[i](new Old())(target,values[i]),false);
    assert.equal(target.getField(),before); assert.equal(target.saves,0); refusals++;
  }
  const control=item({...payload,v:3,bookmark:undefined});
  assert.equal(await new Old().setStatus(control,'read'),true);
  const peer=item(payload); await new New().clearManualStatus(peer); await new New().setImportant(peer,true);
  assert.deepEqual(new New().getData(peer).bookmark,payload.bookmark);
  const started = { v:5, important:false, p:{'9':.4}, s:'reading', lastAttachmentId:'9', lastPage:4,
    bookmark:{attachmentKey:'ABCD2345',page:3,pageCount:10,at:1}, readingStartedAt:2 };
  let v4Refusals = 0;
  for (let i=0;i<methods.length;i++) {
    const target=item(started), before=target.getField();
    assert.equal(await methods[i](new V4())(target,values[i]),false);
    assert.equal(target.getField(),before); assert.equal(target.saves,0); v4Refusals++;
  }
  const v4Control=item({...payload,v:4});
  assert.equal(await new V4().setStatus(v4Control,'read'),true);
  const v5Peer=item(started); await new New().setImportant(v5Peer,true);
  assert.equal(new New().getData(v5Peer).readingStartedAt,2);
  assert.deepEqual(new New().getData(v5Peer).bookmark,started.bookmark);
  const v1311Dir = path.join(dir, 'v1311');
  fs.mkdirSync(v1311Dir, { recursive: true });
  const previousRelease = 'd00031b8f4ce5fbe527d077bea44312250136d51';
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
    fs.writeFileSync(path.join(v1311Dir, `${name}.ts`), execFileSync('git', ['show', `${previousRelease}:src/${name}.ts`]));
  }
  const previousBundle = path.join(v1311Dir, 'store.cjs');
  esbuild.buildSync({ entryPoints: [path.join(v1311Dir, 'dataStore.ts')], outfile: previousBundle, bundle: true, platform: 'node' });
  const Previous = require(previousBundle).DataStore;
  const ref = 'key:ABCD2345';
  const updated = item(started);
  assert.equal(await new New().recordProgress(updated, { attachmentId: ref, progress: 1, lastPage: 10, pageCount: 10, at: Date.now() }), true);
  const beforeLegacyEdit = new New().getData(updated);
  assert.equal(await new Previous().setStatus(updated, 'read'), true);
  const afterLegacyEdit = new New().getData(updated);
  assert.equal(afterLegacyEdit.lastAttachmentId, ref);
  assert.equal(afterLegacyEdit.lastPage, 10);
  assert.equal(afterLegacyEdit.p[ref], 10);
  assert.equal(afterLegacyEdit.p['9'], started.p['9']);
  assert.deepEqual(afterLegacyEdit.bookmark, started.bookmark);
  for (const [key, day] of Object.entries(beforeLegacyEdit.history.days)) {
    assert.deepEqual(afterLegacyEdit.history.days[key].progress, day.progress);
    assert.equal(afterLegacyEdit.history.days[key].lastReadAt, day.lastReadAt);
  }
  assert.equal(afterLegacyEdit.readingStartedAt, started.readingStartedAt);
  assert.ok(updated.getField().startsWith('Custom: keep\n'));
  const v5Dir = path.join(dir, 'v5');
  fs.mkdirSync(v5Dir, { recursive: true });
  const v1314 = '15de656579983e60400f85620fab32cefc7b1b1b';
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
    fs.writeFileSync(path.join(v5Dir, `${name}.ts`), execFileSync('git', ['show', `${v1314}:src/${name}.ts`]));
  }
  const v5Bundle = path.join(v5Dir, 'store.cjs');
  esbuild.buildSync({ entryPoints: [path.join(v5Dir, 'dataStore.ts')], outfile: v5Bundle, bundle: true, platform: 'node' });
  const V5 = require(v5Bundle).DataStore;
  const snapshotItem = item(started);
  assert.equal(await new New().recordSnapshotOpening(snapshotItem, 100), true);
  const snapshotPayload = JSON.parse(snapshotItem.getField().split('ReadingFlow: ')[1]);
  const oldWrites = methods.map((method, i) => (store, target) => method(store)(target, values[i]));
  oldWrites.push((store, target) => store.setReadingBookmark(target, payload.bookmark),
    (store, target) => store.updateData(target, { s: 'read' }));
  for (const write of oldWrites) {
    const target = item(snapshotPayload), before = target.getField();
    assert.equal(await write(new V5(), target), false);
    assert.equal(target.getField(), before);
    assert.equal(target.saves, 0);
  }
  assert.equal(await new V5().setStatus(item(started), 'read'), true);
  const newPeer = item(snapshotPayload);
  assert.equal(await new New().setStatus(newPeer, 'read'), true);
  assert.equal(new New().getData(newPeer).snapshotOpenedAt, 100);
  assert.deepEqual(new New().getData(newPeer).bookmark, started.bookmark);
  assert.equal(new New().getData(newPeer).readingStartedAt, started.readingStartedAt);
  console.log(`Compatibility PASS: ${oldWrites.length} released 1.3.14-writer refusals for v6 with byte retention; v5 positive control; v6 round trip.`);
  const v6Dir = path.join(dir, 'v6');
  fs.mkdirSync(v6Dir, { recursive: true });
  const v1315 = 'd9b36d5229ecf59b258182a414ca9f62853cbd5d';
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences']) {
    fs.writeFileSync(path.join(v6Dir, `${name}.ts`), execFileSync('git', ['show', `${v1315}:src/${name}.ts`]));
  }
  const v6Bundle = path.join(v6Dir, 'store.cjs');
  esbuild.buildSync({ entryPoints: [path.join(v6Dir, 'dataStore.ts')], outfile: v6Bundle, bundle: true, platform: 'node' });
  const V6 = require(v6Bundle).DataStore;
  const automatic = item({ ...snapshotPayload, s: null });
  assert.equal(await new New().recordAutomaticRead(automatic, { attachmentKey: 'ABCD2345', at: 1000 }), true);
  const completed = JSON.parse(automatic.getField().split('ReadingFlow: ')[1]);
  const v6Writes = [...oldWrites,
    (store, target) => store.recordSnapshotOpening(target, 1000),
    (store, target) => store.recordProgressUnlessResetAfter(target, { attachmentId: '9', progress: .5, at: 1000 }, 1000),
    (store, target) => store.initializeStatusIfUnowned(target, 'read')];
  for (const write of v6Writes) {
    const target = item(completed), before = target.getField();
    assert.equal(await write(new V6(), target), false);
    assert.equal(target.getField(), before); assert.equal(target.saves, 0);
  }
  assert.equal(await new V6().setStatus(item(snapshotPayload), 'read'), true);
  const completionPeer = item(completed);
  assert.equal(await new New().setImportant(completionPeer, true), true);
  assert.deepEqual(new New().getData(completionPeer).automaticRead, completed.automaticRead);
  assert.equal(await new New().clearAutomaticRead(completionPeer), true);
  const cleared = new New().getData(completionPeer);
  assert.equal(cleared.v, 7); assert.equal(cleared.automaticRead, undefined);
  assert.equal(cleared.snapshotOpenedAt, snapshotPayload.snapshotOpenedAt);
  assert.deepEqual(cleared.bookmark, completed.bookmark);
  console.log(`Compatibility PASS: ${v6Writes.length} released 1.3.15-writer refusals for v7 with byte retention; v6 positive control; v7 round trip and clear.`);
  const v7Dir = path.join(dir, 'v7');
  fs.mkdirSync(v7Dir, { recursive: true });
  const v1319 = 'ee753e4d0f624d2d7e4c4da42bb14e578dcf74cf';
  for (const name of ['dataStore', 'flowData', 'lruCache', 'Logger', 'preferences', 'privateRecordStore']) {
    fs.writeFileSync(path.join(v7Dir, `${name}.ts`), execFileSync('git', ['show', `${v1319}:src/${name}.ts`]));
  }
  const v7Bundle = path.join(v7Dir, 'store.cjs');
  esbuild.buildSync({ entryPoints: [path.join(v7Dir, 'dataStore.ts')], outfile: v7Bundle, bundle: true, platform: 'node' });
  const V7 = require(v7Bundle).DataStore;
  const inherited = item({ v: 8, important: false, s: 'to-read', defaultToRead: true, p: {} });
  const beforeInherited = inherited.getField();
  const v7Writes = [...v6Writes, (store, target) => store.clearAutomaticRead(target),
    (store, target) => store.recordAutomaticRead(target, { attachmentKey: 'ABCD2345', at: 1000 })];
  for (const write of v7Writes) assert.equal(await write(new V7(), inherited), false);
  assert.equal(inherited.getField(), beforeInherited);
  assert.equal(inherited.saves, 0);
  assert.equal(await new V7().setStatus(item(completed), 'read'), true);
  assert.equal(await new New().recordSnapshotOpening(inherited, 2000), true);
  assert.equal(new New().getData(inherited).s, null);
  assert.equal(new New().getData(inherited).snapshotOpenedAt, 2000);
  console.log(`Compatibility PASS: ${v7Writes.length} released 1.3.19-writer refusals for v8 with byte retention; v7 positive control; v8 snapshot transition.`);
  console.log('Compatibility PASS: released 1.3.11 preserves keyed positions and daily observations during a manual status edit.');
  console.log(`Compatibility PASS: ${refusals} v3-writer refusals for v4; ${v4Refusals} released v1.3.8-writer refusals for v5, all with exact byte retention; v3/v4 positive controls; v5 round trip.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

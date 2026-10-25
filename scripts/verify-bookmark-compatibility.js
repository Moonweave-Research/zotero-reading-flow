// The previously installed writer must refuse v4 instead of erasing its bookmark.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const BASELINE = '1237948a8b97cce8f1b10ae0172cd711ec95484b';
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
  esbuild.buildSync({entryPoints: ['src/dataStore.ts'], outfile: path.join(dir, 'new.cjs'), bundle: true, platform: 'node'});
  const Old = require(path.join(dir, 'old.cjs')).DataStore, New = require(path.join(dir, 'new.cjs')).DataStore;
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
  console.log(`Bookmark compatibility PASS: ${refusals} old-writer refusals with exact byte retention; v3 positive control; v4 peer round trip.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

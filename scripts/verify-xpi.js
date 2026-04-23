const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const XPI_PATH = 'zotero-reading-flow.xpi';
const UPDATES_PATH = 'updates.json';
const ADDON_ID = 'readingflow@moon.com';
const UPDATE_URL = 'https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/updates.json';
const REQUIRED_FILES = [
  'manifest.json',
  'bootstrap.js',
  'prefs.js',
  'icon.png',
  'locale/en-US/reading-flow.ftl'
];

function fail(message) {
  console.error(`verify-xpi: ${message}`);
  process.exit(1);
}

function unzipList(path) {
  return execFileSync('unzip', ['-Z', '-1', path], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function unzipRead(path, file) {
  return execFileSync('unzip', ['-p', path, file], { encoding: 'utf8' });
}

if (!fs.existsSync(XPI_PATH)) {
  fail(`${XPI_PATH} does not exist. Run npm run build first.`);
}
if (!fs.existsSync(UPDATES_PATH)) {
  fail(`${UPDATES_PATH} does not exist. Run npm run build first.`);
}

const files = unzipList(XPI_PATH);
for (const file of REQUIRED_FILES) {
  if (!files.includes(file)) {
    fail(`missing required file ${file}`);
  }
}

const forbiddenFiles = files.filter((file) =>
  file.startsWith('__MACOSX/')
  || file.includes('.DS_Store')
  || file.startsWith('node_modules/')
  || file.startsWith('src/')
);
if (forbiddenFiles.length) {
  fail(`unexpected files in XPI: ${forbiddenFiles.join(', ')}`);
}

const manifest = JSON.parse(unzipRead(XPI_PATH, 'manifest.json'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (manifest.manifest_version !== 2) {
  fail('manifest_version must be 2 for Zotero bootstrap plugins');
}
if (manifest.version !== pkg.version) {
  fail(`manifest version ${manifest.version} does not match package.json version ${pkg.version}`);
}
if (manifest.applications?.zotero?.id !== ADDON_ID) {
  fail('manifest applications.zotero.id mismatch');
}
if (manifest.applications?.zotero?.update_url !== UPDATE_URL) {
  fail('manifest applications.zotero.update_url should point at the GitHub release updates.json asset');
}
if (!manifest.applications?.zotero?.strict_min_version?.startsWith('9.')) {
  fail('strict_min_version should target Zotero 9');
}
if (!manifest.applications?.zotero?.strict_max_version?.startsWith('9.')) {
  fail('strict_max_version should be constrained to Zotero 9 until tested otherwise');
}

const bootstrap = unzipRead(XPI_PATH, 'bootstrap.js');
for (const symbol of [
  'var install = ReadingFlowBootstrap.install',
  'var startup = ReadingFlowBootstrap.startup',
  'var shutdown = ReadingFlowBootstrap.shutdown',
  'var uninstall = ReadingFlowBootstrap.uninstall',
  'var onMainWindowLoad = ReadingFlowBootstrap.onMainWindowLoad',
  'var onMainWindowUnload = ReadingFlowBootstrap.onMainWindowUnload'
]) {
  if (!bootstrap.includes(symbol)) {
    fail(`bootstrap.js missing exported symbol: ${symbol}`);
  }
}
if (bootstrap.includes('ChromeUtils.import(')) {
  fail('bootstrap.js contains removed ChromeUtils.import() API');
}
if (bootstrap.includes('Zotero.log(')) {
  fail('bootstrap.js contains invalid Zotero.log() call');
}
if (bootstrap.includes('zotero-plugin-toolkit')) {
  fail('bootstrap.js unexpectedly bundles zotero-plugin-toolkit');
}

const prefs = unzipRead(XPI_PATH, 'prefs.js').trim().split('\n');
for (const line of prefs) {
  if (!/^pref\("extensions\.readingflow\.[^"]+", .+\);$/.test(line)) {
    fail(`prefs.js contains non-default-pref line: ${line}`);
  }
}

const updates = JSON.parse(fs.readFileSync(UPDATES_PATH, 'utf8'));
const update = updates.addons?.[ADDON_ID]?.updates?.[0];
if (!update) {
  fail(`updates.json missing addons.${ADDON_ID}.updates[0]`);
}
if (update.version !== manifest.version) {
  fail(`updates.json version ${update.version} does not match manifest version ${manifest.version}`);
}
if (update.update_link !== `https://github.com/Moon-python/zotero-reading-flow/releases/download/v${manifest.version}/${XPI_PATH}`) {
  fail('updates.json update_link should point at the versioned GitHub release XPI asset');
}
const expectedHash = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(XPI_PATH)).digest('hex')}`;
if (update.update_hash !== expectedHash) {
  fail('updates.json update_hash does not match the built XPI');
}
const zotero = update.applications?.zotero;
if (
  zotero?.strict_min_version !== manifest.applications.zotero.strict_min_version
  || zotero?.strict_max_version !== manifest.applications.zotero.strict_max_version
) {
  fail('updates.json Zotero compatibility does not match manifest.json');
}

console.log(`verify-xpi: OK (${files.length} files)`);

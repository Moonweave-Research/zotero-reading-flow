const crypto = require('crypto');
const fs = require('fs');
const { ADDON_ID, UPDATE_URL, XPI_NAME, releaseXpiUrl } = require('./release-config');

const args = parseArgs(process.argv.slice(2));
const tag = args.tag;

if (!tag) {
  fail('missing --tag v<version>');
}

const manifest = readJson('addon/manifest.json');
const packageJson = readJson('package.json');
const version = manifest.version;
if (tag !== `v${version}` || packageJson.version !== version) {
  fail(`tag, manifest, and package versions must agree (tag=${tag}, manifest=${version}, package=${packageJson.version})`);
}
if (!fs.existsSync(XPI_NAME)) {
  fail(`${XPI_NAME} does not exist. Run npm run verify first.`);
}

void verify().catch((error) => fail(error instanceof Error ? error.message : String(error)));

async function verify() {
  const [remoteXpi, taggedUpdates, latestUpdates] = await Promise.all([
    download(releaseXpiUrl(version)),
    download(`https://github.com/Moonweave-Research/zotero-reading-flow/releases/download/${tag}/updates.json`),
    download(UPDATE_URL)
  ]);

  const localHash = sha256(fs.readFileSync(XPI_NAME));
  const publicHash = sha256(remoteXpi);
  if (publicHash !== localHash) {
    fail(`public XPI hash ${publicHash} does not match the tagged build ${localHash}`);
  }
  verifyUpdateMetadata(taggedUpdates, 'tagged release', publicHash);
  verifyUpdateMetadata(latestUpdates, 'latest update URL', publicHash);

  console.log(`verify-release-assets: OK (${tag}, sha256:${publicHash})`);
}

function verifyUpdateMetadata(buffer, source, publicHash) {
  const updates = JSON.parse(buffer.toString('utf8'));
  const update = updates.addons?.[ADDON_ID]?.updates?.[0];
  if (!update) fail(`${source} updates.json is missing ${ADDON_ID}`);
  if (update.update_hash !== `sha256:${publicHash}`) {
    fail(`${source} updates.json hash does not match the public XPI`);
  }
  if (update.version !== version || update.update_link !== releaseXpiUrl(version)) {
    fail(`${source} updates.json version or XPI link does not match the tagged release`);
  }

  const expectedZotero = manifest.applications?.zotero;
  const publicZotero = update.applications?.zotero;
  if (
    publicZotero?.strict_min_version !== expectedZotero?.strict_min_version
    || publicZotero?.strict_max_version !== expectedZotero?.strict_max_version
  ) {
    fail(`${source} updates.json Zotero compatibility does not match the tagged manifest`);
  }
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const tagIndex = argv.indexOf('--tag');
  return { tag: tagIndex === -1 ? null : argv[tagIndex + 1] ?? null };
}

function fail(message) {
  console.error(`verify-release-assets: ${message}`);
  process.exit(1);
}

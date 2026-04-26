#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const ADDON_ID = 'readingflow@moon.com';
const UPDATE_URL = 'https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/updates.json';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const repoRoot = path.resolve(args.repo || DEFAULT_REPO_ROOT);
const profileDir = normalizePath(args.profileDir || process.env.ZOTERO_TEST_PROFILE);
const dataDir = normalizePath(args.dataDir || process.env.ZOTERO_DATA_DIR);
const xpiPath = normalizePath(args.xpiPath || path.join(repoRoot, 'zotero-reading-flow.xpi'));
const jsonMode = Boolean(args.json);

if (!profileDir) {
  console.error('Missing profile path. Use --profileDir or set ZOTERO_TEST_PROFILE.');
  printUsage();
  process.exit(1);
}

const results = [];

checkRepo(packageJson());
checkXpi();
checkProfile();
checkDatabase();

const failures = results.filter((row) => row.status === 'FAIL').length;
const warnings = results.filter((row) => row.status === 'WARN').length;

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profileDir,
        dataDir,
        checks: results,
        failures,
        warnings,
      },
      null,
      2
    )
  );
} else {
  for (const row of results) {
    const line = `[${row.status}] ${row.name}${row.detail ? `: ${row.detail}` : ''}`;
    if (row.status === 'FAIL') {
      console.error(line);
    } else if (row.status === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  console.log(`\nSummary: ${results.length} checks, ${failures} failed, ${warnings} warnings.`);
}

if (failures > 0) {
  process.exit(1);
}

function checkRepo(pkg) {
  if (!repoRoot || !fs.existsSync(repoRoot)) {
    push('repo_path', 'FAIL', `path not found: ${repoRoot}`);
    return;
  }
  push('repo_path', 'PASS', `path=${repoRoot}`);
  push('package_version', pkg?.version ? 'PASS' : 'FAIL', `version=${pkg?.version || 'missing'}`);

  const lockPath = path.join(repoRoot, 'package-lock.json');
  push('package_lock', fs.existsSync(lockPath) ? 'PASS' : 'WARN', `path=${lockPath}`);

  const gitStatus = runGitStatus(repoRoot);
  if (gitStatus === null) {
    push('git_clean', 'WARN', 'git status command unavailable');
  } else if (gitStatus) {
    push('git_clean', 'WARN', `uncommitted items: ${gitStatus}`);
  } else {
    push('git_clean', 'PASS', 'clean');
  }
}

function checkXpi() {
  if (!xpiPath || !fs.existsSync(xpiPath)) {
    push('xpi_present', 'FAIL', `path=${xpiPath || 'missing'}`);
    return;
  }
  push('xpi_present', 'PASS', xpiPath);

  let manifest;
  try {
    const manifestRaw = runCommand('unzip', ['-p', xpiPath, 'manifest.json']);
    if (!manifestRaw.ok) {
      push('xpi_manifest', 'FAIL', manifestRaw.error);
      return;
    }
    manifest = JSON.parse(manifestRaw.output);
  } catch (error) {
    push('xpi_manifest', 'FAIL', error.message);
    return;
  }

  const zotero = manifest.applications?.zotero || {};
  const expectedVersion = packageJson()?.version;
  push('xpi_manifest_version', manifest.version ? 'PASS' : 'FAIL', `version=${manifest.version || 'missing'}`);
  push(
    'xpi_manifest_version_match',
    manifest.version && expectedVersion && manifest.version === expectedVersion ? 'PASS' : 'WARN',
    `manifest=${manifest.version || 'missing'}, package=${expectedVersion || 'missing'}`
  );
  push('xpi_addon_id', zotero.id === ADDON_ID ? 'PASS' : 'FAIL', `id=${zotero.id || 'missing'}`);
  push(
    'xpi_version_range',
    zotero.strict_min_version === '9.0' && zotero.strict_max_version === '9.0.*' ? 'PASS' : 'WARN',
    `strict_min=${zotero.strict_min_version || 'missing'}, strict_max=${zotero.strict_max_version || 'missing'}`
  );
  push(
    'xpi_update_url',
    zotero.update_url === UPDATE_URL ? 'PASS' : 'WARN',
    `update_url=${zotero.update_url || 'missing'}`
  );
}

function checkProfile() {
  const extensionsPath = path.join(profileDir, 'extensions.json');
  const prefsPath = path.join(profileDir, 'prefs.js');
  const treePrefsPath = path.join(profileDir, 'treePrefs.json');

  const extensions = readJsonSafe(extensionsPath);
  if (!extensions) {
    push('extensions_json', 'FAIL', `missing or invalid: ${extensionsPath}`);
    return;
  }
  const addon = Array.isArray(extensions.addons)
    ? extensions.addons.find((item) => item.id === ADDON_ID)
    : null;
  if (!addon) {
    push('addon_enabled', 'FAIL', `missing addon ${ADDON_ID}`);
  } else {
    push('addon_enabled', addon.active && !addon.userDisabled && !addon.appDisabled ? 'PASS' : 'FAIL', `active=${addon.active}, userDisabled=${addon.userDisabled}, appDisabled=${addon.appDisabled}`);
    push('addon_version', addon.version ? 'PASS' : 'WARN', `version=${addon.version || 'missing'}`);
    push('addon_visible', addon.visible ? 'PASS' : 'WARN', `visible=${addon.visible}`);
  }

  const prefsText = readTextSafe(prefsPath);
  if (!prefsText) {
    push('prefs_js', 'FAIL', `missing: ${prefsPath}`);
  } else {
    const columnsInitialized =
      getPrefValue(prefsText, 'extensions.zotero.extensions.readingflow.columnsInitialized') ||
      getPrefValue(prefsText, 'extensions.readingflow.columnsInitialized');
    push('columns_initialized', columnsInitialized === 'true' ? 'PASS' : 'FAIL', `value=${columnsInitialized || 'missing'}`);
  }

  const treePrefs = readJsonSafe(treePrefsPath);
  if (!treePrefs) {
    push('tree_prefs', 'FAIL', `missing or invalid: ${treePrefsPath}`);
    return;
  }
  const itemTree = treePrefs['item-tree-main-default'];
  if (!itemTree || typeof itemTree !== 'object') {
    push('tree_prefs_shape', 'FAIL', 'missing item-tree-main-default');
    return;
  }
  const expected = [
    'readingflow\\@moon\\.com-readingFlowProgress',
    'readingflow\\@moon\\.com-readingFlowStatus',
    'readingflow\\@moon\\.com-readingFlowLastRead',
  ];
  for (const key of expected) {
    const entry = itemTree[key];
    if (!entry) {
      push(`tree_column_${key}`, 'FAIL', 'missing');
      continue;
    }
    push(`tree_column_${key}_hidden`, entry.hidden === false ? 'PASS' : 'FAIL', `hidden=${entry.hidden}`);
    push(
      `tree_column_${key}_width`,
      Number.isFinite(entry.width) && entry.width > 0 ? 'PASS' : 'WARN',
      `width=${entry.width ?? 'missing'}`
    );
  }
}

function checkDatabase() {
  if (!dataDir || !fs.existsSync(dataDir)) {
    push('sqlite_db', 'SKIP', 'missing Zotero data directory');
    return;
  }
  const dbPath = path.join(dataDir, 'zotero.sqlite');
  if (!fs.existsSync(dbPath)) {
    push('sqlite_db', 'WARN', `missing: ${dbPath}`);
    return;
  }

  const requestedItemKey = args.itemKey;
  const requestedAttachmentKey = args.attachmentKey;
  const requestedAttachmentPath = args.attachmentPath;
  if (!requestedItemKey && !requestedAttachmentKey && !requestedAttachmentPath) {
    push('sqlite_db', 'PASS', `found ${dbPath}`);
    return;
  }

  const where = [];
  if (requestedItemKey) {
    where.push(`i.key='${escapeSql(requestedItemKey)}'`);
  }
  if (requestedAttachmentKey) {
    where.push(`i.key='${escapeSql(requestedAttachmentKey)}'`);
  }
  if (!where.length) {
    push('sqlite_db', 'PASS', `found ${dbPath}`);
    return;
  }

  const sql = [
    "SELECT i.itemID, i.key, it.typeName, COALESCE(iv.value, '') AS title, ia.parentItemID, ia.path, ia.linkMode, ia.contentType",
    'FROM items i',
    'JOIN itemTypes it ON it.itemTypeID=i.itemTypeID',
    'LEFT JOIN itemData d ON d.itemID=i.itemID AND d.fieldID=1',
    'LEFT JOIN itemDataValues iv ON iv.valueID=d.valueID',
    'LEFT JOIN itemAttachments ia ON ia.itemID=i.itemID',
    `WHERE ${where.join(' OR ')}`,
    'ORDER BY i.itemID;',
  ].join('\n');

  const snapshotPath = path.join(
    process.env.TMPDIR || '/tmp',
    `reading-flow-zotero-${process.pid}-${Date.now()}.sqlite`
  );
  const snapshotWalPath = `${snapshotPath}-wal`;
  const snapshotShmPath = `${snapshotPath}-shm`;
  const sourceWalPath = `${dbPath}-wal`;
  const sourceShmPath = `${dbPath}-shm`;
  const copied = [];

  try {
    fs.copyFileSync(dbPath, snapshotPath);
    copied.push(snapshotPath);
    if (fs.existsSync(sourceWalPath)) {
      fs.copyFileSync(sourceWalPath, snapshotWalPath);
      copied.push(snapshotWalPath);
    }
    if (fs.existsSync(sourceShmPath)) {
      fs.copyFileSync(sourceShmPath, snapshotShmPath);
      copied.push(snapshotShmPath);
    }
  } catch (error) {
    cleanupFiles(copied);
    push('sqlite_query', 'WARN', `copy zotero.sqlite failed: ${error.message}`);
    return;
  }

  const db = runCommand('sqlite3', ['-separator', '|', snapshotPath, sql]);
  cleanupFiles(copied);

  if (!db.ok) {
    if ((db.error || '').includes('locked')) {
      push('sqlite_query', 'WARN', 'database is locked; close Zotero and rerun for DB checks');
    } else if ((db.error || '').includes('no such column')) {
      push('sqlite_query', 'FAIL', db.error || 'sqlite3 query error');
    } else {
      push('sqlite_query', 'FAIL', db.error || 'sqlite3 unavailable or query failed');
    }
    return;
  }
  const rows = db.output.split('\n').filter(Boolean);
  push('sqlite_query', 'PASS', rows.join(' | ') || '<empty>');

  if (requestedItemKey) {
    const itemMatch = rows.find((line) => line.includes(`|${requestedItemKey}|`));
    push(`sqlite_item_${requestedItemKey}`, itemMatch ? 'PASS' : 'FAIL', itemMatch || 'missing');
  }

  if (requestedAttachmentKey) {
    const attachmentMatch = rows.find((line) => line.includes(`|${requestedAttachmentKey}|`));
    push(`sqlite_attachment_${requestedAttachmentKey}`, attachmentMatch ? 'PASS' : 'FAIL', attachmentMatch || 'missing');
  }

  if (requestedAttachmentPath) {
    const pathMatch = rows.find((line) => line.includes(requestedAttachmentPath));
    push('sqlite_attachment_path', pathMatch ? 'PASS' : 'WARN', pathMatch || `missing path=${requestedAttachmentPath}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    if (token === '--help') {
      parsed.help = true;
      continue;
    }
    if (token.includes('=')) {
      const [rawKey, rawValue] = token.split('=', 2);
      parsed[rawKey.replace(/^--/, '')] = rawValue;
      continue;
    }
    const key = token.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function printUsage() {
  console.log('Usage: node scripts/check-release-profile.js --profileDir <path> [--dataDir <path>] [options]');
  console.log('');
  console.log('Options:');
  console.log('  --repo <path>            Repo root (default: current workspace)');
  console.log('  --profileDir <path>      Zotero profile folder (required unless ZOTERO_TEST_PROFILE is set)');
  console.log('  --dataDir <path>         Zotero data folder (optional, for DB checks)');
  console.log('  --xpiPath <path>         XPI path (default: zotero-reading-flow.xpi)');
  console.log('  --itemKey <key>          Expected item key in zotero.sqlite');
  console.log('  --attachmentKey <key>    Expected attachment key in zotero.sqlite');
  console.log('  --attachmentPath <path>  Expected attachment file path in zotero.sqlite');
  console.log('  --json                   Output machine-readable JSON');
  console.log('  --help                   Show usage');
}

function packageJson() {
  return readJsonSafe(path.join(repoRoot, 'package.json'));
}

function getPrefValue(prefsText, name) {
  const pattern = new RegExp(`^\\s*user_pref\\(\\s*\"${escapeRegExp(name)}\",\\s*([^)]*)\\);`);
  for (const line of prefsText.split('\n')) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function runCommand(command, args, options = {}) {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    }).trim();
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: String(error.stderr || error.stdout || error.message || '').trim() || 'command failed',
    };
  }
}

function runGitStatus(target) {
  const result = runCommand('git', ['-C', target, 'status', '--short']);
  return result.ok ? result.output : null;
}

function cleanupFiles(paths) {
  for (const target of paths) {
    try {
      fs.unlinkSync(target);
    } catch {
      // best effort cleanup
    }
  }
}

function readJsonSafe(target) {
  const text = readTextSafe(target);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readTextSafe(target) {
  if (!fs.existsSync(target)) return null;
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

function push(name, status, detail) {
  results.push({ name, status, detail });
}

function normalizePath(input) {
  if (!input) return null;
  if (input.startsWith('~')) {
    return path.join(process.env.HOME || '', input.slice(1));
  }
  return path.resolve(input);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

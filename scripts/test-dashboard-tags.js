const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const { firefox } = require('playwright');

// Production dashboard and controls in Gecko; the host supplies read-only sample snapshots.
fs.mkdirSync('tmp/dashboard-tags', { recursive: true });
buildSync({ stdin: { contents: "export { calculateStatisticsSnapshot } from './src/statistics'; export { DEFAULT_FLOW_DATA } from './src/flowData';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', outfile: 'tmp/dashboard-tags/model.cjs' });
buildSync({ entryPoints: ['src/dashboard.ts'], bundle: true, platform: 'browser', outfile: 'tmp/dashboard-tags/dashboard.js' });
const { calculateStatisticsSnapshot, DEFAULT_FLOW_DATA } = require('../tmp/dashboard-tags/model.cjs');
const papers = [1, 2].map(id => ({ id, title: `Sample ${id}`, tracked: true, flowData: { ...DEFAULT_FLOW_DATA, s: 'reading' } }));
const longTag = 'longtag'.repeat(40);
const tags = ['topic/A', '<topic>', longTag];
const sample = items => ({ ...calculateStatisticsSnapshot(items), availableTags: tags });
const html = fs.readFileSync('addon/dashboard.xhtml', 'utf8')
  .replace(/<\?[^>]*\?>/g, '')
  .replace(/<link[^>]*\/>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace('</head>', `<style>${fs.readFileSync('addon/dashboard.css', 'utf8')}</style></head>`);
(async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    for (const width of [360, 900]) for (const fontSize of [16, 26]) for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme });
      await page.setContent(html);
      await page.addStyleTag({ content: `:root { font-size: ${fontSize}px; }` });
      await page.evaluate(({ all, filtered }) => {
        window.arguments = [{ getSnapshot: async (...args) => {
          window.lastQuery = args;
          return structuredClone(args[5] ? filtered : all);
        } }];
      }, { all: sample(papers), filtered: sample([papers[0]]) });
      await page.addScriptTag({ path: 'tmp/dashboard-tags/dashboard.js' });
      await page.waitForFunction(() => document.getElementById('dashboard-papers').textContent === '2');
      await page.locator('.dashboard-more-filters').evaluate(el => { el.open = true; });
      const select = page.locator('#dashboard-tag-filter');
      await select.selectOption('topic/A');
      await page.waitForFunction(() => document.getElementById('dashboard-papers').textContent === '1');
      assert.equal(await page.evaluate(() => window.lastQuery[5]), 'topic/A');
      await select.selectOption(longTag);
      await page.waitForFunction(tag => document.getElementById('dashboard-active-filters').textContent.includes(tag), longTag);
      await page.locator('.dashboard-method').evaluate(el => { el.open = true; });
      const overflow = await page.locator('#dashboard-active-filters, #dashboard-filter-note, .dashboard-secondary-controls select').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1).map(el => el.id));
      assert.deepEqual(overflow, [], `Tag controls/text overflow at ${width}px/${fontSize}px/${colorScheme}`);
      await page.screenshot({ path: `tmp/dashboard-tags/${width}-${fontSize}-${colorScheme}.png`, fullPage: true });
      await select.selectOption('<topic>');
      await page.waitForFunction(() => document.getElementById('dashboard-active-filters').textContent.includes('<topic>'));
      assert.equal(await page.locator('#dashboard-active-filters topic').count(), 0);
      await select.selectOption('');
      await page.waitForFunction(() => document.getElementById('dashboard-papers').textContent === '2');
      await page.close();
      console.log(`PASS tag filtering/clearing/text safety/layout: ${width}px/${fontSize}px/${colorScheme}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const { firefox } = require('playwright');

// Exercise production rendering in Gecko. This models intrinsic width negotiation,
// not Zotero's privileged XUL shell or a Windows desktop acceptance test.
fs.mkdirSync('tmp/layout', { recursive: true });
buildSync({ entryPoints: ['test/layout/itemPane.fixture.ts'], bundle: true, platform: 'browser', outfile: 'tmp/layout/pane.js' });
(async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1600 } });
    for (const fontSize of [13, 26]) {
      for (const width of [280, 320, 480]) {
        await page.setContent(`<style>
          body { font: ${fontSize}px Arial; }
          #preferred { display: inline-flex; flex-direction: column; }
          #native { width: ${width}px; }
          item-pane-custom-section, collapsible-section, .body { display: flex; flex-direction: column; }
          select, button { font: inherit; }
          button { height: 28px; padding: 4px 11px 6px; }
        </style><div id="preferred"><div id="native">Native abstract and PDF preview</div>
          <item-pane-custom-section><collapsible-section><div class="body" data-type="body"></div></collapsible-section></item-pane-custom-section></div>`);
        const before = await page.locator('#preferred').boundingBox();
        await page.addScriptTag({ path: 'tmp/layout/pane.js' });
        await page.evaluate(() => renderReadingFlow('An exceptionally long PDF filename '.repeat(20) + '.pdf'));
        const after = await page.locator('#preferred').boundingBox();
        assert.ok(Math.abs(after.width - before.width) <= 1,
          `Plugin changed shared preferred width: ${before.width} -> ${after.width} (${width}px, ${fontSize}px font)`);
        for (const expanded of [false, true]) {
          await page.locator('details').evaluate((el, open) => { el.open = open; }, expanded);
          const overflow = await page.locator('[data-type="body"]').evaluate(body => {
            const bounds = body.getBoundingClientRect();
            return [body, ...body.querySelectorAll('button, select, dl, dt, dd, p, summary')]
              .filter(el => el.getClientRects().length)
              .filter(el => el.getBoundingClientRect().right > bounds.right + 1 || el.getBoundingClientRect().left < bounds.left - 1)
              .map(el => el.tagName + ': ' + el.textContent.slice(0, 45));
          });
          assert.deepEqual(overflow, [], `Overflow at ${width}px/${fontSize}px, About open=${expanded}`);
        }
        const clippedButtons = await page.locator('button').evaluateAll(buttons => buttons.filter(button => button.scrollHeight > button.clientHeight + 1).map(button => button.textContent));
        assert.deepEqual(clippedButtons, [], `Clipped button labels at ${width}px/${fontSize}px`);
        assert.match(await page.locator('[data-type="body"]').textContent(), /Reading bookmark.*page 4.*Last viewed.*page 8/s);
        await page.locator('select').focus();
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SELECT');
        await page.screenshot({ path: `tmp/layout/pane-${width}-${fontSize}.png`, fullPage: true });
        console.log(`PASS ${width}px pane, ${fontSize}px font, collapsed/expanded details`);
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

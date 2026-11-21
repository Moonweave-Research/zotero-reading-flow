import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleManager } from '../src/styleManager';

test('injectLocale registers the Fluent file by locale href, not rootURI path', () => {
  const calls: string[] = [];
  const mozXULElement = {
    insertFTLIfNeeded(href: string) {
      calls.push(href);
    }
  };

  const manager = new StyleManager();
  manager.injectLocale({ MozXULElement: mozXULElement } as any, 'jar:file:///plugin.xpi!/');

  assert.deepEqual(calls, ['reading-flow.ftl']);
});

test('unregister removes styles from every open Zotero window', () => {
  function makeDocument() {
    let style: { remove(): void } | undefined;
    return {
      getElementById: () => style,
      createElement: () => ({ remove() { style = undefined; } }),
      head: { appendChild(element: NonNullable<typeof style>) { style = element; } }
    };
  }
  const manager = new StyleManager();
  const first = makeDocument(), second = makeDocument(), closed = makeDocument();
  [first, second, closed].forEach(doc => manager.injectCSS(doc as any));
  manager.removeCSS(closed as any);
  assert.equal(closed.getElementById(), undefined);
  assert.ok(first.getElementById());
  assert.ok(second.getElementById());
  manager.unregister();
  assert.equal(first.getElementById(), undefined);
  assert.equal(second.getElementById(), undefined);
});

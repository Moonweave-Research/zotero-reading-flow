import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstalledVersionStatus } from '../scripts/release-profile-contract';

test('installed add-on version must match the XPI under test', () => {
  assert.equal(getInstalledVersionStatus('1.2.1', '1.2.1'), 'PASS');
  assert.equal(getInstalledVersionStatus('1.1.18', '1.2.1'), 'FAIL');
  assert.equal(getInstalledVersionStatus(undefined, '1.2.1'), 'FAIL');
});

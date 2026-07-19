function getInstalledVersionStatus(installedVersion, expectedVersion) {
  return installedVersion && expectedVersion && installedVersion === expectedVersion ? 'PASS' : 'FAIL';
}

module.exports = { getInstalledVersionStatus };

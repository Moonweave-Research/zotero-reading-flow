const ADDON_ID = 'readingflow@moon.com';
const XPI_NAME = 'zotero-reading-flow.xpi';
const GITHUB_REPO = 'Moonweave-Research/zotero-reading-flow';
const GITHUB_BASE_URL = `https://github.com/${GITHUB_REPO}`;
const HOMEPAGE_URL = GITHUB_BASE_URL;
const RELEASE_BASE_URL = `${GITHUB_BASE_URL}/releases/download`;
const UPDATE_URL = `${GITHUB_BASE_URL}/releases/latest/download/updates.json`;

function releaseXpiUrl(version) {
  return `${RELEASE_BASE_URL}/v${version}/${XPI_NAME}`;
}

module.exports = {
  ADDON_ID,
  XPI_NAME,
  GITHUB_REPO,
  GITHUB_BASE_URL,
  HOMEPAGE_URL,
  RELEASE_BASE_URL,
  UPDATE_URL,
  releaseXpiUrl
};

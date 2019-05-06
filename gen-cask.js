const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const DOWNLOAD_URL = 'https://developer.apple.com/safari/download/';
const CASK_FILENAME = 'safari-technology-preview.rb';

async function scrapeDownloads() {
  const text = await (await fetch(DOWNLOAD_URL)).text();
  const dom = new JSDOM(text);
  const document = dom.window.document;

  const heading = Array.from(document.querySelectorAll('h4')).find(h => {
    return h.textContent.trim() == 'Safari Technology Preview';
  });
  if (!heading) {
    throw new Error(`Cannot find heading "Safari Technology Preview"`);
  }

  const container = heading.closest('.row');
  if (!container) {
    throw new Error(`Cannot find container for STP section`);
  }

  const versionMatch = container.textContent.match(/Release\s+(\d+)/);
  if (!versionMatch) {
    throw new Error(`Cannot find STP version in ${JSON.stringify(container.textContent)}`);
  }
  const version = +versionMatch[1];
  // Check that version is plausibly a STP version (68 at time of writing)
  if (version < 68) {
    throw new Error(`${version} found but cannot be an STP version`);
  }

  const links = container.querySelectorAll('a[href*="SafariTechnologyPreview.dmg"');
  const packages = {};
  for (const link of links) {
    const linkText = link.textContent.trim();
    const osVersionMatch = linkText.match(/^Safari Technology Preview for macOS (.*)/);
    if (!osVersionMatch) {
      throw new Error(`Cannot find macOS version in ${JSON.stringify(linkText)}`);
    }
    const osVersion = osVersionMatch[1].toLowerCase().replace(/\s/g, '_');

    const url = link.href;
    const hash = crypto.createHash('sha256');
    hash.update(await (await fetch(url)).buffer());
    const sha256 = hash.digest('hex');

    packages[osVersion] = { url, sha256 };
  }

  return { version, packages };
}

async function generateCask() {
  const { version, packages } = await scrapeDownloads();

  // Assume Mojave + High Sierra packages. This will eventually break and will
  // then need to be updated together with the cask structure.
  if (!(Object.keys(packages).length == 2 && 'mojave' in packages && 'high_sierra' in packages)) {
    throw new Error(`Expecting Mojave + High Sierra packages but got ${JSON.stringify(packages)}`);
  }

  const urlParts = packages.mojave.url.split(/\/([0-9a-f-]{55})\//);
  if (urlParts.length !== 3) {
    throw new Error(`Expecting Mojave URL with 55-char ID but got ${mojaveURL}`);
  }

  const caskContent = `cask 'safari-technology-preview' do
  version '${version},${urlParts[1]}'

  if MacOS.version <= :high_sierra
    url '${packages.high_sierra.url}'
    sha256 '${packages.high_sierra.sha256}'
  else
    url "${urlParts[0]}/#{version.after_comma}/${urlParts[2]}"
    sha256 '${packages.mojave.sha256}'
  end

  appcast 'https://developer.apple.com/safari/technology-preview/release-notes/'
  name 'Safari Technology Preview'
  homepage 'https://developer.apple.com/safari/download/'

  auto_updates true
  depends_on macos: '>= :high_sierra'

  pkg 'Safari Technology Preview.pkg'

  uninstall delete: '/Applications/Safari Technology Preview.app'

  zap trash: [
               '~/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/com.apple.safaritechnologypreview.sfl*',
               '~/Library/Caches/com.apple.SafariTechnologyPreview',
               '~/Library/Preferences/com.apple.SafariTechnologyPreview.plist',
               '~/Library/SafariTechnologyPreview',
               '~/Library/Saved Application State/com.apple.SafariTechnologyPreview.savedState',
               '~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview-com.apple.Safari.UserRequests.plist',
               '~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview-com.apple.Safari.WebFeedSubscriptions.plist',
               '~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview.plist',
               '~/Library/WebKit/com.apple.SafariTechnologyPreview',
             ]
end
`;

  // Write cask to file and set Azure Pipelines variable
  fs.writeFileSync(CASK_FILENAME, caskContent);
  console.log(`Wrote ${CASK_FILENAME}`);
  console.log(`##vso[task.setvariable variable=safari.version]${version}`);
}

generateCask();

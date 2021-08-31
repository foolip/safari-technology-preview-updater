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
  if (!links.length) {
    throw new Error("No SafariTechnologyPreview.dmg links found");
  }

  const packages = [];
  for (const link of links) {
    const linkText = link.textContent.trim();
    const osMatch = linkText.match(/^Safari Technology Preview for macOS (.*)/);
    if (!osMatch) {
      throw new Error(`Cannot find macOS version in ${JSON.stringify(linkText)}`);
    }
    const os = osMatch[1].toLowerCase().replace(/\s/g, '_');

    const url = link.href;
    const hash = crypto.createHash('sha256');
    hash.update(await (await fetch(url)).buffer());
    const sha256 = hash.digest('hex');

    packages.push({ os, url, sha256 });
  }

  return { version, packages };
}

async function generateCask() {
  const { version, packages } = await scrapeDownloads();

  let caskContent = `cask "safari-technology-preview" do`;

  let firstOS = true;
  let oldestOS;
  for (const { os, url, sha256 } of packages) {
    const urlParts = url.split(/\/([0-9a-f-]{55})\//i);
    if (urlParts.length !== 3) {
      throw new Error(`Expecting URL with 55-char ID but got ${url}`);
    }

    caskContent += `
  ${firstOS ? 'if' : 'elsif'} MacOS.version == :${os}
    version "${version},${urlParts[1]}"
    url "${urlParts[0]}/#{version.after_comma}/${urlParts[2]}"
    sha256 "${sha256}"`;

    firstOS = false;

    // Assume the last macOS listed is the oldest.
    oldestOS = os;
  }

  caskContent += `
  end

  appcast "https://developer.apple.com/safari/download/"
  name "Safari Technology Preview"
  homepage "https://developer.apple.com/safari/download/"

  auto_updates true
  depends_on macos: ">= :${oldestOS}"

  pkg "Safari Technology Preview.pkg"

  uninstall delete: "/Applications/Safari Technology Preview.app"

  zap trash: [
    "~/Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments/com.apple.safaritechnologypreview.sfl*",
    "~/Library/Caches/com.apple.SafariTechnologyPreview",
    "~/Library/Preferences/com.apple.SafariTechnologyPreview.plist",
    "~/Library/SafariTechnologyPreview",
    "~/Library/Saved Application State/com.apple.SafariTechnologyPreview.savedState",
    "~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview-com.apple.Safari.UserRequests.plist",
    "~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview-com.apple.Safari.WebFeedSubscriptions.plist",
    "~/Library/SyncedPreferences/com.apple.SafariTechnologyPreview.plist",
    "~/Library/WebKit/com.apple.SafariTechnologyPreview",
  ]
end
`;

  // Write cask to file and set Azure Pipelines variable
  fs.writeFileSync(CASK_FILENAME, caskContent);
  console.log(`Wrote ${CASK_FILENAME}`);
  console.log(`##vso[task.setvariable variable=safari.version]${version}`);
}

generateCask().catch((error) => {
  console.error(error);
  process.exit(1);
});

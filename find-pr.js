'use strict';

const Octokit = require('@octokit/rest');

const TARGET_OWNER = 'Homebrew';
const REPO = 'homebrew-cask-versions';

async function findPR(owner, branch) {
  const octokit = Octokit({
    auth: process.env.GH_TOKEN
  });

  const existingPRs = (await octokit.pullRequests.list({
    owner: TARGET_OWNER,
    repo: REPO,
    head: `${owner}:${branch}`,
  })).data;
  if (existingPRs.length !== 0) {
    console.log(`Found existing PR: ${existingPRs[0].html_url}`);
    console.log('##vso[task.setvariable variable=haspr]true');
  } else {
    console.log('No existing PR found');
  }
}

findPR(process.argv[2], process.argv[3]).catch(reason => {
  console.error(reason);
  process.exit(1);
});

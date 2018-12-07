'use strict';

const octokit = require('@octokit/rest')();

const TARGET_OWNER = 'Homebrew';
const REPO = 'homebrew-cask-versions';

const PR_BODY_HEADER = `After making all changes to the cask:

- [x] \`brew cask audit --download {{cask_file}}\` is error-free.
- [x] \`brew cask style --fix {{cask_file}}\` reports no offenses.
- [x] The commit message includes the cask’s name and version.`;

octokit.authenticate({
  type: 'token',
  token: process.env.GH_TOKEN
});

async function createPR(owner, branch) {
  // Check for existing PR first.
  const existingPRs = (await octokit.pullRequests.list({
    owner: TARGET_OWNER,
    repo: REPO,
    head: `${owner}:${branch}`,
  })).data;
  if (existingPRs.length !== 0) {
    console.log(`Found existing PR: ${existingPRs[0].html_url}`);
    return;
  }

  // Get the commit message from the tip of the branch.
  const sha = (await octokit.gitdata.getRef({
    owner: owner,
    repo: REPO,
    ref: `heads/${branch}`,
  })).data.object.sha;

  const commit = (await octokit.repos.getCommit({
    owner: owner,
    repo: REPO,
    sha,
  })).data;

  const { message } = commit.commit;

  const index = message.indexOf('\n');
  if (index === -1) {
    throw new Error("No newline in commit message");
  }

  const title = message.substr(0, index);
  const commitBody = message.substr(index).trim();

  const body = `${PR_BODY_HEADER}\n\n----\n\n${commitBody}`;

  const newPR = (await octokit.pullRequests.create({
    owner: TARGET_OWNER,
    repo: REPO,
    title, body,
    head: `${owner}:${branch}`,
    base: 'master',
  })).data;

  console.log(`Created PR: ${newPR.html_url}`);
}

createPR(process.argv[2], process.argv[3]);

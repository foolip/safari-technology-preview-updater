'use strict';

const { Octokit } = require('@octokit/rest');

const HOMEBREW_HEADER = `After making all changes to the cask:

- [x] \`brew cask audit --download {{cask_file}}\` is error-free.
- [x] \`brew cask style --fix {{cask_file}}\` reports no offenses.
- [x] The commit message includes the cask’s name and version.`;

async function createPR(target, source) {
  const [targetOwner, repo] = target.split('/');
  const [sourceOwner, branch] = source.split(':');

  const octokit = Octokit({
    auth: process.env.GH_TOKEN
  });

  // Get the commit message from the tip of the branch.
  const commit_sha = (await octokit.git.getRef({
    owner: sourceOwner,
    repo,
    ref: `heads/${branch}`,
  })).data.object.sha;

  const commit = (await octokit.git.getCommit({
    owner: sourceOwner,
    repo,
    commit_sha,
  })).data;

  const { message } = commit;

  const index = message.indexOf('\n');
  if (index === -1) {
    throw new Error("No newline in commit message");
  }

  const title = message.substr(0, index);
  let body = message.substr(index).trim();
  if (target === 'Homebrew/homebrew-cask-versions') {
    body = `${HOMEBREW_HEADER}\n\n----\n\n${body}`;
  }

  const newPR = (await octokit.pulls.create({
    owner: targetOwner,
    repo,
    title,
    body,
    head: `${sourceOwner}:${branch}`,
    base: 'master',
  })).data;

  console.log(`Created PR: ${newPR.html_url}`);
}

createPR(process.argv[2], process.argv[3]).catch(reason => {
  console.error(reason);
  process.exit(1);
});

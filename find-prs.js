'use strict';

const Octokit = require('@octokit/rest');

const targets = [
  ['Homebrew', 'homebrew-cask-versions', 'homebrew'],
  ['web-platform-tests', 'wpt', 'wpt'],
];

async function findPRs(head) {
  const octokit = Octokit({
    auth: process.env.GH_TOKEN
  });

  for (const [owner, repo, prefix] of targets) {
    const pr = (await octokit.pullRequests.list({
      owner,
      repo,
      head,
    })).data[0];

    if (pr) {
      console.log(`Found ${owner}/${repo} PR: ${pr.html_url}`);
      console.log(`##vso[task.setvariable variable=${prefix}.haspr]true`);
    } else {
      console.log(`No ${owner}/${repo} PR found`);
    }
  }
}

findPRs(`${process.argv[2]}:${process.argv[3]}`).catch(reason => {
  console.error(reason);
  process.exit(1);
});

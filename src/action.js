const core = require('@actions/core');
const github = require('@actions/github');
const cp = require('child_process');
const util = require('util');
const fs = require('fs');
const exec = util.promisify(cp.exec);
const maven = require('./maven');

async function main() {
  const release_tag=core.getInput('release-tag');
  if (!release_tag) return;

  const test_args = JSON.parse(core.getInput('test-args'));
  const GITHUB_TOKEN = process.env.github_token;
  const MULESOFT_NEXUS_USER = process.env.mulesoft_nexus_user;
  const MULESOFT_NEXUS_PASSWORD = process.env.mulesoft_nexus_password;
  const octokit = github.getOctokit(GITHUB_TOKEN);
  const { context = {} } = github;

  core.info('github token: ' + GITHUB_TOKEN);
  core.info('nexus user: ' + MULESOFT_NEXUS_USER);
  core.info('nexus pw: ' + MULESOFT_NEXUS_PASSWORD);

  try {
    if (await releaseExists(octokit, context, release_tag)) {
      core.setFailed("Cancelling the subsequent step(s). " + release_tag + " already exists!")
      return;
    }
    if (await maven.build(test_args, MULESOFT_NEXUS_USER, MULESOFT_NEXUS_PASSWORD)) {
      await createRelease(octokit, context, release_tag);
    }
    console.log("action executed successfully.");
    return true;
  }
  catch (error) {
    console.log(error);
    core.setFailed(error.message)
    return;
  }
}

main();

async function releaseExists(octokit, context, release_tag) {
  if (release_tag) {
    try {
      await octokit.repos.getReleaseByTag({
        ...context.repo,
        tag: release_tag
      });
      console.log("Release exist!");
    }
    catch (error) {
      if (error.status == 404) return false;
      else throw error;
    }
  }
  return true;
}

async function createRelease(octokit, context, release_tag) {
  const response = await octokit.repos.createRelease({
    ...context.repo,
    tag_name: release_tag,
    name: "Release " + release_tag,
    draft: false,
    prerelease: true
  });

  console.log('Release ' + release_tag + ' created.');
  return uploadReleaseAsset(octokit, context, response.data);
}

async function uploadReleaseAsset(octokit, context, release) {
  const artifactInfo = JSON.parse(await getArtifactInfo());

  await octokit.repos.uploadReleaseAsset({
    ...context.repo,
    release_id: release.id,
    origin: release.upload_url,
    name: artifactInfo.name,
    data: fs.readFileSync(artifactInfo.path)
  });
  return true;
}

async function getArtifactInfo() {
  var asset_name = await exec('cd target/ && ls *.jar | head -1');
  asset_name = asset_name.stdout.replace(/\r?\n|\r/g, "");
  const artifactInfo = JSON.stringify({ name: asset_name, path: "target/" + asset_name });
  console.log('Artifact Info: ', artifactInfo);
  return artifactInfo;
}
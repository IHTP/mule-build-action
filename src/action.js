const core = require('@actions/core');
const github = require('@actions/github');
const cp = require('child_process');
const util = require('util');
const fs = require('fs');
const exec = util.promisify(cp.exec);

async function main() {
  const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
  const buildArgs = JSON.parse(core.getInput('buildArgs'));
  const testArgs = JSON.parse(core.getInput('testArgs'));

  if (!buildArgs) return;

  const octokit = github.getOctokit(GITHUB_TOKEN);
  const { context = {} } = github;

  try {
    if (await releaseExists(octokit, context, buildArgs.release_tag)) {
      core.setFailed("Cancelling the subsequent step(s). " + buildArgs.release_tag + " already exists!")
      return;
    }
    if (await buildPackage(testArgs)) {
      await createRelease(octokit, context, buildArgs.release_tag);
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

async function buildPackage(testArgs) {
  console.log("Building project artifact ...");

  var build_command = 'mvn -B package --file pom.xml ';
  if (testArgs) {
    for (const key in testArgs) {
      build_command += "-D" + key + "=" + testArgs[key] + " "
    }
  }
  const build = await exec(build_command);
  console.log('Build logs ', build.stdout);
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
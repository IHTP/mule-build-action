const core = require('@actions/core');
const github = require('@actions/github');
const cp = require('child_process');
const util = require('util');
const fs = require('fs');
const exec = util.promisify(cp.exec);


let artifactInfo = {};
let buildArgs = {};
let deployArgs = {};

async function main() {
  const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
  buildArgs = parseJSON(core.getInput('buildArgs'));
  deployArgs = parseJSON(core.getInput('deployArgs'));

  if (!deployArgs && !buildArgs) return;

  const octokit = github.getOctokit(GITHUB_TOKEN);
  const { context = {} } = github;
  const { pull_request, respository } = context.payload;

  try {
    if (await releaseExists(octokit, context)) {
      console.log("Cancelling the subsequent step. ${buildArgs.release_tag} already exists!");
      return;
    }
    if (await buildPackage()) {
      if (await createRelease(octokit, context)) {
        await uploadToCloudHub();
      }
    }
    console.log("action executed successfully.");
    return true;
  }
  catch (error) {
    console.error(error);
    return;
  }
}

main();


async function releaseExists(octokit, context) {
  if (buildArgs.release_tag) {
    try {
      await octokit.repos.getReleaseByTag({
        ...context.repo,
        tag: buildArgs.release_tag
      });
      console.log("Release exist!");

    }
    catch (error) {
      console.error(error);
      if (error.status == 404) return false;
    }
  }
  return true;
}

async function buildPackage() {
  console.log("Building project artifact ...");
  const build = await exec('mvn -B package --file pom.xml');
  console.log('Build logs', build.stdout);
  return true;
}

async function createRelease(octokit, context) {

  const response = await octokit.repos.createRelease({
    ...context.repo,
    tag_name: buildArgs.release_tag,
    name: "Release " + buildArgs.release_tag,
    draft: false,
    prerelease: true
  });

  console.log(response.stdout);
  return uploadReleaseAsset(octokit, context, response.data);
}

async function uploadReleaseAsset(octokit, context, release) {
  artifactInfo = parseJSON(await getArtifactInfo());

    await octokit.repos.uploadReleaseAsset({
      ...context.repo,
      release_id: release.id,
      origin: release.upload_url,
      name: artifactInfo.name,
      data: fs.readFileSync(artifactInfo.path)
    });
    return true;
}

async function uploadToCloudHub() {
  deployArgs.cloudhub_apps.forEach(app => {
    const cmd = "anypoint-cli --username=" + app.client_id + " --password=" + app.client_secret + " --environment=" + app.env + " runtime-mgr cloudhub-application modify " + app + artifactInfo.path;
    exec(cmd);
    console.log(app.env + " updated successfully.");
  });
  return true;
}

async function getArtifactInfo() {
  var asset_name = await exec('cd target/ && ls *.jar | head -1');
  asset_name = asset_name.stdout.replace(/\r?\n|\r/g, "");
  const artifactInfo = JSON.stringify({ name: asset_name, path: "target/" + asset_name });
  console.log(artifactInfo);
  return artifactInfo;
}

function parseJSON(string) {
  try {
    var json = JSON.parse(string);
    return json;
  }
  catch (error) {
    console.error(error);
  }
  return null;
}


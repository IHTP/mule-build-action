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

  if (!deployArgs || !buildArgs) return;

  const octokit = github.getOctokit(GITHUB_TOKEN);
  const { context = {} } = github;

  try {
    if (await releaseExists(octokit, context)) {
        core.setFailed("Cancelling the subsequent step(s). " + buildArgs.release_tag + " already exists!")
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
    core.setFailed(error.message)
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
      if (error.status == 404) return false;
      else throw error;
    }
  }
  return true;
}

async function buildPackage() {
  console.log("Building project artifact ...");
  const build = await exec('mvn -B package --file pom.xml');
  console.log('Build logs ', build.stdout);
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

  console.log('Release '+ buildArgs.release_tag +' created.');
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
  const {client_id, client_secret} = deployArgs.cloudhub_creds;

  for (const app of deployArgs.cloudhub_apps) {   
    await exec("anypoint-cli --client_id=" + client_id + " --client_secret=" + client_secret + " --environment=" + app.env + " runtime-mgr cloudhub-application modify " + app.name + " " + artifactInfo.path);
    console.log(app.env + " updated successfully.");
  };
  return true;
}

async function getArtifactInfo() {
  var asset_name = await exec('cd target/ && ls *.jar | head -1');
  asset_name = asset_name.stdout.replace(/\r?\n|\r/g, "");
  const artifactInfo = JSON.stringify({ name: asset_name, path: "target/" + asset_name });
  console.log('Artifact Info: ', artifactInfo);
  return artifactInfo;
}

function parseJSON(string) {
  try {
    var json = JSON.parse(string);
    return json;
  }
  catch (error) {
    core.setFailed(error.message)
  }
  return null;
}
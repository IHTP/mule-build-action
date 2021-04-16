var core = require('@actions/core');
var path = require('path');
var fs = require('fs');
var os = require('os');
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;
const cp = require('child_process');
const util = require('util');
const { env } = require('process');
const exec = util.promisify(cp.exec);

function getSettingsTemplate() {
    core.info("opening settings template");
    var templatePath = path.join(__dirname, '../template', 'settings.xml');
    var template = fs.readFileSync(templatePath).toString();
    return new DOMParser().parseFromString(template, 'text/xml');
}

function writeSettings(templateXml) {
    var settingsPath = path.join(os.homedir(), '.m2', 'settings.xml');
    if (!fs.existsSync(path.dirname(settingsPath))) {
        core.info("creating ~/.m2 directory");
        fs.mkdirSync(path.dirname(settingsPath));
    }

    core.info("writing settings.xml to path: " + settingsPath)
    var settingStr = new XMLSerializer().serializeToString(templateXml);
    fs.writeFileSync(settingsPath, settingStr);
}

function updateServers(templateXml,nexusUser, nexusPw) {
    var serverXml = templateXml.getElementsByTagName('server')[0];

    var userXml = templateXml.createElement('username');
    userXml.textContent = nexusUser;
    serverXml.appendChild(userXml);
    var pwXml = templateXml.createElement('password');
    pwXml.textContent = nexusPw;
    serverXml.appendChild(pwXml);
}

function generateMavenSettings(nexusUser, nexusPw) {

    var templateXml = getSettingsTemplate();
    updateServers(templateXml,nexusUser, nexusPw);
    writeSettings(templateXml);
}

async function build(test_args, nexusUser, nexusPw) {
    console.log("Building project artifact ...");

    if (nexusUser && nexusPw)
        generateMavenSettings(nexusUser, nexusPw);

    var build_command = 'mvn -B package --file pom.xml ';
    if (test_args) {
        for (const key in test_args) {
            build_command += "-D" + key + "=" + test_args[key] + " "
        }
    }
    const build = await exec(build_command);
    console.log('Build logs ', build.stdout);
    return true;
}

module.exports = {
    generateMavenSettings,
    build
 }
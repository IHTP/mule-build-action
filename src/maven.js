var core = require('@actions/core');
var path = require('path');
var fs = require('fs');
var os = require('os');
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;
const cp = require('child_process');
const util = require('util');
const exec = util.promisify(cp.exec);


function getSettingsTemplate() {
    core.info("opening settings template");
    var templatePath = path.join(__dirname, '../template', 'settings.xml');
    var template = fs.readFileSync(templatePath).toString();
    return new DOMParser().parseFromString(template, 'text/xml');
}

function writeSettings(settingsPath, templateXml) {
    if (!fs.existsSync(path.dirname(settingsPath))) {
        core.info("creating ~/.m2 directory");
        fs.mkdirSync(path.dirname(settingsPath));
    }

    core.info("writing settings.xml to path: " + settingsPath)
    var settingStr = new XMLSerializer().serializeToString(templateXml);
    fs.writeFileSync(settingsPath, settingStr);
}

function updateServers(templateXml, serversInput) {

    if (!serversInput) {
        return;
    }

    var serversXml = templateXml.getElementsByTagName('servers')[0];

    JSON.parse(serversInput).forEach((serverInput) => {
        var serverXml = templateXml.createElement('server');
        for (var key in serverInput) {
            var keyXml = templateXml.createElement(key);
            keyXml.textContent = serverInput[key];
            serverXml.appendChild(keyXml);
        }
        serversXml.appendChild(serverXml);
    });

}

function updateMirrors(templateXml, mirrorsInput) {

    if (!mirrorsInput) {
        return;
    }

    var mirrorsXml = templateXml.getElementsByTagName('mirrors')[0];

    JSON.parse(mirrorsInput).forEach((mirrorInput) => {
        var mirrorXml = templateXml.createElement('mirror');
        for (var key in mirrorInput) {
            var keyXml = templateXml.createElement(key);
            keyXml.textContent = mirrorInput[key];
            mirrorXml.appendChild(keyXml);
        }
        mirrorsXml.appendChild(mirrorXml);
    });

}

function updateRepositories(templateXml, repositoriesInput) {

    if (!repositoriesInput) {
        return;
    }

    var repositoriesXml =
        templateXml.getElementsByTagName('profiles')[0]
            .getElementsByTagName('repositories')[0];

    JSON.parse(repositoriesInput).forEach((repositoryInput) => {
        var repositoryXml = templateXml.createElement('repository');
        for (var key in repositoryInput) {
            var keyXml = templateXml.createElement(key);
            var child = repositoryInput[key];
            if (child === Object(child)) {
                var childXml = templateXml.createElement(key);
                for (var childKey in child) {
                    if (Object.prototype.hasOwnProperty.call(child, childKey)) {
                        var childElement = templateXml.createElement(childKey);
                        childElement.textContent = child[childKey];
                        childXml.appendChild(childElement);
                    }
                }
                repositoryXml.appendChild(childXml);
            } else {
                keyXml.textContent = repositoryInput[key];
                repositoryXml.appendChild(keyXml);
            }
        }
        repositoriesXml.appendChild(repositoryXml);
    });
}

function updatePluginRepositories(templateXml, pluginRepositoriesInput) {

    if (!pluginRepositoriesInput) {
        return;
    }

    var pluginRepositoriesXml =
        templateXml.getElementsByTagName('profiles')[0]
            .getElementsByTagName('pluginRepositories')[0];

    JSON.parse(pluginRepositoriesInput).forEach((pluginRepositoryInput) => {
        var pluginRepositoryXml = templateXml.createElement('pluginRepository');
        for (var key in pluginRepositoryInput) {
            var keyXml = templateXml.createElement(key);
            var child = pluginRepositoryInput[key];
            if (child === Object(child)) {
                var childXml = templateXml.createElement(key);
                for (var childKey in child) {
                    if (Object.prototype.hasOwnProperty.call(child, childKey)) {
                        var childElement = templateXml.createElement(childKey);
                        childElement.textContent = child[childKey];
                        childXml.appendChild(childElement);
                    }
                }
                pluginRepositoryXml.appendChild(childXml);
            } else {
                keyXml.textContent = pluginRepositoryInput[key];
                pluginRepositoryXml.appendChild(keyXml);
            }
        }
        pluginRepositoriesXml.appendChild(pluginRepositoryXml);
    });
}

function updateProfiles(templateXml, profilesInput) {

    if (!profilesInput) {
        return;
    }

    var profilesXml =
        templateXml.getElementsByTagName('profiles')[0];

    JSON.parse(profilesInput).forEach((profileInput) => {
        var profileXml = templateXml.createElement('profile');
        for (var key in profileInput) {
            var keyXml = templateXml.createElement(key);
            var child = profileInput[key];
            if (child === Object(child)) {
                var childXml = templateXml.createElement(key);
                for (var childKey in child) {
                    if (Object.prototype.hasOwnProperty.call(child, childKey)) {
                        var childElement = templateXml.createElement(childKey);
                        childElement.textContent = child[childKey];
                        childXml.appendChild(childElement);
                    }
                }
                profileXml.appendChild(childXml);
            } else {
                keyXml.textContent = profileInput[key];
                profileXml.appendChild(keyXml);
            }
        }
        profilesXml.appendChild(profileXml);
    });
}

function updatePluginGroups(templateXml, pluginGroupsInput) {

    if (!pluginGroupsInput) {
        return;
    }

    var pluginGroupsXml = templateXml.getElementsByTagName('pluginGroups')[0];

    JSON.parse(pluginGroupsInput).forEach((pluginGroupInput) => {
        var pluginGroupXml = templateXml.createElement('pluginGroup');
        pluginGroupXml.textContent = pluginGroupInput;
        pluginGroupsXml.appendChild(pluginGroupXml);
    });

}

function generateMavenSettings(mavenSettings) {

    var templateXml = getSettingsTemplate();
    console.log('start writing maven settings file at .m2 directory.');
    updateServers(templateXml, JSON.stringify(mavenSettings.servers));
    updateMirrors(templateXml, JSON.stringify(mavenSettings.mirrors));
    updateRepositories(templateXml, JSON.stringify(mavenSettings.repositories));
    updatePluginRepositories(templateXml, JSON.stringify(mavenSettings.plugin_repositories));
    updateProfiles(templateXml, JSON.stringify(mavenSettings.profiles));
    updatePluginGroups(templateXml, JSON.stringify(mavenSettings.plugin_groups));

    var settingsPath = path.join(os.homedir(), '.m2', 'settings.xml');
    writeSettings(settingsPath, templateXml);
    console.log('end writing maven settings file at .m2 directory.');
}

async function build(testArgs, mavenSettings) {
    console.log("Building project artifact ...");

    if (mavenSettings)
        generateMavenSettings(mavenSettings);

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

module.exports = {
    generateMavenSettings,
    build
 }
'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new(require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var unirest = require('unirest');


module.exports = internetArchive;

function internetArchive(context) {
    var self = this;

    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;
    this.configManager = this.context.configManager;

}



internetArchive.prototype.onVolumioStart = function() {
    var self = this;
    var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
    this.config = new(require('v-conf'))();
    this.config.loadFile(configFile);

    self.logger.info("[archive.org] Volumio start");
    return libQ.resolve();
}

internetArchive.prototype.onStart = function() {
    var self = this;
    var defer = libQ.defer();

    self.mpdPlugin = this.commandRouter.pluginManager.getPlugin('music_service','mpd');

    self.addToBrowseSources();
    self.serviceName = "internet_archive";

    self.logger.info("[archive.org] loaded");
    // Once the Plugin has successfull started resolve the promise
    defer.resolve();

    return defer.promise;
};

internetArchive.prototype.onStop = function() {
    var self = this;
    var defer = libQ.defer();

    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

internetArchive.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

internetArchive.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
            __dirname + '/i18n/strings_en.json',
            __dirname + '/UIConfig.json')
        .then(function(uiconf) {


            defer.resolve(uiconf);
        })
        .fail(function() {
            defer.reject(new Error());
        });

    return defer.promise;
};


internetArchive.prototype.setUIConfig = function(data) {
    var self = this;
    //Perform your installation tasks here
};

internetArchive.prototype.getConf = function(varName) {
    var self = this;
    //Perform your installation tasks here
};

internetArchive.prototype.setConf = function(varName, varValue) {
    var self = this;
    //Perform your installation tasks here
};



// Playback Controls ---------------------------------------------------------------------------------------
// If your plugin is not a music_sevice don't use this part and delete it


internetArchive.prototype.addToBrowseSources = function() {
    var self = this;
    self.logger.info("[archive.org] adding to browse sources");
    // Use this function to add your music service plugin to music sources
    var data = {
        name: 'Internet Archive',
        uri: 'archive.org',
        plugin_type: 'music_service',
        plugin_name: 'internet_archive',
        icon: 'fa fa-microphone',
        albumart: '/albumart?sourceicon=music_service/internet_archive/internet_archive.svg'
    };
    this.commandRouter.volumioAddToBrowseSources(data);
};

internetArchive.prototype.handleBrowseUri = function(curUri) {
    var self = this;

    self.commandRouter.logger.info(curUri);
    var response;

    if (curUri.startsWith('archive.org')) {
        if (curUri == 'archive.org')
            response = self.listRoot(curUri);
    }

    return response;
};


internetArchive.prototype.listRoot = function() {
    var self = this;
    var defer = libQ.defer();

    self.logger.info('List Internet Archive root');
    try {

        var object = {
            "navigation": {
                "lists": [{
                    "availableListViews": [
                        "list"
                    ],
                    "items": [

                    ]
                }],
                "prev": {
                    "uri": "archive.org"
                }
            }
        };

        var base_url = 'https://archive.org';
        var api_service = '/services/search/v1/scrape';

        var Request = unirest.get(base_url + api_service);
        //var thumbnaiEndpoint = selectionEndpoint + variant + '/src/images/radio-thumbnails/';
        Request.timeout(1500)
        Request.query({
            q: 'title:"Riders In The Sky" AND mediatype:audio',
            fields: 'creator,identifier,title,collection'
        }).end(function(response) {
            if (response.status === 200) {
                self.logger.info('[archive.org] got response');
                for (var i in response.body.items) {
                    var item = response.body.items[i];
                    var ia_audio = {
                        service: 'internet_archive',
                        type: 'track',
                        title: item.title,
                        artist: item.creator.join('; '),
                        album: item.collection.join(', '),
                        icon: 'fa fa-music',
                        //albumart: '',
                        uri: base_url + 'download/' + item.identifier
                    };
                    object.navigation.lists[0].items.push(ia_audio);
                }
                defer.resolve(object);
            } else {
                self.logger.info('[archive.org] response failed with status ' + response.status);
                defer.resolve(object);
            }
        });
    } catch (e) {
        self.logger.info('[archive.org] error requesting: ' + e);
        defer.resolve(object);
    }
    return defer.promise
}

// Define a method to clear, add, and play an array of tracks
internetArchive.prototype.clearAddPlayTrack = function(track) {
    var self = this;
    var defer = libQ.defer();

    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::clearAddPlayTrack');

    self.commandRouter.logger.info(JSON.stringify(track));

    return self.mpdPlugin.sendMpdCommand('stop', [])
        .then(function() {
            return self.mpdPlugin.sendMpdCommand('clear', []);
        })
        .then(function() {
            return self.mpdPlugin.sendMpdCommand('add "'+track.uri+'"',[]);
        })
        .then(function () {
        self.mpdPlugin.clientMpd.on('system', function (status) {
            if (status !== 'playlist' && status !== undefined) {
            self.getState().then(function (state) {
                if (state.status === 'play') {
                return self.pushState(state);
                }
            });
            }
        });

        return self.mpdPlugin.sendMpdCommand('play', []).then(function () {
            return self.getState().then(function (state) {
            return self.pushState(state);
            });
        });

        })
        .fail(function (e) {
        return defer.reject(new Error());
        });
};

internetArchive.prototype.seek = function(timepos) {
    this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::seek to ' + timepos);

    return this.sendSpopCommand('seek ' + timepos, []);
};

// Stop
internetArchive.prototype.stop = function() {
    var self = this;
    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::stop');


};

// Spop pause
internetArchive.prototype.pause = function() {
    var self = this;
    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::pause');


};

// Get state
internetArchive.prototype.getState = function() {
    var self = this;
    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::getState');


};

//Parse state
internetArchive.prototype.parseState = function(sState) {
    var self = this;
    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::parseState');

    //Use this method to parse the state and eventually send it with the following function
};

// Announce updated State
internetArchive.prototype.pushState = function(state) {
    var self = this;
    self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'internetArchive::pushState');

    return self.commandRouter.servicePushState(state, self.servicename);
};


internetArchive.prototype.explodeUri = function(uri) {
    var self = this;
    var defer = libQ.defer();

    // Mandatory: retrieve all info for a given URI

    return defer.promise;
};

internetArchive.prototype.getAlbumArt = function(data, path) {

    var artist, album;

    if (data != undefined && data.path != undefined) {
        path = data.path;
    }

    var web;

    if (data != undefined && data.artist != undefined) {
        artist = data.artist;
        if (data.album != undefined)
            album = data.album;
        else album = data.artist;

        web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
    }

    var url = '/albumart';

    if (web != undefined)
        url = url + web;

    if (web != undefined && path != undefined)
        url = url + '&';
    else if (path != undefined)
        url = url + '?';

    if (path != undefined)
        url = url + 'path=' + nodetools.urlEncode(path);

    return url;
};





internetArchive.prototype.search = function(query) {
    var self = this;
    var defer = libQ.defer();

    // Mandatory, search. You can divide the search in sections using following functions

    return defer.promise;
};

internetArchive.prototype._searchArtists = function(results) {

};

internetArchive.prototype._searchAlbums = function(results) {

};

internetArchive.prototype._searchPlaylists = function(results) {


};

internetArchive.prototype._searchTracks = function(results) {

};

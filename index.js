var wd = require('wd');
var urlparse = require('url').parse;
var urlformat = require('url').format;

var WebDriverInstance = function(baseBrowserDecorator, args, logger) {
    var log = logger.create('WebDriver');

    var config = args.config || {
        hostname: '127.0.0.1',
        port: 4444
    };
    var self = this,
        sessionIsReady,
        pendingHeartBeat,
        pendingCancellations = 0,
        killForce;

    // Intialize with default values
    var spec = {
        platform: 'ANY',
        testName: 'Karma test',
        tags: [],
        version: ''
    };

    Object.keys(args).forEach(function(key) {
        var value = args[key];
        switch (key) {
            case 'browserName':
                break;
            case 'platform':
                break;
            case 'testName':
                break;
            case 'tags':
                break;
            case 'version':
                break;
            case 'config':
                // ignore
                return;
        }
        spec[key] = value;
    });

    if (!spec.browserName) {
        throw new Error('browserName is required!');
    }

    baseBrowserDecorator(this);

    this.name = spec.browserName + ' via Remote WebDriver';
    function handleXUaCompatible(args, urlObj) {
        if (args['x-ua-compatible']) {
            urlObj.query['x-ua-compatible'] = args['x-ua-compatible'];
        }
    }

    function formatError(err) {
        return err.message + '\n' + (err.data ? '  ' + err.data : '')
    }

    function heartbeat() {
        pendingHeartBeat = setTimeout(function() {
            log.debug('Heartbeat to Selenium Hub (%s) - fetching session', spec.browserName);
            self.driver.title()
                .then(function(){
                    log.debug('Heartbeat to Selenium Hub (%s) - session active', spec.browserName);
                }, function(err) {
                    if(killForce)
                        return self._done();
                    log.error('Heartbeat to %s failed\n  %s', spec.browserName, formatError(err))
                    sessionIsReady = false;
                    clearTimeout(pendingHeartBeat)
                    return self._done('failure');
                });
            heartbeat();
        }, 10000)
    }

    this._start = function(url) {
        if(killForce)
            return false;

        url = url.replace('localhost:', '172.17.0.1:');

        log.debug('Starting the %s driver', spec.browserName);
        var urlObj = urlparse(url, true);

        handleXUaCompatible(spec, urlObj);

        delete urlObj.search; //url.format does not want search attribute
        url = urlformat(urlObj);

        log.debug('WebDriver config: ' + JSON.stringify(config));
        log.debug('Browser capabilities: ' + JSON.stringify(spec));

        sessionIsReady = true;

        self.driver = wd.remote(config, 'promiseChain');

        self.driver
            .init(spec)
                .then(function(){
                    log.info('Estableshing connection to ' + url);
                    return self.driver.get(url)
                        .then(heartbeat, function(err) {
                            log.error('Can not start %s\n  %s', spec.browserName, formatSauceError(err))
                            sessionIsReady = false;
                            return self._done('failure')
                        })
                })
                .done();
    };

    this._onKillTimeout = this._onProcessExit = function(done) {
        killForce = true;
        log.debug('Shutting down the %s driver', spec.browserName);
        self.driver.quit().then(function(){
            self._done();
            done();
            sessionIsReady = false;
        });
    };

    self.on('done', function(){
        log.debug('Finish connection of %s driver', spec.browserName);
    });

    self.on('kill', function(done) {
        killForce = true;
        pendingHeartBeat && clearInterval(pendingHeartBeat);
        log.debug('Shutting down the %s driver', spec.browserName);
        self.driver.quit().then(function(){
            self._done();
            done();
            sessionIsReady = false;
        });
    })
};

WebDriverInstance.prototype = {
    name: 'WebDriver',

    DEFAULT_CMD: {
        linux: require('wd').path,
        darwin: require('wd').path,
        win32: require('wd').path
    },
    ENV_CMD: 'WEBDRIVER_BIN'
};

WebDriverInstance.$inject = ['baseBrowserDecorator', 'args', 'logger'];

// PUBLISH DI MODULE
module.exports = {
    'launcher:WebDriver': ['type', WebDriverInstance]
};
//
//
// (function()) {
//     var wd = require('wd')
//
//     function formatSauceError(err) {
//         return err.message + '\n' + (err.data ? '  ' + err.data : '')
//     }
//
//     function processConfig(helper, config, args) {
//         config = config || {}
//         args = args || {}
//
//         var username = args.username || config.username || process.env.SAUCE_USERNAME
//         var accessKey = args.accessKey || config.accessKey || process.env.SAUCE_ACCESS_KEY
//         var startConnect = config.startConnect !== false
//         var tunnelIdentifier = args.tunnelIdentifier || config.tunnelIdentifier
//
//         if (startConnect && !tunnelIdentifier) {
//             tunnelIdentifier = 'karma' + Math.round(new Date().getTime() / 1000)
//         }
//
//         var browserName = args.browserName +
//             (args.version ? ' ' + args.version : '') +
//             (args.platform ? ' (' + args.platform + ')' : '')
//
//         var connectOptions = helper.merge(config.connectOptions, {
//             username: username,
//             accessKey: accessKey,
//             tunnelIdentifier: tunnelIdentifier
//         })
//
//         var build = process.env.BUILD_NUMBER ||
//             process.env.BUILD_TAG ||
//             process.env.CI_BUILD_NUMBER ||
//             process.env.CI_BUILD_TAG ||
//             process.env.TRAVIS_BUILD_NUMBER ||
//             process.env.CIRCLE_BUILD_NUM ||
//             process.env.DRONE_BUILD_NUMBER
//
//         var defaults = {
//             version: '',
//             platform: 'ANY',
//             tags: [],
//             name: 'Karma Test',
//             'tunnel-identifier': tunnelIdentifier,
//             'record-video': false,
//             'record-screenshots': false,
//             'device-orientation': null,
//             'disable-popup-handler': true,
//             build: build || null,
//             public: null,
//             customData: {}
//         }
//
//         var options = helper.merge(
//             // Legacy
//             config.options,
//             defaults, {
//                 // Pull out all the properties from the config that
//                 // we are interested in
//                 name: config.testName,
//                 build: config.build,
//                 'record-video': config.recordVideo,
//                 'record-screenshots': config.recordScreenshots,
//                 public: config.public,
//                 customData: config.customData
//             }, {
//                 // Need to rename some properties from args
//                 name: args.testName,
//                 'record-video': args.recordVideo,
//                 'record-screenshots': args.recordScreenshots
//             }, args
//         )
//
//         return {
//             options: options,
//             connectOptions: connectOptions,
//             browserName: browserName,
//             username: username,
//             accessKey: accessKey,
//             startConnect: startConnect
//         }
//     }
//
//     var SauceLauncher = function(
//         args, sauceConnect,
//         /* config.sauceLabs */
//         config,
//         logger, helper,
//         baseLauncherDecorator, captureTimeoutLauncherDecorator, retryLauncherDecorator,
//         /* sauce:jobMapping */
//         jobMapping
//     ) {
//         var self = this
//
//         baseLauncherDecorator(self)
//         captureTimeoutLauncherDecorator(self)
//         retryLauncherDecorator(self)
//
//         var pConfig = processConfig(helper, config, args)
//         var options = pConfig.options
//         var connectOptions = pConfig.connectOptions
//         var browserName = pConfig.browserName
//         var username = pConfig.username
//         var accessKey = pConfig.accessKey
//         var startConnect = pConfig.startConnect
//
//         var pendingCancellations = 0
//         var sessionIsReady = false
//
//         self.name = browserName + ' on SeleniumWebDriver'
//
//         var pendingHeartBeat
//
//         var log = logger.create('launcher.selenium')
//         var driverLog = logger.create('wd')
//
//         var driver = wd.promiseChainRemote('127.0.0.1', 4444)
//
//         driver.on('status', function(info) {
//             driverLog.debug(info.cyan)
//         })
//
//         driver.on('command', function(eventType, command, response) {
//             driverLog.debug(' > ' + eventType.cyan, command, (response || '').grey)
//         })
//
//         driver.on('http', function(meth, path, data) {
//             driverLog.debug(' > ' + meth.magenta, path, (data || '').grey)
//         })
//
//         var heartbeat = function() {
//             pendingHeartBeat = setTimeout(function() {
//                 log.debug('Heartbeat to Selenium Hub (%s) - fetching title', browserName)
//
//                 driver.title()
//                     .then(null, function(err) {
//                         log.error('Heartbeat to %s failed\n  %s', browserName, formatSauceError(err))
//
//                         clearTimeout(pendingHeartBeat)
//                         return self._done('failure')
//                     })
//
//                 heartbeat()
//             }, 60000)
//         }
//
//         var start = function(url) {
//             driver
//                 .init(options)
//                 .then(function() {
//                     if (pendingCancellations > 0) {
//                         pendingCancellations--
//                         return
//                     }
//                     // Record the job details, so we can access it later with the reporter
//                     jobMapping[self.id] = {
//                         jobId: driver.sessionID,
//                         credentials: {
//                             username: username,
//                             password: accessKey
//                         }
//                     }
//
//                     sessionIsReady = true
//
//                     log.info('%s session at https://saucelabs.com/tests/%s', browserName, driver.sessionID)
//                     log.debug('WebDriver channel for %s instantiated, opening %s', browserName, url)
//
//                     return driver.get(url)
//                         .then(heartbeat, function(err) {
//                             log.error('Can not start %s\n  %s', browserName, formatSauceError(err))
//                             return self._done('failure')
//                         })
//                 }, function(err) {
//                     if (pendingCancellations > 0) {
//                         pendingCancellations--
//                         return
//                     }
//
//                     log.error('Can not start %s\n  %s', browserName, formatSauceError(err))
//                     return self._done('failure')
//                 })
//                 .done()
//         }
//
//         self.on('start', function(url) {
//             if (pendingCancellations > 0) {
//                 pendingCancellations--
//                 return
//             }
//
//             if (startConnect) {
//                 //sauceConnect.start(connectOptions)
//                 .then(function() {
//                     if (pendingCancellations > 0) {
//                         pendingCancellations--
//                         return
//                     }
//
//                     start('http://172.17.0.1:9876')
//                 }, function(err) {
//                     pendingCancellations--
//                     log.error('Can not start %s\n  Failed to start Sauce Connect:\n  %s', browserName, err.message)
//
//                     self._retryLimit = -1 // don't retry
//                     self._done('failure')
//                 })
//             } else {
//                 start(url)
//             }
//         });
//
//         self.on('kill', function(done) {
//             var allDone = function() {
//                 self._done()
//                 done()
//             }
//
//             if (sessionIsReady) {
//                 if (pendingHeartBeat) {
//                     clearTimeout(pendingHeartBeat)
//                 }
//
//                 log.debug('Shutting down the %s driver', browserName)
//                 driver.quit().nodeify(allDone)
//                 sessionIsReady = false
//             } else {
//                 pendingCancellations++
//                 process.nextTick(allDone)
//             }
//         })
//     }
//
//     //module.exports = SauceLauncher
// });

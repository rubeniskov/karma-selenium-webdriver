const wd = require('wd'),
    url = require('url'),
    q = require('q'),
    deepExtend = require('deep-extend'),
    configure = function() {
        var defaults = deepExtend({}, arguments[0]),
            obj = deepExtend.apply(null, arguments),
            res = {};
        Object.keys(defaults).forEach(function(key) {
            res[key] = obj[key];
        });
        return res;
    };

var SeleniumWebDriver = function(baseBrowserDecorator, cfg, args, id, logger) {

    baseBrowserDecorator(this);

    var self = this,
        log = logger.create('SeleniumWebDriver'),
        config = configure({
            protocol: cfg.protocol || 'http',
            hostname: cfg.hostname,
            port: 4444
        }, cfg.seleniumConfig, (args || {}).config),
        browser = configure({
            protocol: cfg.protocol || 'http',
            hostname: cfg.hostname,
            port: cfg.port
        }, (cfg.seleniumConfig || {}).browser, ((args || {}).config || {}).browser),
        spec = configure({
            browserName: false,
            platform: 'ANY',
            name: 'Karma test',
            tags: [],
            version: ''
        }, args),
        scope = {
            sessionIsReady: false,
            pendingHeartBeat: true,
            promises: {},
            heartbeat: function(driver) {
                scope.pendingHeartBeat = setTimeout(function() {
                    log.debug('Heartbeat to Selenium Hub (%s) - fetching session', spec.browserName);
                    driver.title(function(err, title) {
                        if (err || title !== 'Karma') {
                            log.error('Heartbeat to %s failed %s', spec.browserName, err ? scope.formatError(err) : 'Service unavalible');
                            clearTimeout(scope.pendingHeartBeat);
                            return self._done();
                        }
                        log.debug('Heartbeat to Selenium Hub (%s) - session active', spec.browserName);
                        scope.heartbeat(driver);
                    });
                }, 60000)
            },
            formatError(err) {
                return err.message + '\n' + (err.data ? '  ' + err.data : '')
            }
        };

    if (!spec.browserName) {
        throw new Error('browserName is required!');
    };

    log.info('Browser %s (kid:%s) created', spec.browserName, id);

    self.name = spec.browserName + ' via Remote SeleniumWebDriver';
    self.id = id;

    self.start = function(kurl) {
        kurl = configure(url.parse(kurl), browser);
        kurl = url.format(configure(kurl, {
            host: kurl.hostname + ':' + kurl.port,
            query: {
                id: id
            }
        }));

        self.browser = wd.remote(config);
        self.browser.init(spec, function(err) {
            if (err)
                return log.error('Browser %s driver initialize failed %s', spec.browserName, scope.formatError(err));
            log.debug('Browser %s driver connecting %s', spec.browserName, kurl);
            self.browser.get(kurl, function(err) {
                if (err)
                    return log.error('Browser driver failed %s %s', kurl, scope.formatError(err));
                log.debug('Browser %s driver connected %s', spec.browserName, kurl);
                scope.heartbeat(self.browser);
            });
        });

        self.browser.on('status', function(info) {
            log.debug(info.cyan)
        });

        self.browser.on('command', function(eventType, command, response) {
            log.debug(' > ' + eventType.cyan, command, (response || '').grey)
        });

        self.browser.on('http', function(meth, path, data) {
            log.debug(' > ' + meth.magenta, path, (data || '').grey)
        });
    };

    self.kill = function(done) {
        if (scope.promises.kill)
            return scope.promises.kill;

        var deferred = q.defer();
        self.getSession(function(sessionID) {
            log.debug('Browser %s requested to kill, session id is %s', spec.browserName, sessionID);
            if (sessionID) {
                self.driver && self.driver.quit(function(err) {
                    log.debug('Browser %s close connection %s', spec.browserName, sessionID);
                    if (err) {
                        log.error('Browser %s driver failed %s %s', spec.browserName, kurl, scope.formatError(err));
                        deferred.reject();
                    }
                    deferred.resolve();
                    self._done();
                });
            } else {
                self._done();
                return deferred.reject();
            }
            done();
        });
        return (scope.promises.kill = deferred.promise);
    };

    this.killAll = function(callback) {
        log.debug('Disconnecting all browsers')
        if (!self.driver) {
            return process.nextTick(callback)
        }

        self.kill(callback);
    };
};

SeleniumWebDriver.prototype = {
    name: 'SeleniumWebDriver',
    DEFAULT_CMD: {
        linux: require('wd').path,
        darwin: require('wd').path,
        win32: require('wd').path
    },
    isCaptured: function() {
        return !!this.driver;
    },
    toString: function() {
        return this.name || 'Unnamed SeleniumWebdriverBrowser';
    },
    getSession: function(cb) {
        if (!this.driver)
            return cb(null);
        cb && cb.call && cb(this.driver.sessionID);
        return this.driver.sessionID;
    }
};

SeleniumWebDriver.$inject = ['baseBrowserDecorator', 'config', 'args', 'id', 'logger'];

module.exports = {
    'launcher:SeleniumWebDriver': ['type', SeleniumWebDriver]
};

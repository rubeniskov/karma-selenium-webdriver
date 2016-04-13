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

var SeleniumWebDriver = function(baseBrowserDecorator, cfg, args, id, injector, emitter, logger) {

    baseBrowserDecorator(this);

    var self = this,
        log = logger.create('selenium-webdriver'),
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
            promises: {},
            intervals: {},
            formatError(err) {
                return err.message + '\n' + (err.data ? '  ' + err.data : '')
            }
        },
        ourl = (function(surl) {
            return configure(surl, {
                host: surl.hostname + ':' + surl.port,
                query: {
                    id: id
                }
            });
        })(configure(browser));

    if (!spec.browserName) {
        throw new Error('browserName is required!');
    };

    log.info('Browser %s (kid:%s) created', spec.browserName, id);

    self.name = spec.browserName + ' via Remote SeleniumWebDriver';
    self.id = id;

    self._start = function() {
        var kurl = url.format(ourl);

        self.browser = wd.remote(config);
        self.browser.init(spec, function(err) {
            if (err)
                return log.error('Browser %s driver initialize failed %s', spec.browserName, scope.formatError(err));
            log.debug('Browser %s driver connecting %s', spec.browserName, kurl);

            if (scope.session) {
                self.browser.attach(scope.session, function(err, capabilities) {
                    if (err) {
                        log.debug('Browser driver failed to attach session %s %s', scope.session, scope.formatError(err));
                        log.info('Trying create new session');
                        scope.session = null;
                        self._start();
                    }
                    self.markCaptured();
                    log.info('Browser driver session attached %s', scope.session);
                });
            } else {
                self.browser.get(kurl, function(err) {
                    if (err)
                        return log.error('Browser driver failed %s %s', kurl, scope.formatError(err));
                    log.debug('Browser %s driver connected %s', spec.browserName, kurl);

                    self.getSession(function(sessionID) {
                        scope.session = sessionID;
                        self.markCaptured();
                        (args.pseudoActivityInterval || cfg.singleRun === false) &&
                            self.heartbeat(!cfg.singleRun ? args.pseudoActivityInterval || 5000 : args.pseudoActivityInterval);
                    });
                });
            }
        });

        self._process = {
            kill: function() {
                scope.intervals.hearbeat && clearInterval(scope.intervals.hearbeat);
                self.browser.quit(function() {
                    log.info('Killed ' + spec.browserName + '.');
                    self._onProcessExit(self.error ? -1 : 0, self.error);
                });
            }
        };


        self.browser.on('status', function(info) {
            log.debug(info.cyan);
        });

        self.browser.on('command', function(eventType, command, response) {
            log.debug(' > ' + eventType.cyan, command, (response || '').grey)
        });

        self.browser.on('http', function(meth, path, data) {
            log.debug(' > ' + meth.magenta, path, (data || '').grey)
        });
    };

    self.kill = function() {
        if (scope.promises.kill) {
            return scope.promises.kill
        }

        var deferred = q.defer();

        self.browser && self.browser.quit(function(err) {
            log.debug('Browser %s close connection %s', spec.browserName, sessionID);
            if (err) {
                log.error('Browser %s driver failed %s %s', spec.browserName, kurl, scope.formatError(err));
                deferred.reject();
            }
            self.state = self.FINISHED;
            self._onProcessExit(self.error ? -1 : 0, self.error);
            deferred.resolve();
        });

        self.state = self.BEING_KILLED

        return (scope.promises.kill = deferred.promise);
    }

    self.restart = function() {
        if (self.state === self.BEING_FORCE_KILLED) {
            return
        }

        if (!scope.promises.kill) {
            self.kill();
        }

        scope.promises.kill.then(function() {
            if (self.state === self.BEING_FORCE_KILLED) {
                self.state = self.FINISHED
            } else {
                scope.promises.kill = null
                log.debug('Restarting %s', self.name)
                self.start();
            }
        });

        self.state = self.RESTARTING
    };

    self._done = function(error) {
        console.log('DONEE');
        self.error = self.error || error
        self.emit('done')

        if (self.error && self.state !== self.BEING_FORCE_KILLED && self.state !== RESTARTING) {
            emitter.emit('browser_process_failure', self)
        }

        self.state = self.FINISHED
    }

    self.forceKill = function() {
        self.state = self.BEING_FORCE_KILLED
        return self.kill();;
    };

    self.heartbeat = function(interval) {
        scope.intervals.hearbeat = setTimeout(function() {
            log.debug('Heartbeat to Selenium Hub (%s) - fetching session', spec.browserName);
            self.browser.title(function(err, title) {
                if (err || title !== 'Karma') {
                    log.error('Heartbeat to %s failed %s', spec.browserName, err ? scope.formatError(err) : 'Service unavalible');
                    clearTimeout(scope.intervals.hearbeat);
                }
                log.debug('Heartbeat to Selenium Hub (%s) - session active', spec.browserName);
                self.heartbeat(interval);
            });
        }, interval)
    };

    self._done = function(error) {
        scope.promises.kill = scope.promises.kill || q.defer();

        self.error = self.error || error;

        self.emit('done');

        if (self.error && self.state !== self.BEING_FORCE_KILLED && self.state !== self.RESTARTING) {
            emitter.emit('browser_process_failure', self)
        }

        self.state = self.FINISHED
    }

    self.toString = function() {
        return self.name || 'Unnamed SeleniumWebdriverBrowser';
    };

    self.getSession = function(cb) {
        if (!self.browser)
            return cb(null);
        cb && cb.call && cb(self.browser.sessionID);
        return self.browser.sessionID;
    };

    self._restart = function() {};

    self._onKillTimeout = function() {};

    self._execCommand = function() {}
};

SeleniumWebDriver.prototype = {
    name: 'SeleniumWebDriver',
    DEFAULT_CMD: {
        linux: require('wd').path,
        darwin: require('wd').path,
        win32: require('wd').path
    },
    ENV_CMD: 'WEBDRIVER_BIN'
};

SeleniumWebDriver.$inject = ['baseBrowserDecorator', 'config', 'args', 'id', 'injector', 'emitter', 'logger'];

module.exports = {
    'launcher:SeleniumWebDriver': ['type', SeleniumWebDriver]
};

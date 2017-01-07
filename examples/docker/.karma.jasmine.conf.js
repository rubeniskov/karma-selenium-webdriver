module.exports = function(karma) {
    karma.set({
        frameworks: ['jasmine'],
        logLevel: 'INFO',
        colors: true,
        captureTimeout: 60000,
        singleRun: true,
        autoWatch: false,
        concurrency: 1,
        files: [
            'src/dummy.js',
            'test/specs.js'
        ],
        customLaunchers: {
            swd_linux_chrome: {
                browserName: 'chrome',
                base: 'SeleniumWebDriver'
            },
            swd_linux_firefox: {
                browserName: 'firefox',
                base: 'SeleniumWebDriver'
            }
        },
        reporters: ['dots', 'progress'],
        browsers: [
          'swd_linux_chrome',
          'swd_linux_firefox'
        ]
    });
};

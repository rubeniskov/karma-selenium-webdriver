module.exports = function(grunt) {
    grunt.initConfig({
        'npm-publish': {
            options: {
                abortIfDirty: true,
                tag: 'latest'
            }
        },
        'bump': {
            options: {
                files: ['package.json'],
                updateConfigs: [],
                commit: true,
                commitMessage: 'bump: release v%VERSION%',
                commitFiles: ['package.json'],
                createTag: true,
                tagName: 'v%VERSION%',
                tagMessage: 'Version %VERSION%',
                push: true,
                pushTo: 'origin',
                gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d',
                metadata: '',
            }
        }
    });
    grunt.loadNpmTasks('grunt-npm');
    grunt.loadNpmTasks('grunt-bump');
    return grunt.registerTask('release', 'Bump the version and publish to NPM.', function(type) {
        return grunt.task.run('Update version type ' + type, ['bump:' + (type || 'patch'), 'npm-publish']);
    });
};

'use strict';

module.exports = {
    'reporter': 'mocha-multi',
    'reporter-option': ['spec=-,xunit=xunit/test-results.xml'],
    'require': './test/fixtures.js',
    'timeout': '10000',
};

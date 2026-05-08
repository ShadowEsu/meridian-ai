'use strict';
module.exports = {
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 10000,
    pool: 'forks',
    globals: true,
  },
};

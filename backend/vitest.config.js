module.exports = {
  test: {
    environment: 'node',
    include: ['../tests/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
};

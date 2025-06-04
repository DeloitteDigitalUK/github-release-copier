// Enable Jest's automatic mocking features
jest.mock('@octokit/rest');

// Set proper mocking environment
Object.defineProperty(global, 'fs', {
  value: require('fs')
});

// Make sure directories exist for file operations during tests
process.env.TEMP_DIR = '/tmp/release-copier-test';

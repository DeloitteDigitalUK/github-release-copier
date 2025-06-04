import { jest } from '@jest/globals';
import * as os from 'os';

// Mock all dependencies at the module level
jest.mock('fs');
jest.mock('@octokit/rest');
jest.mock('node:path');
jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp')
}));

describe('Upload Service', () => {
  let mockOctokit: any;
  let mockCreateRelease: jest.Mock;
  let mockUploadReleaseAsset: jest.Mock;
  let fs: any;
  let path: any;
  let uploadAssets: any;
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mocks
    fs = require('fs');
    fs.readFileSync = jest.fn().mockReturnValue(Buffer.from('mock content'));
    fs.mkdtempSync = jest.fn((prefix) => prefix + Math.random().toString(36).slice(2, 10));

    path = require('node:path');
    path.join = jest.fn((...args) => args.join('/'));

    // Create system temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-copier-upload-test-'));

    // @ts-ignore - TypeScript doesn't like the return type of mockResolvedValue
    mockCreateRelease = jest.fn().mockResolvedValue({
      data: { id: 789 }
    });

    // @ts-ignore - TypeScript doesn't like the return type of mockResolvedValue
    mockUploadReleaseAsset = jest.fn().mockResolvedValue({
      data: { id: 901, name: 'asset1.zip' }
    });

    // Mock Octokit constructor
    mockOctokit = {
      repos: {
        createRelease: mockCreateRelease,
        uploadReleaseAsset: mockUploadReleaseAsset
      }
    };

    const { Octokit } = require('@octokit/rest');
    Octokit.mockImplementation(() => mockOctokit);

    // Mock global fetch
    global.fetch = jest.fn() as any;

    // Import the module under test after setting up all mocks
    uploadAssets = require('../upload-service').uploadAssets;
  });

  it('should create a release and upload assets', async () => {
    // Setup test data
    const mockRelease = {
      body: 'Release notes',
      assets: ['asset1.zip', 'asset2.zip']
    };

    // Call the function
    await uploadAssets(
      'mock-token',
      'dest-owner',
      'dest-repo',
      'v1.0.0',
      tempDir,
      mockRelease
    );

    // Assertions
    expect(fs.readFileSync).toHaveBeenCalledTimes(mockRelease.assets.length);

    expect(mockCreateRelease).toHaveBeenCalledWith({
      owner: 'dest-owner',
      repo: 'dest-repo',
      tag_name: 'v1.0.0',
      body: 'Release notes'
    });

    // Verify upload was called for each asset
    expect(mockUploadReleaseAsset).toHaveBeenCalledTimes(mockRelease.assets.length);
    expect(mockUploadReleaseAsset).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'dest-owner',
      repo: 'dest-repo',
      release_id: 789,
      name: 'asset1.zip'
    }));

    expect(mockUploadReleaseAsset).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'dest-owner',
      repo: 'dest-repo',
      release_id: 789,
      name: 'asset2.zip'
    }));
  });
});

import { jest } from '@jest/globals';
import fs from 'fs';

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));
jest.mock('../assets');

// Save the original process
const originalProcess = { ...process };
const originalArgv = [...process.argv];
const originalEnv = { ...process.env };

// Import the function after mocking dependencies
import { copyRelease, CopyReleaseConfig } from '../copy-release';
import {downloadAssets, uploadAssets} from '../assets';

describe('Copy Release Function', () => {
  // Test configuration object
  const mockConfig: CopyReleaseConfig = {
    sourceApiKey: 'mock-source-api-key',
    sourceOwner: 'source-owner',
    sourceRepo: 'source-repo',
    destApiKey: 'mock-dest-api-key',
    destOwner: 'dest-owner',
    destRepo: 'dest-repo',
    tempDir: './temp-test-dir',
    releaseTag: 'v1.0.0',
    includeAssets: ['asset1', 'asset2'],
    bodyReplaceRegex: 'replace-this',
    bodyReplaceWith: 'replaced-text',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup file system mocks
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);

    // Setup download/upload mocks with proper jest mocking
    jest.mocked(downloadAssets).mockResolvedValue({
      body: 'Original release notes with replace-this text',
      assets: ['asset1.zip', 'asset2.zip']
    });

    jest.mocked(uploadAssets).mockResolvedValue(undefined);
  });

  afterAll(() => {
    // Restore original process
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  it('should copy a release from source to destination', async () => {
    // Call function with config containing the release tag
    await copyRelease(mockConfig);

    // Verify temp directory is created
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfig.tempDir);
    expect(fs.mkdirSync).toHaveBeenCalled();

    // Verify downloadAssets is called with correct parameters
    expect(downloadAssets).toHaveBeenCalledWith(
      mockConfig.sourceApiKey,
      mockConfig.includeAssets,
      mockConfig.sourceOwner,
      mockConfig.sourceRepo,
      mockConfig.releaseTag,
      mockConfig.tempDir
    );

    // Verify text replacement is performed
    expect(uploadAssets).toHaveBeenCalledWith(
      mockConfig.destApiKey,
      mockConfig.destOwner,
      mockConfig.destRepo,
      mockConfig.releaseTag,
      mockConfig.tempDir,
      {
        body: expect.stringContaining('replaced-text'),
        assets: ['asset1.zip', 'asset2.zip']
      }
    );
  });

  it('should handle case when temp dir already exists', async () => {
    // Mock that directory exists
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Call function
    await copyRelease(mockConfig);

    // Verify mkdir is not called
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('should handle case when no regex replacement is needed', async () => {
    // Create config without regex replacement
    const configWithoutRegex = {
      ...mockConfig,
      bodyReplaceRegex: undefined
    };

    // Mock release
    const mockRelease = {
      body: 'Release notes without replacement',
      assets: ['asset1.zip']
    };

    // @ts-ignore
    jest.mocked(downloadAssets).mockResolvedValue(mockRelease);

    // Call function
    await copyRelease(configWithoutRegex);

    // Verify body is unchanged
    expect(uploadAssets).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      mockRelease
    );
  });
});


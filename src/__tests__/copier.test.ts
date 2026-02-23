import { jest } from '@jest/globals';
import fs from 'fs';

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));
jest.mock('../assets');
jest.mock('@octokit/rest');

// Save the original process
const originalArgv = [...process.argv];
const originalEnv = { ...process.env };

// Import the function after mocking dependencies
import { copyRelease, CopyReleaseConfig } from '../copier';
import {downloadAssets, uploadAssets} from '../assets';
import { Octokit } from '@octokit/rest';

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

  it('should remove matched text when bodyReplaceWith is not provided', async () => {
    const configWithoutReplacement: CopyReleaseConfig = {
      ...mockConfig,
      bodyReplaceRegex: 'replace-this',
      bodyReplaceWith: undefined,
    };

    jest.mocked(downloadAssets).mockResolvedValue({
      body: 'Before replace-this after',
      assets: ['asset1.zip']
    });

    await copyRelease(configWithoutReplacement);

    expect(uploadAssets).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      {
        body: 'Before  after',
        assets: ['asset1.zip']
      }
    );
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

  describe('copyAllReleases functionality', () => {
    const mockOctokit = {
      repos: {
        listReleases: jest.fn() as jest.MockedFunction<any>,
        getReleaseByTag: jest.fn() as jest.MockedFunction<any>
      },
      paginate: jest.fn() as jest.MockedFunction<any>
    };

    beforeEach(() => {
      jest.mocked(Octokit).mockImplementation(() => mockOctokit as any);
      mockOctokit.repos.listReleases.mockClear();
      mockOctokit.repos.getReleaseByTag.mockClear();
      mockOctokit.paginate.mockClear();
      // Simulate Octokit's paginate: call the endpoint fn and return its data array
      mockOctokit.paginate.mockImplementation(async (fn: any, params: any) => {
        const result = await fn(params);
        return result.data;
      });
    });

    it('should validate that both copyAllReleases and releaseTag cannot be specified', async () => {
      const invalidConfig = {
        ...mockConfig,
        copyAllReleases: true,
        releaseTag: 'v1.0.0'
      };

      await expect(copyRelease(invalidConfig)).rejects.toThrow(
        'Cannot specify both copyAllReleases and releaseTag. Choose one or the other.'
      );
    });

    it('should validate that either copyAllReleases or releaseTag must be specified', async () => {
      const invalidConfig = {
        ...mockConfig,
        copyAllReleases: false,
        releaseTag: undefined
      };

      await expect(copyRelease(invalidConfig)).rejects.toThrow(
        'Must specify either copyAllReleases or releaseTag.'
      );
    });

    it('should copy all releases from oldest to newest, skipping existing ones', async () => {
      // Mock source releases (ordered by creation date)
      mockOctokit.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v2.0.0', created_at: '2023-02-01T00:00:00Z' },
          { tag_name: 'v1.0.0', created_at: '2023-01-01T00:00:00Z' },
          { tag_name: 'v3.0.0', created_at: '2023-03-01T00:00:00Z' }
        ]
      });

      // Mock destination checks: v1.0.0 exists, others don't
      mockOctokit.repos.getReleaseByTag
        .mockResolvedValueOnce({ data: { tag_name: 'v1.0.0' } }) // v1.0.0 exists
        .mockRejectedValueOnce({ status: 404 }) // v2.0.0 doesn't exist
        .mockRejectedValueOnce({ status: 404 }); // v3.0.0 doesn't exist

      // Mock download/upload for each release that will be copied
      jest.mocked(downloadAssets)
        .mockResolvedValueOnce({
          body: 'Release notes for v2.0.0',
          assets: ['asset2.zip']
        })
        .mockResolvedValueOnce({
          body: 'Release notes for v3.0.0',
          assets: ['asset3.zip']
        });

      const configWithCopyAll = {
        ...mockConfig,
        copyAllReleases: true,
        releaseTag: undefined
      };

      await copyRelease(configWithCopyAll);

      // Verify releases were fetched
      expect(mockOctokit.repos.listReleases).toHaveBeenCalledWith({
        owner: mockConfig.sourceOwner,
        repo: mockConfig.sourceRepo,
        per_page: 100
      });

      // Verify existence checks were made for all releases in order (oldest first)
      expect(mockOctokit.repos.getReleaseByTag).toHaveBeenCalledTimes(3);
      expect(mockOctokit.repos.getReleaseByTag).toHaveBeenNthCalledWith(1, {
        owner: mockConfig.destOwner,
        repo: mockConfig.destRepo,
        tag: 'v1.0.0'
      });
      expect(mockOctokit.repos.getReleaseByTag).toHaveBeenNthCalledWith(2, {
        owner: mockConfig.destOwner,
        repo: mockConfig.destRepo,
        tag: 'v2.0.0'
      });
      expect(mockOctokit.repos.getReleaseByTag).toHaveBeenNthCalledWith(3, {
        owner: mockConfig.destOwner,
        repo: mockConfig.destRepo,
        tag: 'v3.0.0'
      });

      // Verify only non-existing releases were downloaded and uploaded
      expect(downloadAssets).toHaveBeenCalledTimes(2);
      expect(uploadAssets).toHaveBeenCalledTimes(2);

      // Verify v2.0.0 was processed
      expect(downloadAssets).toHaveBeenNthCalledWith(1,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'v2.0.0',
        mockConfig.tempDir
      );

      // Verify v3.0.0 was processed
      expect(downloadAssets).toHaveBeenNthCalledWith(2,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'v3.0.0',
        mockConfig.tempDir
      );
    });

    it('should handle errors when checking if release exists', async () => {
      mockOctokit.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v1.0.0', created_at: '2023-01-01T00:00:00Z' }
        ]
      });

      // Mock a non-404 error (e.g., API rate limit)
      mockOctokit.repos.getReleaseByTag.mockRejectedValue({ status: 429, message: 'Rate limit exceeded' });

      const configWithCopyAll = {
        ...mockConfig,
        copyAllReleases: true,
        releaseTag: undefined
      };

      await expect(copyRelease(configWithCopyAll)).rejects.toMatchObject({
        status: 429,
        message: 'Rate limit exceeded'
      });
    });

    it('should sort releases by semantic version by default', async () => {
      // Mock source releases with semver tags in random order
      mockOctokit.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v1.10.0', created_at: '2023-02-01T00:00:00Z' },
          { tag_name: 'v1.0.0', created_at: '2023-01-01T00:00:00Z' },
          { tag_name: 'v2.0.0', created_at: '2023-03-01T00:00:00Z' }
        ]
      });

      // Mock all releases don't exist at destination
      mockOctokit.repos.getReleaseByTag.mockRejectedValue({ status: 404 });

      // Mock download/upload for each release
      jest.mocked(downloadAssets)
        .mockResolvedValueOnce({
          body: 'Release notes for v1.0.0',
          assets: ['asset1.zip']
        })
        .mockResolvedValueOnce({
          body: 'Release notes for v1.10.0',
          assets: ['asset2.zip']
        })
        .mockResolvedValueOnce({
          body: 'Release notes for v2.0.0',
          assets: ['asset3.zip']
        });

      const configWithCopyAll = {
        ...mockConfig,
        copyAllReleases: true,
        releaseTag: undefined,
        sortBySemver: true
      };

      await copyRelease(configWithCopyAll);

      // Verify releases were processed in semantic version order (1.0.0, 1.10.0, 2.0.0)
      expect(downloadAssets).toHaveBeenCalledTimes(3);
      expect(downloadAssets).toHaveBeenNthCalledWith(1,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'v1.0.0',
        mockConfig.tempDir
      );
      expect(downloadAssets).toHaveBeenNthCalledWith(2,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'v1.10.0',
        mockConfig.tempDir
      );
      expect(downloadAssets).toHaveBeenNthCalledWith(3,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'v2.0.0',
        mockConfig.tempDir
      );
    });

    it('should sort releases by creation date when sortBySemver is false', async () => {
      // Mock source releases in reverse chronological order
      mockOctokit.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'release-c', created_at: '2023-03-01T00:00:00Z' },
          { tag_name: 'release-a', created_at: '2023-01-01T00:00:00Z' },
          { tag_name: 'release-b', created_at: '2023-02-01T00:00:00Z' }
        ]
      });

      // Mock all releases don't exist at destination
      mockOctokit.repos.getReleaseByTag.mockRejectedValue({ status: 404 });

      // Mock download/upload for each release
      jest.mocked(downloadAssets)
        .mockResolvedValueOnce({
          body: 'Release notes for release-a',
          assets: ['asset1.zip']
        })
        .mockResolvedValueOnce({
          body: 'Release notes for release-b',
          assets: ['asset2.zip']
        })
        .mockResolvedValueOnce({
          body: 'Release notes for release-c',
          assets: ['asset3.zip']
        });

      const configWithDateSort = {
        ...mockConfig,
        copyAllReleases: true,
        releaseTag: undefined,
        sortBySemver: false
      };

      await copyRelease(configWithDateSort);

      // Verify releases were processed in creation date order (oldest first)
      expect(downloadAssets).toHaveBeenCalledTimes(3);
      expect(downloadAssets).toHaveBeenNthCalledWith(1,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'release-a',
        mockConfig.tempDir
      );
      expect(downloadAssets).toHaveBeenNthCalledWith(2,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'release-b',
        mockConfig.tempDir
      );
      expect(downloadAssets).toHaveBeenNthCalledWith(3,
        mockConfig.sourceApiKey,
        mockConfig.includeAssets,
        mockConfig.sourceOwner,
        mockConfig.sourceRepo,
        'release-c',
        mockConfig.tempDir
      );
    });
  });
});


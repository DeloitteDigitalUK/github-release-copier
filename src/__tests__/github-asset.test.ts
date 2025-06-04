import { Octokit } from '@octokit/rest';
import { jest } from '@jest/globals';
import { PassThrough } from 'stream';
import { fetchAssetDetails, downloadAsset } from '../github-asset';

// Mock Octokit class
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn(() => ({
      repos: {
        getReleaseAsset: jest.fn()
      }
    }))
  };
});

describe('GitHub Asset Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAssetDetails', () => {
    it('should fetch asset details successfully', async () => {
      const mockAssetDetails = {
        id: 123,
        name: 'asset.zip',
        size: 1024,
        browser_download_url: 'https://example.com/asset.zip'
      };

      // Create instance with mocked methods
      const octokit = new Octokit();
      // @ts-ignore - Ignore TypeScript errors for mock functions
      const mockGetReleaseAsset = octokit.repos.getReleaseAsset;

      // @ts-ignore - Ignore TypeScript errors for mock implementation
      mockGetReleaseAsset.mockResolvedValue({
        data: mockAssetDetails,
        status: 200,
        headers: {},
        url: '',
      });

      const result = await fetchAssetDetails(octokit, 'owner', 'repo', 123);

      expect(result).toEqual(mockAssetDetails);
      expect(mockGetReleaseAsset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        asset_id: 123,
      });
    });

    it('should throw an error when fetch fails', async () => {
      const octokit = new Octokit();
      // @ts-ignore - Ignore TypeScript errors for mock functions
      const mockGetReleaseAsset = octokit.repos.getReleaseAsset;

      // @ts-ignore - Ignore TypeScript errors for mock implementation
      mockGetReleaseAsset.mockRejectedValue(new Error('Not found'));

      await expect(fetchAssetDetails(octokit, 'owner', 'repo', 123))
        .rejects.toThrow();
    });
  });

  describe('downloadAsset', () => {
    it('should download asset as a stream', async () => {
      const mockStream = new PassThrough();
      mockStream.end('mock asset content');

      const octokit = new Octokit();
      // @ts-ignore - Ignore TypeScript errors for mock functions
      const mockGetReleaseAsset = octokit.repos.getReleaseAsset;

      // @ts-ignore - Ignore TypeScript errors for mock implementation
      mockGetReleaseAsset.mockResolvedValue({
        data: mockStream,
        status: 200,
        headers: {},
        url: '',
      });

      const result = await downloadAsset(octokit, 'owner', 'repo', 123);

      expect(result).toBe(mockStream);
    });

    it('should throw an error when download fails', async () => {
      const octokit = new Octokit();
      // @ts-ignore - Ignore TypeScript errors for mock functions
      const mockGetReleaseAsset = octokit.repos.getReleaseAsset;

      // @ts-ignore - Ignore TypeScript errors for mock implementation
      mockGetReleaseAsset.mockRejectedValue(new Error('Download failed'));

      await expect(downloadAsset(octokit, 'owner', 'repo', 123))
        .rejects.toThrow('Error downloading asset: 123: Error: Download failed');
    });
  });
});

import { jest } from '@jest/globals';
import { PassThrough } from 'stream';
import { downloadAssets } from '../download-service';
import * as githubAsset from '../github-asset';
import * as os from 'os';
import * as path from 'path';
import { Octokit } from '@octokit/rest';

// Properly type the mocked functions
jest.mock('../github-asset', () => ({
  fetchAssetDetails: jest.fn(),
  downloadAsset: jest.fn()
}));

// Mock fs module
jest.mock('fs', () => ({
  createWriteStream: jest.fn(() => new PassThrough()),
  mkdtempSync: jest.fn((prefix) => `${prefix}test-dir`)
}));

// Mock path and os
jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp')
}));

// Mock pipeline from node:stream/promises
jest.mock('node:stream/promises', () => ({
  pipeline: jest.fn(() => Promise.resolve()),
}));

// Setup mock data before creating Octokit mock
const mockReleaseData = {
  id: 456,
  tag_name: 'v1.0.0',
  body: 'Release notes',
  assets: [
    { id: 123, name: 'asset1.zip' },
    { id: 124, name: 'asset2.zip' },
    { id: 125, name: 'ignored.zip' }
  ]
};

// Mock Octokit class and its methods
// @ts-ignore - Ignore TypeScript errors for mock functions
const mockGetReleaseByTag = jest.fn().mockResolvedValue({
  data: mockReleaseData
});

// @ts-ignore - Ignore TypeScript errors for mock functions
const mockListReleaseAssets = jest.fn().mockResolvedValue({
  data: mockReleaseData.assets
});

jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn(() => ({
      repos: {
        getReleaseByTag: mockGetReleaseByTag,
        listReleaseAssets: mockListReleaseAssets,
      }
    }))
  };
});

// Mock fetch globally with type assertion
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
  })
) as unknown as typeof fetch;

describe('Download Service', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create system temp directory for tests
    const fs = require('fs');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-copier-test-'));
  });

  it('should download all assets matching the filter', async () => {
    // Cast mocks to appropriate type for TypeScript
    // @ts-ignore - Ignore TypeScript errors for mock implementation
    const mockedFetch = githubAsset.fetchAssetDetails as jest.MockedFunction<typeof githubAsset.fetchAssetDetails>;
    mockedFetch.mockImplementation(async (_octokit: any, _owner: string, _repo: string, assetId: number) => {
      const found = mockReleaseData.assets.find(a => a.id === assetId);
      return {
        name: found ? found.name : 'unknown',
      };
    });

    // @ts-ignore - Ignore TypeScript errors for mock implementation
    const mockedDownload = githubAsset.downloadAsset as jest.MockedFunction<typeof githubAsset.downloadAsset>;
    mockedDownload.mockImplementation(async () => {
      const stream = new PassThrough();
      stream.end('mock content');
      return stream;
    });

    // Run the function with the system temp directory
    const result = await downloadAssets(
      'mock-token',
      ['asset1', 'asset2'],
      'source-owner',
      'source-repo',
      'v1.0.0',
      tempDir
    );

    // Assertions
    expect(result).toEqual({
      body: 'Release notes',
      assets: expect.arrayContaining(['asset1.zip', 'asset2.zip'])
    });

    // Verify that fetchAssetDetails was called for each asset
    expect(mockedFetch).toHaveBeenCalledTimes(mockReleaseData.assets.length);

    // Verify getReleaseByTag was called with correct parameters
    expect(mockGetReleaseByTag).toHaveBeenCalledWith({
      owner: 'source-owner',
      repo: 'source-repo',
      tag: 'v1.0.0'
    });

    // Verify downloadAsset was called for matching assets
    const assetIdsThatShouldBeDownloaded = mockReleaseData.assets
      .filter(a => a.name === 'asset1.zip' || a.name === 'asset2.zip')
      .length;
    expect(mockedDownload).toHaveBeenCalledTimes(assetIdsThatShouldBeDownloaded);
  });
});


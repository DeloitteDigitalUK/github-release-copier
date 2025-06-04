import { Octokit } from "@octokit/rest";

/**
 * Fetches details for a specific release asset.
 * @param connection - Octokit instance.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param assetId - ID of the asset.
 * @returns Asset details.
 */
export async function fetchAssetDetails(
    connection: Octokit,
    owner: string,
    repo: string,
    assetId: number,
): Promise<{ name: string }> {
    const assetResponse = await connection.repos.getReleaseAsset({
        owner,
        repo,
        asset_id: assetId,
    });
    return assetResponse.data;
}

/**
 * Downloads a specific release asset.
 * @param connection - Octokit instance.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param assetId - ID of the asset.
 * @returns A readable stream of the asset data.
 */
export async function downloadAsset(
    connection: Octokit,
    owner: string,
    repo: string,
    assetId: number,
): Promise<NodeJS.ReadableStream> {
    try {
        const assetResponse = await connection.repos.getReleaseAsset({
            owner,
            repo,
            asset_id: assetId,
            headers: {
                accept: "application/octet-stream",
            },
            request: {
                parseSuccessResponseBody: false, // required to access response as stream
            },
        });
        return assetResponse.data as unknown as NodeJS.ReadableStream;
    } catch (e) {
        throw new Error(`Error downloading asset: ${assetId}: ${e}`);
    }
}

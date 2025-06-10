import {Octokit} from "@octokit/rest";
import {createWriteStream} from "node:fs";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {downloadAsset, fetchAssetDetails} from "./github-asset";
import fs from "fs";

export type Release = {
    body: string,
    assets: string[],
}

/**
 * Downloads assets from a GitHub release.
 * @param apiKey - GitHub API key.
 * @param assetFilter - Array of regex strings to filter assets by name. Undefined means include all.
 * @param owner - Source repository owner.
 * @param repo - Source repository name.
 * @param tag - Release tag.
 * @param outputDir - Directory to save downloaded assets.
 * @returns An object containing the release body and a list of downloaded asset names.
 */
export const downloadAssets = async (
    apiKey: string,
    assetFilter: string[] | undefined,
    owner: string,
    repo: string,
    tag: string,
    outputDir: string,
): Promise<Release> => {
    const connection = new Octokit({
        auth: apiKey,
        request: fetch,
    });

    const release = await connection.repos.getReleaseByTag({
        owner,
        repo,
        tag,
    });
    console.log(`Fetched release with ID: ${release.data.id}`);

    const assets = await connection.repos.listReleaseAssets({
        owner,
        repo,
        release_id: release.data.id,
    });
    console.log(`Release has ${assets.data.length} assets`);

    const includedAssets: string[] = [];
    for (const asset of assets.data) {
        const assetResponse = await fetchAssetDetails(connection, owner, repo, asset.id);
        const fileName = assetResponse?.name || '';

        // Check if name is defined and filter matches
        if (assetFilter && fileName && !assetFilter.some((filter) => {
            try {
                return fileName.match(new RegExp(filter));
            } catch (e) {
                console.error(`Invalid regex pattern: ${filter}`);
                return false;
            }
        })) {
            console.log(`Ignoring asset: ${fileName}`);
            continue
        }

        if (!fileName) {
            console.warn(`Asset ${asset.id} has no name, skipping`);
            continue;
        }

        includedAssets.push(fileName);
        console.log(`Downloading asset: ${fileName}...`);
        const assetStream = await downloadAsset(connection, owner, repo, asset.id);

        if (outputDir) {
            const outputFile = createWriteStream(path.join(outputDir, fileName));
            await pipeline(assetStream, outputFile);
        } else {
            console.warn('No output directory specified, skipping file download');
        }
    }

    return {
        assets: includedAssets,
        body: release.data.body ?? "",
    };
}
/**
 * Creates a new release and uploads assets to it.
 * @param apiKey - GitHub API key for the destination repository.
 * @param owner - Destination repository owner.
 * @param repo - Destination repository name.
 * @param tag - Tag for the new release.
 * @param inputDir - Directory containing the assets to upload.
 * @param release - Release object containing the body and asset names.
 */
export const uploadAssets = async (
    apiKey: string,
    owner: string,
    repo: string,
    tag: string,
    inputDir: string,
    release: Release,
) => {
    const connection = new Octokit({
        auth: apiKey,
        request: fetch,
    });

    console.log(`Creating release: ${tag}`);
    const releaseResponse = await connection.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        body: release.body,
    });

    for (const assetName of release.assets) {
        console.log(`Uploading release asset: ${assetName}`);

        // Add defensive check for input directory
        if (!inputDir) {
            console.warn(`No input directory specified for asset: ${assetName}, skipping`);
            continue;
        }

        const fullPath = path.join(inputDir, assetName);
        await connection.repos.uploadReleaseAsset({
            owner,
            repo,
            release_id: releaseResponse.data.id,
            name: assetName,
            // @ts-ignore - Buffer is actually valid here despite TypeScript error
            data: fs.readFileSync(fullPath),
        });
    }
};
import { Octokit } from "@octokit/rest";
import path from "node:path";
import * as fs from "fs";
import { Release } from "./download-service";

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

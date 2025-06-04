import {Octokit} from "@octokit/rest";
import fetch from "node-fetch";
import {createWriteStream} from "node:fs";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import * as fs from "fs";
import process = require("node:process");

const {
    SOURCE_API_KEY,
    SOURCE_OWNER,
    SOURCE_REPO,
    DEST_API_KEY,
    DEST_OWNER,
    DEST_REPO,
    TEMP_DIR,
    INCLUDE_ASSETS,
    BODY_REPLACE_REGEX,
    BODY_REPLACE_WITH,
} = process.env;

export type Release = {
    body: string,
    assets: string[],
}

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
        const fileName = assetResponse.name;
        if (assetFilter && !assetFilter.some((filter) => assetResponse.name.match(new RegExp(filter)))) {
            console.log(`Ignoring asset: ${fileName}`);
            continue
        }
        includedAssets.push(fileName);
        console.log(`Downloading asset: ${fileName}...`);
        const assetStream = await downloadAsset(connection, owner, repo, asset.id);

        const outputFile = createWriteStream(path.join(outputDir, fileName));
        await pipeline(assetStream, outputFile);
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

    const fs = require('fs');

    for (const assetName of release.assets) {
        console.log(`Uploading release asset: ${assetName}`);

        const fullPath = path.join(inputDir, assetName);
        await connection.repos.uploadReleaseAsset({
            owner,
            repo,
            release_id: releaseResponse.data.id,
            name: assetName,
            data: fs.readFileSync(fullPath),
        });
    }
};

export const copyRelease = async () => {
    let releaseTag: string;
    if (process.argv.length === 3) {
        releaseTag = process.argv[2];
    } else {
        throw new Error(`Must specify a release name`);
    }

    const tempDir = TEMP_DIR!;
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const includeAssets = INCLUDE_ASSETS?.split(/\s+/)?.filter((filter) => filter.length > 0);
    const sourceOwner = SOURCE_OWNER!;
    const sourceRepo = SOURCE_REPO!;

    const release = await downloadAssets(
        SOURCE_API_KEY!,
        includeAssets,
        sourceOwner,
        sourceRepo,
        releaseTag,
        tempDir,
    );

    if (BODY_REPLACE_REGEX?.length) {
        release.body = release.body.replace(new RegExp(BODY_REPLACE_REGEX, 'g'), BODY_REPLACE_WITH ?? "");
    }

    const destOwner = DEST_OWNER!;
    const destRepo = DEST_REPO!;

    await uploadAssets(
        DEST_API_KEY!,
        destOwner,
        destRepo,
        releaseTag,
        tempDir,
        release,
    );

    console.log(`Completed copying release ${releaseTag} from ${sourceOwner}/${sourceRepo} to ${destOwner}/${destRepo}`);
};

if (require.main === module) {
    copyRelease().then(() => {
        console.log("Action completed successfully.");
        process.exit(0);
    }).catch(error => {
        console.error("Action failed:", error.message || error);
        if (error.stack) {
            console.error(error.stack);
        }
        if (error.status) {
            console.error(`Octokit request failed with status ${error.status}`);
        }
        if (error.response && error.response.data) {
            console.error("Response data:", error.response.data);
        }
        process.exit(1);
    });
}

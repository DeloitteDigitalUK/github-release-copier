import * as fs from "fs";
import { Octokit } from "@octokit/rest";
import {downloadAssets, uploadAssets} from "./assets";

/**
 * Configuration for the copyRelease function
 */
export interface CopyReleaseConfig {
    sourceApiKey: string;
    sourceOwner: string;
    sourceRepo: string;
    destApiKey: string;
    destOwner: string;
    destRepo: string;
    tempDir: string;
    releaseTag?: string;
    copyAllReleases?: boolean;
    includeAssets?: string[];
    bodyReplaceRegex?: string;
    bodyReplaceWith?: string;
}

/**
 * Lists all releases from a repository, sorted from oldest to newest
 * @param apiKey GitHub API key
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Array of release tags sorted from oldest to newest
 */
async function listAllReleases(apiKey: string, owner: string, repo: string): Promise<string[]> {
    const connection = new Octokit({
        auth: apiKey,
        request: fetch,
    });

    const releases = await connection.repos.listReleases({
        owner,
        repo,
        per_page: 100, // GitHub's max per page
    });

    // Sort by created date (oldest first)
    const sortedReleases = releases.data.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return sortedReleases.map(release => release.tag_name);
}

/**
 * Checks if a release exists in the destination repository
 * @param apiKey GitHub API key
 * @param owner Repository owner
 * @param repo Repository name
 * @param tag Release tag to check
 * @returns True if the release exists, false otherwise
 */
async function releaseExists(apiKey: string, owner: string, repo: string, tag: string): Promise<boolean> {
    const connection = new Octokit({
        auth: apiKey,
        request: fetch,
    });

    try {
        await connection.repos.getReleaseByTag({
            owner,
            repo,
            tag,
        });
        return true;
    } catch (error: any) {
        if (error.status === 404) {
            return false;
        }
        throw error; // Re-throw non-404 errors
    }
}

/**
 * Copies a single release from source to destination
 * @param config Configuration object
 * @param releaseTag The tag of the release to copy
 */
async function copySingleRelease(config: CopyReleaseConfig, releaseTag: string): Promise<void> {
    // Create temporary directory if it doesn't exist
    if (!fs.existsSync(config.tempDir)) {
        fs.mkdirSync(config.tempDir);
    }

    // Download assets from source repository
    const release = await downloadAssets(
        config.sourceApiKey,
        config.includeAssets,
        config.sourceOwner,
        config.sourceRepo,
        releaseTag,
        config.tempDir,
    );

    // Replace text in release body if regex is provided
    if (config.bodyReplaceRegex?.length) {
        release.body = processBody(
            release.body,
            config.bodyReplaceRegex,
            config.bodyReplaceWith
        );
    }

    // Upload assets to destination repository
    await uploadAssets(
        config.destApiKey,
        config.destOwner,
        config.destRepo,
        releaseTag,
        config.tempDir,
        release,
    );

    console.log(`Completed copying release ${releaseTag} from ${config.sourceOwner}/${config.sourceRepo} to ${config.destOwner}/${config.destRepo}`);
}

/**
 * Copies a release from a source repository to a destination repository.
 * @param config Configuration object containing all necessary parameters
 * @returns Promise that resolves when the copy is complete
 */
export const copyRelease = async (config: CopyReleaseConfig) => {
    // Validate configuration
    if (config.copyAllReleases && config.releaseTag) {
        throw new Error("Cannot specify both copyAllReleases and releaseTag. Choose one or the other.");
    }

    if (!config.copyAllReleases && !config.releaseTag) {
        throw new Error("Must specify either copyAllReleases or releaseTag.");
    }

    if (config.copyAllReleases) {
        // Copy all releases mode
        console.log(`Fetching all releases from ${config.sourceOwner}/${config.sourceRepo}...`);
        const allReleases = await listAllReleases(config.sourceApiKey, config.sourceOwner, config.sourceRepo);
        console.log(`Found ${allReleases.length} releases to process`);

        for (const releaseTag of allReleases) {
            console.log(`Processing release: ${releaseTag}`);

            // Check if release already exists at destination
            const exists = await releaseExists(config.destApiKey, config.destOwner, config.destRepo, releaseTag);
            if (exists) {
                console.log(`Release ${releaseTag} already exists at destination, skipping...`);
                continue;
            }

            // Copy the release
            await copySingleRelease(config, releaseTag);
        }

        console.log(`Completed copying all releases from ${config.sourceOwner}/${config.sourceRepo} to ${config.destOwner}/${config.destRepo}`);
    } else {
        // Single release mode (original behavior)
        await copySingleRelease(config, config.releaseTag!);
    }
};

/**
 * Processes the release body text by applying regex replacement if configured
 * @param body The original release body text
 * @param regex Optional regex pattern to search for
 * @param replacement Optional replacement text
 * @returns The processed body text
 */
function processBody(body: string, regex?: string, replacement?: string): string {
    if (!regex || !replacement) {
        return body; // Return original if no replacement configured
    }

    try {
        const pattern = new RegExp(regex, 'g');
        return body.replace(pattern, replacement);
    } catch (error) {
        console.warn(`Warning: Invalid regex pattern '${regex}': ${error}`);
        return body; // Return original on error
    }
}

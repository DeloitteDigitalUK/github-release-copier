import * as fs from "fs";
import { Octokit } from "@octokit/rest";
import * as semver from "semver";
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
    sortBySemver?: boolean;
    includeAssets?: string[];
    bodyReplaceRegex?: string;
    bodyReplaceWith?: string;
}

/**
 * Lists all releases from a repository, sorted from oldest to newest
 * @param apiKey GitHub API key
 * @param owner Repository owner
 * @param repo Repository name
 * @param sortBySemver Whether to sort by semantic version (default: true) or by creation date
 * @returns Array of release tags sorted from oldest to newest
 */
async function listAllReleases(apiKey: string, owner: string, repo: string, sortBySemver: boolean = true): Promise<string[]> {
    const connection = new Octokit({
        auth: apiKey,
        request: fetch,
    });

    // Fetch ALL releases using pagination
    const allReleases = await connection.paginate(connection.repos.listReleases, {
        owner,
        repo,
        per_page: 100, // GitHub's max per page
    });

    console.log(`DEBUG: Fetched ${allReleases.length} total releases from ${owner}/${repo}`);

    if (sortBySemver) {
        // Sort by semantic version (oldest first)
        const validVersions: Array<{tag: string, version: semver.SemVer, originalData: any}> = [];
        const invalidVersions: Array<{tag: string, originalData: any}> = [];

        for (const release of allReleases) {
            const version = semver.valid(semver.coerce(release.tag_name));
            if (version) {
                validVersions.push({
                    tag: release.tag_name,
                    version: new semver.SemVer(version),
                    originalData: release
                });
            } else {
                invalidVersions.push({
                    tag: release.tag_name,
                    originalData: release
                });
            }
        }

        // Sort valid semantic versions
        validVersions.sort((a, b) => semver.compare(a.version, b.version));

        // Sort invalid versions by creation date
        invalidVersions.sort((a, b) =>
            new Date(a.originalData.created_at).getTime() - new Date(b.originalData.created_at).getTime()
        );

        const sortedTags = [
            ...validVersions.map(v => v.tag),
            ...invalidVersions.map(v => v.tag)
        ];

        // Debug output
        console.log(`DEBUG: Found ${validVersions.length} valid semver releases and ${invalidVersions.length} invalid ones`);
        console.log(`DEBUG: First 10 sorted releases: ${sortedTags.slice(0, 10).join(', ')}`);
        if (validVersions.length > 0) {
            console.log(`DEBUG: First semver release: ${validVersions[0].tag} (${validVersions[0].version.version})`);
            console.log(`DEBUG: Last semver release: ${validVersions[validVersions.length - 1].tag} (${validVersions[validVersions.length - 1].version.version})`);
        }

        return sortedTags;
    } else {
        // Sort by created date (oldest first)
        const sortedReleases = allReleases.sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        return sortedReleases.map((release: any) => release.tag_name);
    }
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
        const sortBySemver = config.sortBySemver !== false; // Default to true
        const allReleases = await listAllReleases(config.sourceApiKey, config.sourceOwner, config.sourceRepo, sortBySemver);
        console.log(`Found ${allReleases.length} releases to process${sortBySemver ? ' (sorted by semantic version)' : ' (sorted by creation date)'}`);

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
    if (!regex) {
        return body; // Return original if no regex configured
    }

    if (!replacement) {
        // effectively remove matched text if replacement is not provided
        replacement = '';
    }

    try {
        const pattern = new RegExp(regex, 'g');
        return body.replace(pattern, replacement);
    } catch (error) {
        console.warn(`Warning: Invalid regex pattern '${regex}': ${error}`);
        return body; // Return original on error
    }
}

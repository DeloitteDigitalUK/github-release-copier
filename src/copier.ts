import * as fs from "fs";
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
    releaseTag: string;
    includeAssets?: string[];
    bodyReplaceRegex?: string;
    bodyReplaceWith?: string;
}

/**
 * Copies a release from a source repository to a destination repository.
 * @param config Configuration object containing all necessary parameters
 * @returns Promise that resolves when the copy is complete
 */
export const copyRelease = async (config: CopyReleaseConfig) => {
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
        config.releaseTag,
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
        config.releaseTag,
        config.tempDir,
        release,
    );

    console.log(`Completed copying release ${config.releaseTag} from ${config.sourceOwner}/${config.sourceRepo} to ${config.destOwner}/${config.destRepo}`);
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

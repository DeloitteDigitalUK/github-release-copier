import * as fs from "fs";
import process = require("node:process");
import {downloadAssets, Release, uploadAssets} from "./assets";
import { copyRelease, CopyReleaseConfig } from "./copy-release";

// Export all the functions for backward compatibility
export type { Release } from "./assets";
export { fetchAssetDetails, downloadAsset } from "./github-asset";
export { downloadAssets } from "./assets";
export { copyRelease, CopyReleaseConfig } from "./copy-release";

if (require.main === module) {
    if (process.argv.length < 3) {
        console.error("Error: Must specify a release name");
        process.exit(1);
    }

    const releaseTag = process.argv[2];

    // Create config object from environment variables
    const config: CopyReleaseConfig = {
        sourceApiKey: process.env.SOURCE_API_KEY!,
        sourceOwner: process.env.SOURCE_OWNER!,
        sourceRepo: process.env.SOURCE_REPO!,
        destApiKey: process.env.DEST_API_KEY!,
        destOwner: process.env.DEST_OWNER!,
        destRepo: process.env.DEST_REPO!,
        tempDir: process.env.TEMP_DIR!,
        releaseTag: releaseTag,
        // Parse include assets pattern if provided
        includeAssets: process.env.INCLUDE_ASSETS?.split(/\s+/)?.filter((filter) => filter.length > 0),
        bodyReplaceRegex: process.env.BODY_REPLACE_REGEX,
        bodyReplaceWith: process.env.BODY_REPLACE_WITH,
    };

    // Call copyRelease with the config object
    copyRelease(config).then(() => {
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
export {uploadAssets} from "./assets";
import process = require("node:process");
import { copyRelease, CopyReleaseConfig } from "./copier";

if (require.main === module) {
    const copyAllReleases = process.env.COPY_ALL_RELEASES === 'true';
    const releaseTag = process.argv[2];

    if (!copyAllReleases && process.argv.length < 3) {
        console.error("Error: Must specify a release name or set COPY_ALL_RELEASES=true");
        process.exit(1);
    }

    if (copyAllReleases && releaseTag) {
        console.error("Error: Cannot specify both COPY_ALL_RELEASES=true and a release tag");
        process.exit(1);
    }

    const config: CopyReleaseConfig = {
        sourceApiKey: process.env.SOURCE_API_KEY!,
        sourceOwner: process.env.SOURCE_OWNER!,
        sourceRepo: process.env.SOURCE_REPO!,
        destApiKey: process.env.DEST_API_KEY!,
        destOwner: process.env.DEST_OWNER!,
        destRepo: process.env.DEST_REPO!,
        tempDir: process.env.TEMP_DIR!,
        releaseTag: copyAllReleases ? undefined : releaseTag,
        copyAllReleases: copyAllReleases,
        sortBySemver: process.env.SORT_BY_SEMVER !== 'false', // Default to true unless explicitly set to false
        // Parse include assets pattern if provided
        includeAssets: process.env.INCLUDE_ASSETS?.split(/\s+/)?.filter((filter) => filter.length > 0),
        bodyReplaceRegex: process.env.BODY_REPLACE_REGEX,
        bodyReplaceWith: process.env.BODY_REPLACE_WITH,
    };

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

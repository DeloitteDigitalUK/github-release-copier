#!/bin/bash

# GitHub Release Copier - Convenience Script
# This script provides a command-line interface for copying GitHub releases
# between repositories using getopts for argument parsing.

set -e

# Default values
COPY_ALL_RELEASES=false
SORT_BY_SEMVER=true
RELEASE_TAG=""
SOURCE_OWNER=""
SOURCE_REPO=""
DEST_OWNER=""
DEST_REPO=""
TEMP_DIR=""
INCLUDE_ASSETS=""
BODY_REPLACE_REGEX=""
BODY_REPLACE_WITH=""

# Help function
show_help() {
    cat << EOF
GitHub Release Copier

USAGE:
    $0 [OPTIONS] [RELEASE_TAG]

OPTIONS:
    -h, --help                  Show this help message
    -a, --all                   Copy all releases (oldest to newest)
    -S, --source OWNER/REPO     Source repository (owner/repo format)
    -D, --dest OWNER/REPO       Destination repository (owner/repo format)
    -t, --temp-dir DIR          Temporary directory for downloads
    -i, --include-assets PATTERN Include assets matching pattern (space-separated)
    -r, --replace-regex REGEX   Regex pattern to replace in release body
    -w, --replace-with TEXT     Replacement text for regex pattern
    --sort-by-date              Sort releases by creation date instead of semantic version

REQUIRED ENVIRONMENT VARIABLES:
    SOURCE_API_KEY              GitHub API token for source repository
    DEST_API_KEY                GitHub API token for destination repository

EXAMPLES:
    # Set tokens first (required)
    export SOURCE_API_KEY="ghp_source_token"
    export DEST_API_KEY="ghp_dest_token"

    # Copy a specific release
    $0 -S "owner1/repo1" -D "owner2/repo2" -t "./temp" v1.0.0

    # Copy all releases (sorted by semantic version by default)
    $0 --all -S "owner1/repo1" -D "owner2/repo2" -t "./temp"

    # Copy all releases sorted by creation date instead
    $0 --all --sort-by-date -S "owner1/repo1" -D "owner2/repo2" -t "./temp"

    # Copy with asset filtering and body replacement
    $0 -S "owner1/repo1" -D "owner2/repo2" -t "./temp" \\
       -i ".*\\.zip$ .*\\.tar\\.gz$" -r "old-text" -w "new-text" v1.0.0

ENVIRONMENT VARIABLES:
    REQUIRED: SOURCE_API_KEY, DEST_API_KEY
    OPTIONAL: SOURCE_OWNER, SOURCE_REPO, DEST_OWNER, DEST_REPO,
              TEMP_DIR, INCLUDE_ASSETS, BODY_REPLACE_REGEX, BODY_REPLACE_WITH,
              COPY_ALL_RELEASES, SORT_BY_SEMVER

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -a|--all)
            COPY_ALL_RELEASES=true
            shift
            ;;
        -S|--source)
            if [[ "$2" =~ ^([^/]+)/(.+)$ ]]; then
                SOURCE_OWNER="${BASH_REMATCH[1]}"
                SOURCE_REPO="${BASH_REMATCH[2]}"
            else
                echo "Error: Source repository must be in format 'owner/repo'"
                exit 1
            fi
            shift 2
            ;;
        -D|--dest)
            if [[ "$2" =~ ^([^/]+)/(.+)$ ]]; then
                DEST_OWNER="${BASH_REMATCH[1]}"
                DEST_REPO="${BASH_REMATCH[2]}"
            else
                echo "Error: Destination repository must be in format 'owner/repo'"
                exit 1
            fi
            shift 2
            ;;
        -t|--temp-dir)
            TEMP_DIR="$2"
            shift 2
            ;;
        -i|--include-assets)
            INCLUDE_ASSETS="$2"
            shift 2
            ;;
        -r|--replace-regex)
            BODY_REPLACE_REGEX="$2"
            shift 2
            ;;
        -w|--replace-with)
            BODY_REPLACE_WITH="$2"
            shift 2
            ;;
        --sort-by-date)
            SORT_BY_SEMVER=false
            shift
            ;;
        -*)
            echo "Error: Unknown option $1"
            show_help
            exit 1
            ;;
        *)
            # This should be the release tag
            if [[ -n "$RELEASE_TAG" ]]; then
                echo "Error: Multiple release tags specified"
                exit 1
            fi
            RELEASE_TAG="$1"
            shift
            ;;
    esac
done

# API keys must come from environment variables (required)
# SOURCE_API_KEY and DEST_API_KEY are already set from environment

# Use environment variables as fallbacks for other values if not set via command line
# (Command line arguments take precedence over environment variables)

# Check if COPY_ALL_RELEASES was set via environment
if [[ "${COPY_ALL_RELEASES:-false}" == "true" ]]; then
    COPY_ALL_RELEASES=true
fi

# Validation
if [[ "$COPY_ALL_RELEASES" == "true" && -n "$RELEASE_TAG" ]]; then
    echo "Error: Cannot specify both --all and a release tag"
    exit 1
fi

if [[ "$COPY_ALL_RELEASES" == "false" && -z "$RELEASE_TAG" ]]; then
    echo "Error: Must specify either --all or a release tag"
    exit 1
fi

# Check required parameters
missing_params=()
[[ -z "$SOURCE_API_KEY" ]] && missing_params+=("SOURCE_API_KEY environment variable")
[[ -z "$SOURCE_OWNER" ]] && missing_params+=("source owner (-S)")
[[ -z "$SOURCE_REPO" ]] && missing_params+=("source repo (-S)")
[[ -z "$DEST_API_KEY" ]] && missing_params+=("DEST_API_KEY environment variable")
[[ -z "$DEST_OWNER" ]] && missing_params+=("destination owner (-D)")
[[ -z "$DEST_REPO" ]] && missing_params+=("destination repo (-D)")
[[ -z "$TEMP_DIR" ]] && missing_params+=("temporary directory (-t)")

if [[ ${#missing_params[@]} -gt 0 ]]; then
    echo "Error: Missing required parameters:"
    printf '  %s\n' "${missing_params[@]}"
    echo ""
    show_help
    exit 1
fi

# Set environment variables for the Node.js script
export SOURCE_API_KEY
export SOURCE_OWNER
export SOURCE_REPO
export DEST_API_KEY
export DEST_OWNER
export DEST_REPO
export TEMP_DIR
export COPY_ALL_RELEASES
export SORT_BY_SEMVER
[[ -n "$INCLUDE_ASSETS" ]] && export INCLUDE_ASSETS
[[ -n "$BODY_REPLACE_REGEX" ]] && export BODY_REPLACE_REGEX
[[ -n "$BODY_REPLACE_WITH" ]] && export BODY_REPLACE_WITH

# Build the project first
echo "Building project..."
npm run build

# Run the Node.js script
echo "Starting release copy operation..."
if [[ "$COPY_ALL_RELEASES" == "true" ]]; then
    echo "Mode: Copy all releases"
    node ./dist/index.js
else
    echo "Mode: Copy single release ($RELEASE_TAG)"
    node ./dist/index.js "$RELEASE_TAG"
fi
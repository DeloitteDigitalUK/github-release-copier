# GitHub Release Copier

Copies a release (including its name, body and assets) from one GitHub owner/repository to another.

## How does it work?

This tool uses the GitHub API to fetch the details and assets of a given release from a repository, then create a duplicate of it in a different owner/repository.

Release asset files are stored locally in the location specified by the `TEMP_DIR` environment variable.

## How do I run it?

### Prerequisites

- Node 20.x
- Install dependencies with `npm ci`
- Copy the `.env.example` file to `.env` and set the appropriate configuration values.

### Run

To copy a release, run:

```shell
npm start <release name>
```

For example:

```shell
npm start v1.0.0
```

To copy all releases from oldest to newest (skipping any that already exist at the destination):

```shell
COPY_ALL_RELEASES=true npm start
```

This will:

1. Call the GitHub search API using the query defined in `.env`
2. For each search result, query GitHub's API for file metadata, such as the download URL
3. Make a `GET` request to the download URL and save the contents of the file to a directory named `specs`

## Using this tool

### Copying a release as a GitHub Action

This tool can be consumed as a GitHub Action, in your own GitHub Actions workflows.

For example:

```yaml
steps:
  - name: Copy specific release from one repo to another
    uses: DeloitteDigitalUK/github-release-copier@HEAD
    with:
      release-name: "v1.0.0"
      source-api-key: "${{ secrets.SOURCE_API_KEY }}"
      source-owner: "octocat"
      source-repo: "octorepo"
      dest-api-key: "${{ secrets.DEST_API_KEY }}"
      dest-owner: "anothercat"
      dest-repo: "anotherrepo"
      
      # optional
      temp-dir: "./files"
      body-replace-regex: "octocat"
      body-replace-with: "octodog"
      # include-assets uses regex patterns (one per line)
      include-assets: |
        .*\.example\.zip$
        .*\.docs\.zip$
```

#### Token permissions

The tool requires content read-only permissions for the repository it is querying and content read-write permissions for the repository in which it is creating the release.

Permissions for `SOURCE_API_KEY`:

* Metadata: Read-only
* Contents: Read-only

Permissions for `DEST_API_KEY`:

* Metadata: Read-only
* Contents: Read-write

### Running locally

This tool can be run locally using Docker or Node.js.

#### Running with Node.js

Build the tool:

```shell
npm ci
npm run build
```

Run the tool:

```shell
node ./dist/index.js <release name>
```

For example:

```shell
node ./dist/index.js v1.0.0
```

#### Using the shell script

A shell script is provided that allows you to pass arguments via command line instead of environment variables:

```shell
# Set required API keys as environment variables
export SOURCE_API_KEY="ghp_source_token"
export DEST_API_KEY="ghp_dest_token"

# Copy a specific release
./copy-release.sh -S "owner1/repo1" -D "owner2/repo2" -t "./temp" v1.0.0

# Copy all releases
./copy-release.sh --all -S "owner1/repo1" -D "owner2/repo2" -t "./temp"
```

Run `./copy-release.sh --help` for full usage information.

#### Running with Docker

Build the container:

```shell
docker build --tag DeloitteDigitalUK/github-release-copier .
```

Run the tool:

```shell
docker run --rm -it \
  --env-file .env \
  DeloitteDigitalUK/github-release-copier <release name>
```

For example:

```shell
docker run --rm -it \
  --env-file .env \
  DeloitteDigitalUK/github-release-copier v1.0.0
```

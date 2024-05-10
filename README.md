# GitHub Release Copier

Copies a release, it's name, body and assets from one GitHub owner/repository to another.

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

This will:

1. Call the GitHub search API using the query defined in `.env`
2. For each search result, query GitHub's API for file metadata, such as the download URL
3. Make a `GET` request to the download URL and save the contents of the file to a directory named `specs`

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

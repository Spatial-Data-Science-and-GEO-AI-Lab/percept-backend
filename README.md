# Introduction

This is the backend to the [Human perception survey (percept)](https://github.com/Spatial-Data-Science-and-GEO-AI-Lab/percept) project. It expects to interact with a frontend server, see [Percept Frontend](https://github.com/Spatial-Data-Science-and-GEO-AI-Lab/percept-frontend).

It depends on Node.js (developed with version 18.14.2) and PostgreSQL (preferably version 13 or greater) with PostGIS (preferably version 3.3.2 or better).

## Configuration

Copy `config.js.sample` to `config.js` and edit the values in the file according to the comments.

Create your databases and enable PostGIS in them, most likely you will want to do this as the `postgres` database administrator user on most Linux distributions.

For example:

- `sudo -u postgres createdb -O $USER percept-test`
- `sudo -u postgres psql -c 'CREATE EXTENSION postgis;' percept-test`
- `sudo -u postgres createdb -O $USER percept-dev`
- `sudo -u postgres psql -c 'CREATE EXTENSION postgis;' percept-dev`
- `sudo -u postgres createdb -O $USER percept-prod`
- `sudo -u postgres psql -c 'CREATE EXTENSION postgis;' percept-prod`

## Seeding the database

You will need to populate the database with imagery. A recommended way to do that is to use the [vsvi-filter](https://github.com/Spatial-Data-Science-and-GEO-AI-Lab/percept-vsvi-filter) to create SQL files with INSERT statements. Those SQL files can be placed in the `seeds/dev`, `seeds/test`, or `seeds/prod` directory depending on whether you want to use the imagery for development, testing or production purposes. The database migration scripts `db-up.sh` and `db-down.sh` (described below) will then pick them up automatically.

## Available Scripts

In the project directory, you can run:

### `npm install`

Downloads, builds and installs the necessary dependencies to run the app. Run this before anything else.

### `./db-up.sh [dev | prod | test]`
### `./db-down.sh [dev | prod | test]`

Creates or drops the database tables and various seed values. The name of the
database is `percept-$kind` where $kind is either 'dev', 'prod' or 'test'. The
default kind is 'dev'. The main difference is the seeds that are used. The
'dev' database is initialised with many fewer values, just enough for
development purposes. 'test' is mainly used by the testsuite.

These scripts expect to be able to run `psql` commands freely. If `psql` is not
working on your databases then that needs to be sorted out with your PostgreSQL
setup first.

### `npm run dev`

Runs the app in the development mode.

The server will reload when you make changes.\
You may also see any lint errors in the console.

### `npm start`

Runs the app in production mode.

### `npm test`

Runs the test suite on the test database (`testdbname` in `config.js`).

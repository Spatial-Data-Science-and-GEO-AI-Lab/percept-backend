# Utilities

## `mapillary_jpg_download.py`

Script to download all mapillary street view imagery within a given latitude/longitude boundary 'box'.

This script is provided as-is. The usage of this script, compliance with
Mapillary licencing and acceptable use terms, as well as any Internet service
provider terms, is entirely your responsibility.

### Set-up

Install the Python3 pip packages found in `requirements.txt` by running, e.g., `pip install -r requirements.txt`.

### Configuration

This program can be run entirely from the command-line, or it can be configured using a token file and/or a configuration JSON file.

The following information must be provided in one form or another:
* Mapillary API access token
	- (from Developer section of Mapillary, after you Register an Application, copy the 'Client Token' field)
* Tile cache directory
* Image sequence download directory
* Geographic bounding box of imagery to download: west (longitude), south (latitude), east (longitude), north (latitude)

The command-line reference can be found below.

#### Token file

The API token is a secret that should not be shared in code repositories or any
publicly-accessible archives. It is probably not a good idea to normally
provide the token on the command-line because most command shells will save
your command history in a file, so you may want to clear that history (e.g. in
bash use the command `history -c`) if you do use the `--token` argument.

If you choose to put your API token into a file then please put it entirely by
itself into a single, simple text file. You can specify the `--token-file`
argument on the command-line to feed it to the program, or simply use the
default name `token.txt` and the program will find it in the current directory.

#### Configuration file

Tile cache directory, image sequence directory and geographic bounding box can
be provided in a JSON file that should look like this:

		{
			"bounding_box": {
				"west": 4.7149,
				"south": 52.2818,
				"east": 5.1220,
				"north": 52.4284
			},
			"tile_cache_dir": "<tile directory>",
			"seqdir": "<sequence directory>"
		}

An example may be found in `examples/greater-amsterdam.json`.

The `-c` command-line argument can be used to feed the configuration file to
the program.

### Example usage


Assuming your API token is saved in `token.txt`:
* `./mapillary_jpg_download.py -c examples/greater-amsterdam.json`

Assuming your API token is saved in `mytoken.txt`:
* `./mapillary_jpg_download.py -c examples/greater-amsterdam.json --token-file mytoken.txt`

Fully command-line:
* `./mapillary_jpg_download.py --token 'MLY...' --tile-cache-dir tiles --seqdir seqs --west 4.7 --south 52.2 --east 5.12 --north 52.4`

### Command-line usage

		usage: mapillary_jpg_download.py [-h] [--configfile FILENAME] [--quiet]
																		 [--overwrite] [--tile-cache-dir DIR]
																		 [--seqdir DIR] [--token TOKEN]
																		 [--token-file FILE]
																		 [--required-disk-space GB]
																		 [--num-retries NUM] [--west LON]
																		 [--south LAT] [--east LON] [--north LAT]

		Download mapillary images

		optional arguments:
			-h, --help            show this help message and exit
			--configfile FILENAME, --config FILENAME, -c FILENAME
														Configuration file to process
			--quiet, -q           Run in quiet mode
			--overwrite, -O       Overwrite any existing output file
			--tile-cache-dir DIR  Directory in which to store tile cache
			--seqdir DIR          Directory in which to store image sequences
			--token TOKEN         Mapillary API token (see Developers help for
														Mapillary)
			--token-file FILE     Alternatively, read the token from this file (with the
														token written on a single line)
			--required-disk-space GB
														Will stop run less than this number in gigabytes is
														available.
			--num-retries NUM     Number of times to retry if there is a network
														failure.
			--west LON            Western boundary (longitude)
			--south LAT           Southern boundary (latitude)
			--east LON            Eastern boundary (longitude)
			--north LAT           Northern boundary (latitude)


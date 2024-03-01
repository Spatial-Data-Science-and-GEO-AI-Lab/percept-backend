import mercantile, mapbox_vector_tile, requests, json, os
from vt2geojson.tools import vt_bytes_to_geojson
import os.path
    
# define an empty geojson as output
output= { "type": "FeatureCollection", "features": [] }

# vector tile endpoints -- change this in the API request to reference the correct endpoint
tile_coverage = 'mly1_public'

# tile layer depends which vector tile endpoints: 
# 1. if map features or traffic signs, it will be "point" always
# 2. if looking for coverage, it will be "image" for points, "sequence" for lines, or "overview" for far zoom
tile_layer = "image"

# Mapillary access token -- user should provide their own
access_token = 'MLY|5946251815466309|182480777606b215f898572d43a313eb';

# a bounding box in [east_lng,_south_lat,west_lng,north_lat] format
# west, south, east, north = [-80.13423442840576,25.77376933762778,-80.1264238357544,25.788608487732198]
west, south, east, north = [4.7149,52.2818,5.1220,52.4284] # greater amsterdam
# west, south, east, north = [4.8888,52.3677,4.9142,52.3768] # only the amsterdam centre

# get the list of tiles with x and y coordinates which intersect our bounding box
# MUST be at zoom level 14 where the data is available, other zooms currently not supported
tiles = list(mercantile.tiles(west, south, east, north, 14))

info = { 'tiles': tiles, 'west': west, 'south': south, 'east': east, 'north': north}
print(json.dumps(info, indent=4))

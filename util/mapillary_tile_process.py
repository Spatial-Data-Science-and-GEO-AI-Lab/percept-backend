#!/usr/bin/env python3

import os
import sys
import argparse
import json
from PIL import Image
from pathlib import Path


def jpg_file_info(fname):
    try:
        with Image.open(fname) as img:
            if img.format in ['JPEG', 'MPO']:
                return img.size
            else:
                return None
    except:
        return None

def process_tile_file(fname, out, opts):
    outw, outh = opts.outw, opts.outh
    with open(fname) as fp:
       j = json.load(fp)
    feats = j['features']
    if opts.size:
        out.write(f'{fname}: {len(feats)}\n')
        return
    for feat in feats: 
        geo = feat['geometry']
        props = feat['properties']
        lon, lat = geo['coordinates']
        captime = props['captured_at']
        angle = props['compass_angle']
        mapimg_id = props['id']
        is_pano = props['is_pano']
        seq_id = props['sequence_id']
        imgfile = Path(opts.seqdir) / str(seq_id) / str(mapimg_id)
        imgfilejpg = imgfile.with_suffix('.jpg')
        dstfile = Path(opts.dirprefix) / opts.cityname / str(seq_id) / str(mapimg_id)
        imgfile_e = os.path.exists(imgfilejpg)
        shdestfile = (Path(opts.shdestdir) / opts.cityname / str(seq_id) / str(mapimg_id)).with_suffix(".sh") if opts.shdestdir else None
        if not opts.overwrite and shdestfile and os.path.exists(shdestfile) and os.path.getsize(shdestfile) > 0: continue
        output = ""
        def outwrite(s):
            nonlocal output
            output += s
        if opts.verbose:
            print(f'entry {seq_id}/{mapimg_id} at {lat:.4f},{lon:.4f} facing {angle:.2f}deg, is_pano={is_pano} downloaded={imgfile_e}')
        if imgfile_e:
            size = jpg_file_info(imgfilejpg)
            if size:
                w, h = size
                if opts.verbose:
                    print(f'    w={w} h={h}')

                def sqlout(dstfilejpg,a=angle):
                    url=f'{opts.urlprefix}/{opts.cityname}/{seq_id}/{dstfilejpg.stem}.jpg'
                    pt=f'ST_SetSRID(ST_MakePoint({lon}, {lat}),4326)::geometry(POINT, 4326)'
                    outwrite(f"cat > '{dstfilejpg.with_suffix('.sql')}' << 'EOF'\n")
                    outwrite(f"INSERT INTO image (url, system_path, cityname) VALUES ('{url}', '{dstfilejpg}', '{opts.cityname}') ON CONFLICT DO NOTHING;\n")
                    outwrite(f"INSERT INTO image_geo (geo, angle_deg, image_id) SELECT {pt} AS geo, {a} AS angle_deg, image_id FROM image WHERE system_path='{dstfilejpg}' ON CONFLICT DO NOTHING;\n")
                    outwrite("EOF\n")

                outwrite(f'mkdir -p \'{dstfile.parent}\'\n')
                if is_pano:
                    w4 = w // 4
                    h4 = h // 4
                    hFor43ratio = (w4 * 3) // 4
                    for i in range(4):
                        dstfilejpg=dstfile.with_stem(f'{imgfile.stem}_{i+1}').with_suffix('.jpg')
                        outwrite(f'[[ "`file -bi \'{dstfilejpg}\'`" =~ "jpeg" ]] || convert \'{imgfilejpg}\' -crop {w4}x{hFor43ratio}+{i*w4}+{h4} -scale {outw}x{outh}\! \'{dstfilejpg}\'\n')
                        a = (angle-135 + i*90)%360 if angle != 0 else 0
                        sqlout(dstfilejpg, a)
                else:
                    dstfilejpg=dstfile.with_suffix('.jpg')
                    outwrite(f'[[ "`file -bi \'{dstfilejpg}\'`" =~ "jpeg" ]] || convert \'{imgfilejpg}\' -scale {outw}x{outh}\! \'{dstfilejpg}\'\n')
                    sqlout(dstfilejpg)
                if shdestfile:
                    os.makedirs(shdestfile.parent, exist_ok=True)
                    with open(shdestfile,'w') as fp:
                        fp.write(output)
                else:
                    out.write(output)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tile_file', nargs='+', help='Tile file...')
    parser.add_argument('--seqdir', default='seqs', help='directory of sequences and images')
    parser.add_argument('--output', '-o', default='-', help='output transcript file')
    parser.add_argument('--shdestdir', '-s', default=None, help='destination dir for output of shell files')
    parser.add_argument('--verbose', '-v', default=False, action='store_true', help='Verbose mode')
    parser.add_argument('--size', default=False, action='store_true', help='Just show size of tile file mode')
    parser.add_argument('--overwrite', '-O', default=False, action='store_true', help='Overwrite shell files mode')
    parser.add_argument('--cityname', '-C', default='Amsterdam', help='name of city covering tiles')
    parser.add_argument('--dirprefix', '-D', default='/data/img/mapillary', help='prefix of system path for images')
    parser.add_argument('--urlprefix', '-U', default='/img/mapillary', help='prefix of URL for images')
    parser.add_argument('--outw', '-W', default=640, help='Width of output images')
    parser.add_argument('--outh', '-H', default=480, help='Height of output images')

    args = parser.parse_args()

    with (os.fdopen(os.dup(sys.stdout.fileno()), 'w') if args.output == '-' else open(args.output, 'w')) as outfp:
        for fname in args.tile_file:
            process_tile_file(fname, outfp, args)

if __name__ == "__main__":
    main()
# vim: ai et sw=4 sts=4 ts=4

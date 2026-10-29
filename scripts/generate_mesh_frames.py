#!/usr/bin/env python3
"""Offline smooth displacement-field animation precompute.

Input: original RGBA image (not extracted layers). Output: RGBA PNG frames.
Mathematical transform and mask coefficients are documented in
`docs/LOCAL_MESH_WARP.md`.  This script can be reused for other 2D sprites by
editing or providing a JSON rig: pivot, influence regions and protected masks.

Usage:
  python scripts/generate_mesh_frames.py
  python scripts/generate_mesh_frames.py --source path/to/sprite.png --out path/to/frames \
    --rig path/to/mesh_rig.json
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT/'web/assets/cannon_base.png'
DEFAULT_RIG = ROOT/'web/assets/mesh/mesh_rig.json'
DEFAULT_OUT = ROOT/'web/assets/mesh/frames'


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -40, 40)))


def influence_field(x, y, cfg):
    p = cfg['influence']
    g = lambda k: p[k]
    upper = sigmoid((g('top_fade_center_y') - y) / g('top_fade_softness'))
    left = sigmoid((x - g('left_fade_center_x')) / g('side_fade_softness'))
    right = sigmoid((g('right_fade_center_x') - x) / g('side_fade_softness'))
    wheel = np.exp(-(((x-g('wheel_center_x'))/g('wheel_sigma_x'))**2 + ((y-g('wheel_center_y'))/g('wheel_sigma_y'))**2) / 2)
    ground = sigmoid((g('ground_fade_center_y') - y) / g('ground_fade_softness'))
    return (upper * left * right * (1-g('wheel_suppression') * wheel) * ground).astype(np.float32)


def generate(source, dest, rig):
    src = np.asarray(Image.open(source).convert('RGBA'),dtype=np.float32)
    h,w = src.shape[:2]
    assert [w,h] == rig['canvas'], f'Expected canvas={rig["canvas"]}, actual={[w,h]}'
    dest.mkdir(parents=True, exist_ok=True)
    yy,xx = np.mgrid[:h,:w].astype(np.float32)
    weight = influence_field(xx, yy, rig)
    pivot_x,pivot_y = rig['pivot']
    alpha = src[:,:,3] / 255
    premul = src.copy()
    premul[:,:,:3] *= alpha[:,:,None]
    frames=[]
    for i in range(rig['frame_count']):
        angle = rig['min_angle'] + i * rig['step_angle']
        filename=f'pitch_{i:02}.png'
        # The exact unchanged original is the neutral keyframe, no interpolation.
        if abs(angle-rig['neutral_angle'])<1e-9:
            out=src.astype(np.uint8)
        else:
            theta=np.deg2rad(angle-rig['neutral_angle'])
            dx=-theta * (yy-pivot_y) * weight
            dy= theta * (xx-pivot_x) * weight
            warped=cv2.remap(premul, (xx-dx).astype(np.float32), (yy-dy).astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
            a=np.clip(warped[:,:,3],0,255)
            rgb=np.clip(warped[:,:,:3] * 255 / np.maximum(a[:,:,None],1),0,255)
            out=np.concatenate((rgb,a[:,:,None]),axis=2).astype(np.uint8)
            # Ensure no RGB values remain in fully transparent pixels.
            out[out[:,:,3] == 0,:3] = 0
        Image.fromarray(out).save(dest/filename,optimize=True)
        frames.append({'index':i,'angle':round(angle,4),'file':filename})
    (dest/'index.json').write_text(json.dumps({'rig':'../mesh_rig.json','source':source.name,'frames':frames},ensure_ascii=False,indent=2),encoding='utf8')
    # Check every frame, alpha correctness, and source identity at neutral.
    for f in frames:
        check=Image.open(dest/f['file'])
        assert check.mode=='RGBA' and check.size==(w,h)
    index = round((rig['neutral_angle']-rig['min_angle']) / rig['step_angle'])
    orig = np.asarray(Image.open(source).convert('RGBA'))
    neutral = np.asarray(Image.open(dest/frames[index]['file']).convert('RGBA'))
    assert np.array_equal(orig,neutral), 'Neutral frame must equal the original RGBA exactly'
    print(f'PASS: {len(frames)} RGBA frames from {frames[0]["angle"]} to {frames[-1]["angle"]} degrees; neutral pixel-perfect')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    parser.add_argument('--out',type=Path,default=DEFAULT_OUT)
    parser.add_argument('--rig',type=Path,default=DEFAULT_RIG)
    args=parser.parse_args()
    generate(args.source,args.out,json.loads(args.rig.read_text(encoding='utf8')))

if __name__ == '__main__': main()

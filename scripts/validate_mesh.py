#!/usr/bin/env python3
"""Static asset/neutral/low-motion regression tests; no browser required."""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
rig=json.loads((ROOT/'web/assets/mesh/mesh_rig.json').read_text(encoding='utf8'))
frames=ROOT/'web/assets/mesh/frames'
source=np.asarray(Image.open(ROOT/'web/assets/cannon_base.png').convert('RGBA'),dtype=np.int16)
assert rig['frame_count']==17
assert rig['min_angle']==30 and rig['max_angle']==38
assert tuple(rig['canvas'])==(480,350)
for i in range(17):
 im=Image.open(frames/f'pitch_{i:02}.png')
 assert im.mode=='RGBA' and im.size==(480,350),f'frame {i} wrong mode/size'
 s=np.asarray(im,dtype=np.int16)
 assert np.min(s)>=0 and np.max(s)<=255
 # PNG alpha should not create unexplained large grass movement.
 if i in (0,16):
  x1,y1,x2,y2=50,306,390,348
  change=np.abs(s[y1:y2,x1:x2]-source[y1:y2,x1:x2]).mean()
  assert change < 0.3, f'grass changed too much ({change})'
print('PASS: 17 images have correct 480×350 RGBA format and protected bottom grass')
neutral=np.asarray(Image.open(frames/'pitch_08.png').convert('RGBA'),dtype=np.int16)
assert np.array_equal(source,neutral)
print('PASS: 34° neutral image matches original exactly (all pixels and channels)')
assert not np.array_equal(np.asarray(Image.open(frames/'pitch_00.png')),np.asarray(Image.open(frames/'pitch_16.png')))
print('PASS: extremal angles differ and changed images exist')

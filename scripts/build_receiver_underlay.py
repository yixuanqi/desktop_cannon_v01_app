"""Create an occlusion-only rear sleeve from original V0.1.1 pixels.

This is NOT a redraw: the sleeve reuses the original metallic receiver.
Every non-transparent sleeve pixel is fully covered by an opaque animated
barrel or opaque stationary chassis in neutral pose, preserving its pixels.
"""
from pathlib import Path
from PIL import Image
import numpy as np
p=Path(__file__).resolve().parents[1]/'web/assets'
base=np.array(Image.open(p/'cannon_base.png').convert('RGBA'))
barrel=np.array(Image.open(p/'layers/barrel.png').convert('RGBA'))
chassis=np.array(Image.open(p/'layers/chassis.png').convert('RGBA'))
h,w=base.shape[:2]
x=np.arange(w)[None,:];y=np.arange(h)[:,None]
rect=(x>=347)&(x<=386)&(y>=139)&(y<=219)
fully_covered=(barrel[:,:,3]==255)|(chassis[:,:,3]==255)
mask=rect&fully_covered&(base[:,:,3]==255)
out=np.zeros_like(base)
out[mask]=base[mask]
Image.fromarray(out).save(p/'layers/receiver_underlay.png',optimize=True)
print(f'covered receiver underlay pixels: {mask.sum()}')

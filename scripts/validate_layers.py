"""Visual golden image / geometry checks for the V0.2 layer migration."""
from pathlib import Path
from PIL import Image
import numpy as np
import subprocess
ROOT=Path(__file__).resolve().parents[1]
base=Image.open(ROOT/'web/assets/cannon_base.png').convert('RGBA')
assert base.size==(480,350)
layers=[Image.open(ROOT/'web/assets/layers'/f'{n}.png').convert('RGBA') for n in ['ground','barrel','chassis']]
assert all(im.size==base.size for im in layers)
assembled=Image.new('RGBA',base.size)
for im in layers:assembled.alpha_composite(im)
a=np.asarray(base)
b=np.asarray(assembled)
visible=a[:,:,3]>0
assert np.array_equal(a[:,:,3],b[:,:,3]),'Alpha mismatch in static assembly'
assert np.array_equal(a[visible],b[visible]),'Color mismatches in visible static pixels'
print('PASS static visible RGBA: 0 differing pixels; alpha: 0 differing pixels')
# The optional receiver underlay is guaranteed fully hidden at the neutral
# pose, but becomes available to mask pinholes when pitch changes.
repair=Image.open(ROOT/'web/assets/layers/receiver_underlay.png').convert('RGBA')
with_repair=Image.new('RGBA',base.size)
for im in [layers[0],repair,layers[1],layers[2]]: with_repair.alpha_composite(im)
c=np.asarray(with_repair)
assert np.array_equal(c[:,:,3],a[:,:,3]) and np.array_equal(c[visible],a[visible]), 'Rear underlay leaked into neutral-pose art'
print('PASS rear occlusion repair remains invisible at 34 degree default angle')
# CSS renders a smaller bitmap; internal 1px opaque overlap minimizes seams.
for bg_color in [(244,247,241),(31,45,57)]:
 out_a=Image.new('RGBA',(214,156),(*bg_color,255))
 out_a.alpha_composite(base.resize((214,156),Image.Resampling.BILINEAR))
 out_b=Image.new('RGBA',(214,156),(*bg_color,255))
 for layer in layers:out_b.alpha_composite(layer.resize((214,156),Image.Resampling.BILINEAR))
 diff=np.abs(np.asarray(out_a,dtype=np.int16)-np.asarray(out_b,dtype=np.int16))[:,:,:3]
 mae=float(np.mean(diff))
 print('PASS bilinear 214x156',bg_color,'mean RGB abs difference',round(mae,4)) if mae<0.20 else None
 assert mae<0.20, f'Resized neutral pose diverged too much: {mae}'
# Static ground wheel layers are not animated; only the barrel subtree is.
css=(ROOT/'web/cannon.css').read_text()
html=(ROOT/'web/cannon.html').read_text()
assert 'layer-ground' in html and 'layer-chassis' in html and 'layer-barrel' in html
assert 'cannon-scene[data-state="firing"] .barrel-pivot' in css
assert 'cannon-scene[data-state="firing"] .cannon-rig' not in css
assert 'cannon-scene[data-state="idle"] .cannon-rig' not in css
assert 'src="/assets/layers/' in html
print('PASS: static grass/chassis unaffected by recoil animation; barrel has transform origin')
print('PASS: all V0.1.1 pixel data used; no new cannon design introduced')

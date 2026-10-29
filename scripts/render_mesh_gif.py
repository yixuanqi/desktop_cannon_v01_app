"""Lightweight loop preview of the actual precomputed mesh RGBA sprites."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
P=Path(__file__).resolve().parents[1]
font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',22)
frames=[]
angles=list(range(17))+list(range(15,0,-1))
for idx in angles:
    angle=30+idx*.5
    bg=Image.new('RGBA',(480,390),(32,38,45,255))
    png=Image.open(P/'web/assets/mesh/frames'/f'pitch_{idx:02}.png').convert('RGBA')
    bg.alpha_composite(png,(0,22))
    draw=ImageDraw.Draw(bg)
    draw.text((20,4),f'原版小炮局部网格变形   {angle:g}°',font=font,fill=(236,213,164))
    frames.append(bg.convert('RGB'))
out=P/'docs/v04_angle_sweep.gif'
frames[0].save(out,save_all=True,append_images=frames[1:],duration=110,loop=0,optimize=True)
print(out)

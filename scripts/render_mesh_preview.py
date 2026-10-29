#!/usr/bin/env python3
"""Offline engineering composite preview with real PNG frames and lever asset.
Not a Windows/WebView2 runtime screenshot; tolerances stated in docs.
"""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import numpy as np
import math
ROOT=Path(__file__).resolve().parents[1]
assets=ROOT/'web/assets'
OUT=ROOT/'docs/v04_mesh_interaction_preview.png'
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FONT_BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
F=lambda n,b=False: ImageFont.truetype(FONT_BOLD if b else FONT,n)
def sigmoid(z):return 1/(1+math.exp(-max(-40,min(40,z))))
def weight(x,y):
    u=sigmoid((242-y)/16);l=sigmoid((x-49)/18);r=sigmoid((381-x)/18)
    wheel=math.exp(-.5*(((x-279)/67)**2+((y-258)/44)**2))
    return u*l*r*sigmoid((294-y)/8)*(1-.92*wheel)
def moved(x,y,angle):
    t=(angle-34)*math.pi/180
    dx=dy=0
    for _ in range(7):
        px=x+dx;py=y+dy;w=weight(px,py)
        dx=-t*(py-216)*w;dy=t*(px-280)*w
    return x+dx,y+dy

def scene(angle,pull,background):
    size=(360,240)
    img=Image.new('RGBA',size, (*background,255))
    src=Image.open(assets/'mesh/frames'/f'pitch_{int((angle-30)*2):02}.png').convert('RGBA')
    img.alpha_composite(src.resize((214,156),Image.Resampling.LANCZOS),(39,53))
    # Draw independent knob/spring as in the CSS rig: group rotates about
    # local (165,83) and translates to mesh-displaced receiver.
    layer=Image.new('RGBA',size,(0,0,0,0))
    spring=Image.open(assets/'part_spring.png').convert('RGBA')
    spring=spring.resize((10+pull,13),Image.Resampling.LANCZOS)
    layer.alpha_composite(spring,(39+165,53+81))
    knob=Image.open(assets/'part_bolt_knob.png').convert('RGBA').resize((45,23),Image.Resampling.LANCZOS)
    layer.alpha_composite(knob,(39+133+11+pull,53+67+9))
    layer=layer.rotate(-(angle-34),Image.Resampling.BICUBIC,center=(39+165,53+83))
    a=moved(371,187,angle);n=moved(371,187,34)
    shift=(round((a[0]-n[0])*214/480),round((a[1]-n[1])*156/350))
    moved_layer=Image.new('RGBA',size,(0,0,0,0));moved_layer.alpha_composite(layer,shift)
    img.alpha_composite(moved_layer)
    if pull:
        dr=ImageDraw.Draw(img)
        dr.text((46,11),f'蓄力 {round(pull/90*100)}%     仰角 {angle}°',font=F(12),fill=(232,171,77))
        dr.rounded_rectangle((46,34,265,45),radius=5,fill=(244,230,204),outline=(172,122,66),width=1)
        dr.rounded_rectangle((47,35,47+round(216*pull/90),44),radius=4,fill=(250,160,90))
    return img

def main():
    angles=(30,34,38)
    cw,ch=410,315
    card=Image.new('RGB',(cw*3+40,2*ch+106),(244,241,234))
    d=ImageDraw.Draw(card)
    d.text((24,18),'桌面小炮 V0.4  |  原图局部网格变形 + 独立炮闩',font=F(24,True),fill='#263742')
    for row,(bg,label) in enumerate([((31,36,44),'深色背景 / 待机'),((230,237,234),'浅色背景 / 蓄力约 72%')]):
        for col,a in enumerate(angles):
            x=20+col*cw; y=69+row*ch
            d.rounded_rectangle((x,y,x+cw-12,y+ch-12),radius=18,fill=(255,255,255),outline=(197,188,172),width=2)
            d.text((x+17,y+11),f'{a}°  ·  {label}',font=F(15),fill='#584a3c')
            shot=scene(a,0 if row==0 else 65,bg)
            card.paste(shot.convert('RGB'),(x+17,y+43))
    d.text((22,2*ch+79),'实际原版 RGBA 变形帧 + 炮闩 PNG 组合；离线模拟，不是 Windows 实机截图。',font=F(13),fill='#7e7770')
    OUT.parent.mkdir(exist_ok=True,parents=True)
    card.save(OUT)
    print('saved',OUT)
if __name__=='__main__': main()

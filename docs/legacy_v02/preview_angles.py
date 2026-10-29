"""Render static reference renders from the SAME PNG layers as the app.
These are geometry/art diagnostics, not Windows screenshots or E2E evidence.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import math
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'web/assets'
DOC=ROOT/'docs'
RES=Image.Resampling.BICUBIC
SCREEN=(360,240)
POS=(39,53);S=(214,156)
PIVOT=(POS[0]+S[0]*280/480,POS[1]+S[1]*216/350)
LAYER={n:Image.open(ART/f'layers/{n}.png').convert('RGBA') for n in ['ground','receiver_underlay','barrel','chassis']}
PULL_KNOB=Image.open(ART/'part_bolt_knob.png').convert('RGBA')
SPRING=Image.open(ART/'part_spring.png').convert('RGBA')

def place_sprite(img,where,size):
 full=Image.new('RGBA',SCREEN,(0,0,0,0))
 full.alpha_composite(img.resize(size,RES),where)
 return full

def rotate(canvas,theta):
 # PIL positive rotates counterclockwise visually; CSS pitch-positive
 # rotates clockwise and raises the muzzle on the left of the pivot.
 return canvas.rotate(-theta,RES,center=PIVOT)

def draw(angle,pull=0):
 render=Image.new('RGBA',SCREEN,(0,0,0,0))
 render.alpha_composite(place_sprite(LAYER['ground'],POS,S))
 render.alpha_composite(place_sprite(LAYER['receiver_underlay'],POS,S))
 render.alpha_composite(rotate(place_sprite(LAYER['barrel'],POS,S),angle-34))
 render.alpha_composite(place_sprite(LAYER['chassis'],POS,S))
 hardware=Image.new('RGBA',SCREEN,(0,0,0,0))
 hardware.alpha_composite(place_sprite(SPRING,(204,134),(pull+10,13)))
 hardware.alpha_composite(place_sprite(PULL_KNOB,(183+pull,129),(45,23)))
 render.alpha_composite(rotate(hardware,angle-34))
 return render

font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
try:f=ImageFont.truetype(font,26);small=ImageFont.truetype(font,18)
except:f=ImageFont.load_default();small=f
out=Image.new('RGB',(1200,440),'#f8f4ea');d=ImageDraw.Draw(out)
for i,(angle,pull,caption) in enumerate([(26,65,'炮口略低 · 26°'),(34,0,'默认外观 · 34°'),(42,65,'炮口略高 · 42°')]):
 x=i*400
 d.rounded_rectangle((x+7,11,x+393,427),radius=19,fill='#fffdf9',outline='#d9c9b4',width=3)
 d.text((x+25,30),caption,fill='#544334',font=f)
 d.text((x+25,77),'黄铜/奶油/兔轮原版素材',fill='#978477',font=small)
 bg=Image.new('RGBA',SCREEN,'#dfe9e6');bg.alpha_composite(draw(angle,pull))
 out.paste(bg.convert('RGB'),(x+20,112))
 d.text((x+26,385),f'拉柄 {round(pull/90*100)}%    pitch {angle}°',fill='#936d46',font=small)
out.save(DOC/'v02_pitch_reference.png')
# 1:1 default RGBA composite, to compare against source image.
draw(34).save(DOC/'default_with_handle.png')

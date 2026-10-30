"""Offline synthetic test of the V0.6 wallpaper-mask/sprite illusion.
No Windows screenshot and no private file names. NOT a real WebView2 test.
"""
from PIL import Image,ImageDraw,ImageFont
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'v060_synthetic_mask_preview.png'
W,H=680,315; cell=(135,88,92,110)

def font(sz):
 for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
  if Path(p).exists():return ImageFont.truetype(p,sz)
 return ImageFont.load_default()

def wallpaper():
 im=Image.new('RGBA',(W,H),'#436d91');d=ImageDraw.Draw(im)
 d.rectangle((0,108,W,214),fill='#806188');d.rectangle((0,215,W,H),fill='#338b7d')
 d.text((315,75),'DESKTOP  •  EXPERIMENT',font=font(19),fill='#ffffff36')
 d.text((285,185),'PHOTONICS +  GAMEPLAY',font=font(18),fill='#ffffff4c')
 return im

def icon():
 tw,th=cell[2:];im=Image.new('RGBA',(tw*3,th*3),(0,0,0,0));d=ImageDraw.Draw(im)
 X=tw*3//2;Y=38*3;R=29*3
 d.ellipse((X-R,Y-R,X+R,Y+R),fill='#F3C954',outline='#C99532',width=2*3)
 d.pieslice((X-R,Y-R,X+R,Y+R),210,335,fill='#E2544E')
 d.pieslice((X-R,Y-R,X+R,Y+R),50,170,fill='#66B96C')
 d.ellipse((X-11*3,Y-11*3,X+11*3,Y+11*3),fill='#EDECE7')
 d.ellipse((X-7*3,Y-7*3,X+7*3,Y+7*3),fill='#558EC8')
 d.text((6*3,78*3),'Chrome',font=font(11*3),fill='white')
 return im.resize((tw,th),Image.Resampling.LANCZOS)

bg=wallpaper();fg=icon()
original=bg.copy();original.alpha_composite(fg,(cell[0],cell[1]))
# use synthetic visible screen and underlying wallpaper to derive RGBA sprite
x,y,w,h=cell
screen=np.array(original.crop((x,y,x+w,y+h)).convert('RGB')).astype('float32')
under=np.array(bg.crop((x,y,x+w,y+h)).convert('RGB')).astype('float32')
diff=np.max(np.abs(screen-under),axis=2)
alpha=np.clip((diff-7)/32,0,1)
foreground=np.clip((screen-(1-alpha[...,None])*under)/np.maximum(alpha[...,None],.001),0,255)
sprite=np.dstack((foreground,alpha*255)).astype('uint8')
sp=Image.fromarray(sprite,'RGBA')

panels=[]
for idx,(title,dx,dy,rot) in enumerate([('1 · 原图标静止',0,0,0),('2 · 遮挡 + 副本飞散',99,-47,-22),('3 · 自动恢复原图标',0,0,0)]):
 scene=original.copy()
 if idx==1:
  scene.alpha_composite(bg.crop((x,y,x+w,y+h)),(x,y))
  rotated=sp.rotate(rot,expand=True,resample=Image.Resampling.BICUBIC)
  scene.alpha_composite(rotated,(x+dx-(rotated.width-w)//2,y+dy-(rotated.height-h)//2))
 d=ImageDraw.Draw(scene);d.rounded_rectangle((14,15,285,49),radius=10,fill='#0F2435E8')
 d.text((24,20),title,font=font(17),fill='#FFF1DA')
 panels.append(scene)
contact=Image.new('RGB',(W*3,H), '#101a24')
for i,frame in enumerate(panels):contact.paste(frame.convert('RGB'),(i*W,0))
contact.save(OUT)
print(f'Saved {OUT}')
print('Synthetic icon area restored exactly:', np.array_equal(np.asarray(panels[0].crop((x,y,x+w,y+h))),np.asarray(panels[2].crop((x,y,x+w,y+h)))))

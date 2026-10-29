"""Deterministic pixel-preserving layer split of the EXACT V0.1.1 artwork.

All layers have the same coordinate space and identical pixel RGBA values
as cannon_base.png. At zero transform each source pixel is owned by one layer;
compositing the layers reproduces the original byte-for-byte.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import numpy as np, cv2

HERE=Path(__file__).resolve().parents[1]
SRC=HERE/'web/assets/cannon_base.png'
OUT=HERE/'web/assets/layers'
DOC=HERE/'docs'
OUT.mkdir(parents=True,exist_ok=True)
DOC.mkdir(parents=True,exist_ok=True)
im=Image.open(SRC).convert('RGBA')
a=np.asarray(im).copy()
h,w=a.shape[:2]
assert (w,h)==(480,350),(w,h)

def polygon(vertices):
 m=Image.new('L',(w,h),0);ImageDraw.Draw(m).polygon(vertices, fill=255)
 return np.asarray(m)>0

# Ground: the exterior flower beds and bottom-most visible leaves.
left=polygon([(0,210),(118,210),(131,230),(124,251),(127,265),(144,286),(156,315),(156,350),(0,350)])
right=polygon([(394,211),(480,211),(480,350),(367,350),(381,314),(389,296),(387,283),(395,263)])
# Narrow bottom band of unmistakably botanical pixels, not the wooden wheels.
rgb=a[:,:,:3]
hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV)
# HSV in OpenCV H 0-180. Require green hues & reasonable saturation.
leaf=(hsv[:,:,0]>=29)&(hsv[:,:,0]<=98)&(hsv[:,:,1]>48)&(hsv[:,:,2]>37)
y=np.arange(h)[:,None]
x=np.arange(w)[None,:]
bottom_leaf=leaf&(y>=288)
# The foreground grass must be separate; source trees/flowers not regenerated.
ground=(left|right|bottom_leaf)&(a[:,:,3]>0)
# V0.1.1 cannon_base already excludes the red knob; retain the independent
# 'part_bolt_knob.png' and 'part_spring.png' from the working release.
bolt=np.zeros((h,w), dtype=bool)
# Barrel follows the hand-tuned outline of the original cream-and-gold body.
# The foreground bunny wheel is explicitly excluded by the contour; sprout
# and the small green side leaves remain attached to the barrel.
barrel_outline=[(71,164),(81,126),(98,107),(119,84),(151,62),(190,57),
 (222,73),(248,87),(282,96),(312,112),(334,133),(357,159),
 (370,186),(372,212),(351,231),(328,223),(320,207),(293,193),
 (254,193),(223,198),(202,212),(179,230),(153,229),(125,221),
 (100,211),(78,195)]
barrel=polygon(barrel_outline) & (a[:,:,3]>0) & ~ground & ~bolt
# Add top sprout not in core polygon, attached to rotating barrel.
sprout=polygon([(234,113),(237,73),(244,43),(257,34),(274,42),
 (286,67),(314,62),(331,66),(345,78),(345,94),(330,114),
 (302,126),(269,123)])
barrel|=sprout & (a[:,:,3]>0) & ~ground & ~bolt
# Additional small leaves and rear receiver were inadvertently classified
# as stationary chassis in Stage 1; they must follow the turning barrel.
# Restrict to top/upper-right, safely away from the bunny wheel silhouette.
receiver_and_leaves=(x>=320)&(x<=389)&(y<201)
barrel |= receiver_and_leaves & (a[:,:,3]>0) & ~ground & ~bolt
# Priority: ground > bolt > barrel > stationary chassis, exact disjoint partition.
chassis=(a[:,:,3]>0)&~(ground|bolt|barrel)
assert np.all(np.sum(np.stack([ground,bolt,barrel,chassis]).astype(np.int8),axis=0)==(a[:,:,3]>0).astype(np.int8))

files={
 'ground.png':ground,
 'chassis.png':chassis,
 'barrel.png':barrel,
 # The red lever is already a separate asset in V0.1.1.
}
# Browser downsamples each layer separately; a 1px opaque shared-edge bleed
# avoids narrow filtering seams without changing the exact 0-pose composite.
for name,mask in files.items():
 overlap = cv2.dilate(mask.astype('uint8'), np.ones((3,3),np.uint8), iterations=1)>0
 mask = mask | (overlap & (a[:,:,3]==255))
 b=a.copy()
 b[~mask]=0
 Image.fromarray(b).save(OUT/name,optimize=True)
# Round-trip exact lossless visible-pixel assembly, no reinterpretation.
# Alpha=0 source RGB is intentionally ignored (invisible non-premultiplied data).
canvas=Image.new('RGBA',im.size,(0,0,0,0))
for name in ('ground.png','barrel.png','chassis.png'):
 canvas.alpha_composite(Image.open(OUT/name))
canvas.save(DOC/'reconstructed_original.png',optimize=True)
re=np.array(canvas); valid=a[:,:,3]>0; diff=np.abs(re.astype(np.int16)-a.astype(np.int16))
assert np.array_equal(re[:,:,3],a[:,:,3]) and np.array_equal(re[valid],a[valid])
print('PASS: exact visible RGBA reconstruction, max visible channel error 0, differing visible pixels 0')
# A contact sheet is helpful even without GUI browsing access.
W,H=1360,750
sheet=Image.new('RGB',(W,H),(240,237,227))
d=ImageDraw.Draw(sheet)
try: font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',25)
except: font=ImageFont.load_default()
items=[('原始 V0.1.1', im),('地面 / 花草（静止）',Image.open(OUT/'ground.png')),
       ('木轮底座（固定）',Image.open(OUT/'chassis.png')),
       ('炮管 / 小绿芽（可动）',Image.open(OUT/'barrel.png')),
       ('红色拉柄（沿用独立 PNG）', Image.open(HERE/'web/assets/part_bolt_knob.png')),
       ('分层零姿态合成',canvas)]
for i,(title,layer) in enumerate(items):
 xx=20+(i%3)*448; yy=20+(i//3)*370
 d.rounded_rectangle((xx,yy,xx+432,yy+350),fill=(255,255,255),outline=(205,199,181),radius=18,width=2)
 d.text((xx+15,yy+12),title,font=font,fill=(63,76,62))
 bg=Image.new('RGBA',layer.size,(219,230,232,255))
 bg.alpha_composite(layer.convert('RGBA'))
 scaled=bg.resize((404,295),Image.Resampling.LANCZOS).convert('RGB')
 sheet.paste(scaled,(xx+14,yy+49))
sheet.save(DOC/'layers_contact_sheet.png',optimize=True)
# Transparent preview over independent light/dark backgrounds to check halos.
compare=Image.new('RGB',(1000,400),(248,248,242)); d=ImageDraw.Draw(compare)
for i,col in enumerate([(235,239,228),(37,53,68)]):
 bg=Image.new('RGBA',(480,350),(*col,255));bg.alpha_composite(canvas)
 compare.paste(bg.convert('RGB'),(20+i*495,35))
compare.save(DOC/'alpha_check.png',optimize=True)

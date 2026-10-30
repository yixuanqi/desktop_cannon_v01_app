"""Render a synthetic offline preview using the V0.6.1 JS physics constants.
This does not capture or emulate the Windows Explorer desktop."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

W,H=960,540
CELL=(470,130,95,123)
P={
 'impulseScale':.32,'maxLaunchSpeed':620,'gravity':1450,'flightSeconds':.92,
 'linearDrag':.10,'restitutionX':.42,'restitutionY':.38,'floorFriction':.80,
 'angularDamping':1.7,'maxAngularSpeed':8.,'springK':52.,'springDamping':14.4,
 'rotationSpringK':48.,'rotationSpringDamping':12.5,'settlePosition':1.35,
 'settleVelocity':18.,'settleAngle':.025,'settleAngularVelocity':.08,
 'maxDuration':3.8,'fixedStep':1/120,
}
font_candidates=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf']
bold_candidates=['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','C:/Windows/Fonts/arialbd.ttf']
def load_font(candidates,size):
    for candidate in candidates:
        try:return ImageFont.truetype(candidate,size)
        except OSError:pass
    return ImageFont.load_default()
font=load_font(font_candidates,18)
small=load_font(font_candidates,13)
bold=load_font(bold_candidates,24)

def desktop():
    im=Image.new('RGB',(W,H),(49,79,112));d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,190),fill=(67,105,145))
    d.rectangle((0,190,W,360),fill=(126,88,133))
    d.rectangle((0,360,W,480),fill=(48,132,111))
    d.rectangle((0,480,W,H),fill=(130,130,130))
    d.text((330,66),'THROUGH PHOTONICS',font=bold,fill=(194,207,218))
    d.text((320,245),'Partnership · Loyalty · Resilience',font=font,fill=(214,201,217))
    d.text((300,405),'Focusing the power of photonics',font=font,fill=(190,218,207))
    d.text((32,24),'V0.6.1  ·  SINGLE ICON PHYSICS PREVIEW',font=small,fill=(240,237,220))
    d.line((0,480,W,480),fill=(210,210,210),width=2)
    return im

def draw_icon(size=(95,123)):
    im=Image.new('RGBA',size,(0,0,0,0));d=ImageDraw.Draw(im)
    cx,cy=47,43;r=29
    # Chrome-like three-segment round icon
    d.pieslice((cx-r,cy-r,cx+r,cy+r),-35,85,fill=(225,71,58),outline=(248,246,234),width=2)
    d.pieslice((cx-r,cy-r,cx+r,cy+r),85,205,fill=(236,188,48),outline=(248,246,234),width=2)
    d.pieslice((cx-r,cy-r,cx+r,cy+r),205,325,fill=(65,164,91),outline=(248,246,234),width=2)
    d.ellipse((cx-14,cy-14,cx+14,cy+14),fill=(239,244,246),outline=(255,255,255),width=2)
    d.ellipse((cx-9,cy-9,cx+9,cy+9),fill=(65,139,205))
    d.text((47,83),'Chrome',font=small,fill=(255,255,255),anchor='mt',stroke_width=1,stroke_fill=(35,47,63))
    return im

bg=desktop();x0,y0,cw,ch=CELL
icon=draw_icon()
# Background patch copied from the static synthetic desktop.
patch=bg.crop((x0,y0,x0+cw,y0+ch)).convert('RGBA')
state={'x':float(x0),'y':float(y0),'vx':-1450*.32,'vy':-980*.32,'angle':0.0,
       'omega':-8.0,'age':0.0,'flightAge':0.0,'phase':'flight','bouncesX':0,'bouncesY':0}
# Calculate the same off-centre impact torque as the JS module.
rx=(x0+cw-3)-(x0+cw/2); ry=(y0+43)-(y0+ch/2)
inertia=(cw*cw+ch*ch)/12
state['omega']=max(-P['maxAngularSpeed'],min(P['maxAngularSpeed'],(rx*state['vy']-ry*state['vx'])/inertia*1.25))

def step(s,h):
    s['age']+=h
    if s['phase']=='flight':
        s['flightAge']+=h
        drag=math.exp(-P['linearDrag']*h)
        s['vx']*=drag;s['vy']+=P['gravity']*h
        s['x']+=s['vx']*h;s['y']+=s['vy']*h
        s['angle']+=s['omega']*h;s['omega']*=math.exp(-P['angularDamping']*h)
        if s['x']<0:s['x']=0;s['vx']=abs(s['vx'])*P['restitutionX'];s['omega']*=-.55;s['bouncesX']+=1
        if s['x']+cw>W:s['x']=W-cw;s['vx']=-abs(s['vx'])*P['restitutionX'];s['omega']*=-.55;s['bouncesX']+=1
        if s['y']<0:s['y']=0;s['vy']=abs(s['vy'])*P['restitutionY'];s['bouncesY']+=1
        floor=480
        if s['y']+ch>floor:
            s['y']=floor-ch
            if abs(s['vy'])>65:s['vy']=-abs(s['vy'])*P['restitutionY']
            else:s['vy']=0
            s['vx']*=P['floorFriction'];s['omega']*=.72;s['bouncesY']+=1
        if s['flightAge']>=P['flightSeconds']:s['phase']='return'
    else:
        dx=s['x']-x0;dy=s['y']-y0
        ax=-P['springK']*dx-P['springDamping']*s['vx']
        ay=-P['springK']*dy-P['springDamping']*s['vy']
        s['vx']+=ax*h;s['vy']+=ay*h;s['x']+=s['vx']*h;s['y']+=s['vy']*h
        aa=-P['rotationSpringK']*s['angle']-P['rotationSpringDamping']*s['omega']
        s['omega']+=aa*h;s['angle']+=s['omega']*h
        dist=math.hypot(s['x']-x0,s['y']-y0)
        if dist<=P['settlePosition'] and math.hypot(s['vx'],s['vy'])<=P['settleVelocity'] and abs(s['angle'])<=P['settleAngle'] and abs(s['omega'])<=P['settleAngularVelocity']:
            return False
    return s['age']<P['maxDuration']

def render(s, t):
    frame=bg.copy().convert('RGBA')
    # Original icon is masked with the exact background patch while the copy moves.
    frame.alpha_composite(patch,(x0,y0))
    rotated=icon.rotate(-math.degrees(s['angle']),resample=Image.Resampling.BICUBIC,expand=True)
    px=s['x']+cw/2-rotated.width/2;py=s['y']+ch/2-rotated.height/2
    frame.alpha_composite(rotated,(int(round(px)),int(round(py))))
    d=ImageDraw.Draw(frame)
    d.rounded_rectangle((20,70,370,145),radius=10,fill=(13,25,37,220),outline=(210,222,230,100))
    d.text((36,82),f"phase: {s['phase']}  |  t: {t:.2f}s",font=small,fill=(250,240,219))
    d.text((36,104),f"velocity: ({s['vx']:.0f}, {s['vy']:.0f}) px/s",font=small,fill=(250,240,219))
    d.text((36,126),f"spin: {s['omega']:.2f} rad/s  |  bounces: {s['bouncesX']+s['bouncesY']}",font=small,fill=(250,240,219))
    return frame.convert('RGB')

frames=[];t=0.0;alive=True;next_frame=0.0
while alive and t<4.0:
    if t+1e-9>=next_frame:
        frames.append(render(state,t));next_frame+=1/18
    alive=step(state,1/120);t+=1/120
# Add a short settled hold so the return is easy to see.
frames.extend([render(state,t)]*5)
out=Path('docs/v061_icon_physics_preview.gif')
frames[0].save(out,save_all=True,append_images=frames[1:],duration=56,loop=0,optimize=True)
# Three-state contact sheet.
indices=[0,min(len(frames)//3,len(frames)-1),min(2*len(frames)//3,len(frames)-1),len(frames)-1]
thumbs=[frames[i].resize((480,270)) for i in indices]
contact=Image.new('RGB',(960,540),(24,34,44))
for i,im in enumerate(thumbs):contact.paste(im,((i%2)*480,(i//2)*270))
contact.save('docs/v061_icon_physics_contact.png')
print(f'frames={len(frames)} duration_ms={len(frames)*55} gif={out} bytes={out.stat().st_size}')

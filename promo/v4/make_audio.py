"""Soundtrack + sound design for the 30 s Freda Tech showcase (v4, 46 s). Pure synthesis, royalty-free."""
import numpy as np, wave
SR=44100; DUR=46.0; N=int(SR*DUR)
rng=np.random.default_rng(7)
mix=np.zeros((2,N)); send=np.zeros((2,N))   # dry bus and reverb send
def tt(d): return np.arange(int(d*SR))/SR
def put(x,t0,g=1.0,pan=0.0,rev=0.0):
    i0=int(t0*SR); x=np.asarray(x,float)
    if i0<0: x=x[-i0:]; i0=0
    n=min(len(x),N-i0)
    if n<=0: return
    l=g*np.sqrt((1-pan)/2); r=g*np.sqrt((1+pan)/2)
    for bus,amt in ((mix,1.0),(send,rev)):
        if amt: bus[0,i0:i0+n]+=x[:n]*l*amt; bus[1,i0:i0+n]+=x[:n]*r*amt
def hz(m): return 440*2**((np.asarray(m)-69)/12)
def lp(x,a):            # one-pole low-pass, a may be an array (0..1)
    y=np.empty_like(x); s=0.0; a=np.broadcast_to(a,x.shape)
    for i in range(len(x)): s+=a[i]*(x[i]-s); y[i]=s
    return y
def noise(d): return rng.uniform(-1,1,int(d*SR))
# ---------------- SFX ----------------
def whoosh(d=.6,up=True,bright=.5):
    t=tt(d);k=t/d; e=(k**1.8 if up else (1-k)**1.6)*np.sin(np.pi*np.clip(k*1.02,0,1))**.3
    c=.01+bright*(k**2 if up else (1-k)**2); x=lp(lp(noise(d),c),c)
    return x*e*4
def swish(d=.28): 
    t=tt(d);k=t/d; e=np.sin(np.pi*k)**2; x=lp(noise(d),.05+.45*np.sin(np.pi*k)); return x*e*2.2
def pop(f=600,d=.12):
    t=tt(d); f_=f*(1+2.5*np.exp(-t*60)); ph=2*np.pi*np.cumsum(f_)/SR
    return np.sin(ph)*np.exp(-t*38)
def bubble(f=900): 
    t=tt(.09); f_=f*(1+1.2*t/.09); return np.sin(2*np.pi*np.cumsum(f_)/SR)*np.sin(np.pi*t/.09)*np.exp(-t*25)
def click():
    t=tt(.05); return (noise(.05)*np.exp(-t*400)*.8+np.sin(2*np.pi*2400*t)*np.exp(-t*300)*.6+np.sin(2*np.pi*1100*t)*np.exp(-t*120)*.3)
def tick(f=3000,v=1): t=tt(.03); return np.sin(2*np.pi*f*t)*np.exp(-t*260)*v+noise(.03)*np.exp(-t*500)*.3*v
def thud(f=55,d=.5):
    t=tt(d); ph=2*np.pi*np.cumsum(f+90*np.exp(-t*25))/SR
    return np.sin(ph)*np.exp(-t*8)+lp(noise(d),.08)*np.exp(-t*30)*.8
def impact(d=1.6,big=1.0):
    t=tt(d); ph=2*np.pi*np.cumsum(32+120*np.exp(-t*7))/SR
    return (np.sin(ph)*np.exp(-t*2.2)+lp(noise(d),.15)*np.exp(-t*6)*.9*big+lp(noise(d),.5)*np.exp(-t*30)*.6)
def riser(d=1.0):
    t=tt(d);k=t/d; f=200+1600*k**2; s=np.sin(2*np.pi*np.cumsum(f)/SR)*.25+lp(noise(d),.02+.4*k**2)*1.6
    return s*k**2
def chime(notes,d=1.4,v=1):
    out=np.zeros(int((d+.1*len(notes))*SR))
    for i,m in enumerate(notes):
        t=tt(d);f=hz(m);x=(np.sin(2*np.pi*f*t)+.35*np.sin(2*np.pi*f*2.01*t)*np.exp(-t*6)+.15*np.sin(2*np.pi*f*3.98*t)*np.exp(-t*10))*np.exp(-t*3.2)
        i0=int(i*.07*SR);out[i0:i0+len(x)]+=x*v
    return out
def flyby(d=1.7):   # jet pass: filtered noise + tone with doppler-ish pitch fall
    t=tt(d);k=t/d; amp=np.exp(-((k-.55)/.22)**2)
    f=420*(1.25-.5/(1+np.exp(-(k-.55)*14))); tone=np.sin(2*np.pi*np.cumsum(f)/SR)*.25
    x=lp(noise(d),.06+.25*amp)*2.2+tone; return x*amp
def step(): t=tt(.12); return lp(noise(.12),.12)*np.exp(-t*45)*1.4+np.sin(2*np.pi*90*t)*np.exp(-t*40)*.5
def flip(): return swish(.18)*.8
# ---------------- MUSIC ----------------
BPM=120; BT=60/BPM; M0=5.5; M1=42.0
CH=[[53,57,60,64],[55,59,62,67],[52,55,59,62],[57,60,64,67]]; RT=[41,43,40,45]
def kick(): t=tt(.45); ph=2*np.pi*np.cumsum(42+150*np.exp(-t*30))/SR; return np.sin(ph)*np.exp(-t*6.5)+noise(.45)*np.exp(-t*120)*.15
def clap():
    d=.3;t=tt(d);x=lp(noise(d),.4); e=np.exp(-t*20)
    for o in (.0,.011,.022): e+=np.exp(-np.clip(t-o,0,None)*120)*(t>=o)*.6
    return x*e*.8
def hat(o=False): d=.25 if o else .06; t=tt(d); x=noise(d); x=x-lp(x,.3); return x*np.exp(-t*(14 if o else 70))
def bass(m,d=.24): t=tt(d);f=hz(m); x=np.tanh(1.8*(np.sin(2*np.pi*f*t)+.5*np.sin(4*np.pi*f*t)));return x*np.minimum(1,t/.005)*np.exp(-t*5)
def pad(ch,d):
    t=tt(d); x=np.zeros_like(t)
    for m in ch:
        for det in (-.006,0,.006):
            f=hz(m)*(1+det); x+=sum(np.sin(2*np.pi*f*h*t+rng.uniform(0,6))/h**1.6 for h in (1,2,3,4,5))
    env=np.minimum(1,t/.25)*np.minimum(1,(d-t)/.4); return x*env/(len(ch)*3)
def pluck(m,v=1): t=tt(.35);f=hz(m); return (np.sin(2*np.pi*f*t)+.5*np.sin(4*np.pi*f*t)*np.exp(-t*20))*np.exp(-t*11)*v

def ding(): return chime([84,88,91],1.2,1.0)

def ding(): return chime([84,88,91],1.2,1.0)
def put_pan(x,t0,g,p0,p1,rev=0.0):
    """mono source with a pan sweep from p0 to p1"""
    n=len(x); pan=np.linspace(p0,p1,n)
    i0=int(t0*SR); m=min(n,N-i0)
    l=g*np.sqrt((1-pan)/2)[:m]; r=g*np.sqrt((1+pan)/2)[:m]
    mix[0,i0:i0+m]+=x[:m]*l; mix[1,i0:i0+m]+=x[:m]*r
    if rev: send[0,i0:i0+m]+=x[:m]*l*rev; send[1,i0:i0+m]+=x[:m]*r*rev
def jet(d=3.0,peak=2.35):
    """airliner pass-by: turbine whine with doppler drop + broadband roar"""
    t=tt(d); k=t-peak
    amp=np.where(k<0,np.exp(-(k/0.9)**2),np.exp(-(k/0.45)**2))
    dop=1.0/(1.0+0.12*np.tanh(k*5))           # pitch high on approach, low after
    whine=np.zeros_like(t)
    for f,a in ((1150,1.0),(2300,.35),(560,.5)):
        whine+=a*np.sin(2*np.pi*np.cumsum(f*dop)/SR)
    roar=lp(lp(noise(d),.04+.22*amp),.06+.25*amp)*3.2
    rumble=lp(noise(d),.012)*6*amp
    return (whine*.10+roar+rumble)*amp
# ---- music ----
ip=pad([57,60,64,71],3.2); put(lp(ip,.05)*np.linspace(.3,1,len(ip)),0,1.4,rev=.5)
for k in range(6): put(lp(kick(),.25),k*.5,.8)
for k in range(12): put(hat(),k*.25,.05,pan=.3)
put(pad([53,60,64,69],2.7),3.0,.6,rev=.7)
BREAK=(24.0,25.0)
nb=int((M1-M0)/(4*BT))+1
for b in range(nb):
    t0=M0+b*4*BT
    if t0>=M1: break
    c=CH[b%4]; put(pad(c,min(4*BT+.3,M1-t0+.3)),t0,.5,rev=.5)
    for k in range(16):
        ts=t0+k*BT/4
        if ts>=M1-.01: break
        brk=BREAK[0]<=ts<BREAK[1]
        if k%4==0 and not brk: put(kick(),ts,.95)
        if k in (4,12) and not brk: put(clap(),ts,.5,rev=.25)
        if not brk: put(hat(k%4==2),ts,.15 if k%2 else .09,pan=.3 if k%2 else -.3)
        if k%2==0 and not brk: put(bass(RT[b%4]+(12 if k in (6,14) else 0)),ts,.42)
        arp=[c[0]+12,c[2]+12,c[1]+24,c[3]+12]
        if k%2==1 or b>=4: put(pluck(arp[k%4]+(12 if b>=6 and k%4==3 else 0),.7),ts,.15,pan=.45 if k%4<2 else -.45,rev=.35)
put(riser(1.0),24.0,.6,rev=.3)
put(pad([48,55,60,64,74],4.0),M1,.9,rev=.9)
for k in range(8): put(pluck([72,76,79,84][k%4]+12*(k>=4),.6),M1+.5+k*.25,.13,pan=.5 if k%2 else -.5,rev=.8)
put(chime([72,76,79,84,88],2.5,.5),M1+.15,.32,rev=.9)

# ================= CUE SHEET (matches promo.html) =================
# S1 hook 0-3
put(whoosh(.5,False),0.0,.4)
for a in (.45,1.15,1.85): put(ding(),a,.32,rev=.5); put(swish(.25),a-.05,.3,pan=.2)
put(pop(700),1.0,.45)
put(riser(.6),2.4,.5); put(whoosh(.45),2.55,.55); put(impact(1.6,.8),2.98,.85,rev=.5)
# S2 Freda intro 3-5.5
for i in range(9): put(bubble(700+i*90),3.38+i*.045,.3,pan=rng.uniform(-.7,.7),rev=.3)
put(impact(1.3,.5),3.5,.6,rev=.5); put(chime([79,84,88],1.5),3.55,.26,rev=.8)
put(swish(.35),3.72,.55,pan=-.2); put(tick(2600),4.05,.55); put(chime([88],1.0),4.2,.2,rev=.8); put(pop(560),4.45,.5)
put(whoosh(.5),5.02,.55,pan=-.4); put(impact(1.5),5.48,.8,rev=.4)
# S3 desktop + plane fly-through 5.5-10
put(whoosh(.5,False),5.52,.4); put(thud(48,.6),6.05,.8)
put(pop(380,.18),6.2,.6)
put_pan(jet(3.0,2.35),6.1,.95,.5,-1.0,rev=.35)
put(impact(1.8,.4),8.45,.45,rev=.4)
put(swish(.4),6.1,.18,pan=.3); put(click(),6.62,.9); put(chime([84],.6),6.66,.18,rev=.5)
for i in range(32): put(tick(1800+rng.uniform(-200,200),.5),6.88+i*.072,.3,pan=-.2)
put(pop(300,.2),8.2,.6); put(whoosh(.5,False),8.21,.5,pan=-.3)
for i in range(3): put(pop(700+i*140),8.5+i*.14,.5,pan=[-.5,.5,0][i],rev=.2)
put(whoosh(.5),9.55,.55,pan=.4); put(impact(1.3,.6),9.98,.65,rev=.3)
# S4 site in 3D 10-15
for i in range(5):
    a=10.2+i*.26; put(swish(.25),a,.35,pan=-.5+i*.25); put(thud(60+i*6,.35),a+.28,.55); put(tick(2400+i*200),a+.3,.35)
    put(pop(600+i*90),a+.45,.45,pan=.5,rev=.2)
put(whoosh(1.2,False,.3),12.0,.25,pan=.3)
put(whoosh(.9),13.5,.5); put(thud(55,.5),14.45,.6); put(chime([84,91],1.0),14.5,.2,rev=.6)
put(whoosh(.5),14.55,.55,pan=-.4); put(impact(1.2,.5),14.98,.6,rev=.3)
# S5 tracking 15-21
put(swish(.35),15.05,.5,pan=-.6)
for i in range(4): put(swish(.22),15.25+i*.1,.3,pan=.6)
put(swish(.3),15.4,.35); put(click(),15.62,.9); put(whoosh(.55,False),15.7,.3,pan=.2)
for i,a in enumerate([15.75,17.05,18.35,19.65]):
    put(ding(),a+.12,.34,rev=.5); put(pop(500+i*120),a,.55,rev=.2); put(swish(.25),a+.1,.3,pan=-.4)
    put_pan(jet(1.3,.7)*.6,a-.2,.35,-.8+i*.35,-.5+i*.35)
put(chime([84,88,91,96],1.6),19.7,.25,rev=.8)
put(whoosh(.5),20.55,.55,pan=-.4); put(impact(1.2,.5),20.98,.6,rev=.3)
# S6 e-mails 21-25
put(whoosh(.45,False),21.1,.45); put(thud(70,.35),21.5,.5)
for k,a in enumerate([21.45,21.67,21.89,22.11]): put(pop(800+k*110),a,.5,pan=.5); put(tick(3000),a+.3,.35)
put(whoosh(.6,False),22.45,.5); put(thud(60,.4),22.95,.45); put(swish(.3),22.7,.45,pan=-.7); put(swish(.3),22.72,.45,pan=.7)
for i in range(16): put(tick(1700+rng.uniform(-200,200),.4),23.25+i*.08,.26,pan=.2)
put(whoosh(.5),24.5,.55,pan=.4); put(impact(1.4,.8),24.98,.8,rev=.4)
# S7 app carousel 25-30
put_pan(whoosh(1.6,False,.6),25.0,.7,-1,1,rev=.3)
for i in range(6): put(swish(.2),25.1+i*.22,.25,pan=[-.7,.7][i%2])
for i in range(3): put(pop(650+i*130),26.3+i*.15,.5,pan=[-.6,0,.6][i])
put(ding(),27.45,.34,rev=.5); put(swish(.3),27.4,.35)
put(whoosh(.5),29.55,.55,pan=-.4); put(impact(1.2,.5),29.98,.6,rev=.3)
# S8 client & admin 30-34
put(swish(.35),30.35,.5,pan=.6); put(thud(55,.5),30.6,.7); put(pop(620),31.0,.5)
for i in range(4): put(pop(650+i*110),31.3+i*.15,.5,pan=[-.5,.5,-.5,.5][i],rev=.2)
put(swish(.5),31.9,.45,pan=.5)
put(whoosh(.5),33.55,.55,pan=-.4); put(impact(1.2,.5),33.98,.6,rev=.3)
# S9 multi-device, laptop opens 34-38
put(whoosh(.8,False,.25),34.25,.35); put(click(),35.0,.6); put(thud(80,.3),35.02,.4)
put(swish(.3),34.7,.5,pan=-.7); put(swish(.3),34.85,.5,pan=.7)
for i in range(3): put(pop(650+i*130),35.0+i*.12,.5,pan=[-.6,0,.6][i])
for k in range(11): put(step(),35.2+k*.2,.3,pan=-1+2*(k/11))
put(whoosh(.5),37.55,.55,pan=.4); put(impact(1.2,.5),37.98,.6,rev=.3)
# S10 Freda Tech services 38-42
for i in range(3): a=38.35+i*.25; put(flip(),a,.6,pan=[-.4,0,.4][i]); put(thud(65,.3),a+.35,.5); put(pop(700+i*150),a+.4,.45,rev=.2)
put(riser(.8),40.8,.6,rev=.3); put(whoosh(.6),41.5,.5)
# S11 outro 42-46
put(impact(2.8,1.2),41.98,1.0,rev=.7)
for i in range(10): put(bubble(1100+i*80),42.2+i*.03,.25,pan=rng.uniform(-.8,.8),rev=.6)
put(swish(.35),42.48,.5,pan=-.2); put(tick(2600),42.8,.5); put(swish(.3),42.9,.35); put(swish(.3),43.02,.35)
put(pop(520),43.4,.55); put(pop(640),43.6,.55); put(chime([88,91,96],1.6),44.0,.25,rev=.8)
# ---------------- reverb (feedback combs) ----------------
def comb(x,D,g):
    y=x.copy()
    for i in range(D,len(y),D): y[i:i+D]+=g*y[i-D:i][:len(y[i:i+D])]
    return y
rev=np.zeros_like(send)
for ch in (0,1):
    for D,g in ((1557,.80),(1617,.79),(1491,.81),(1422,.78)):
        rev[ch]+=comb(send[ch],D+ch*23,g)
rev=np.stack([lp(rev[0],.35),lp(rev[1],.35)])*.18
out=mix+rev
# fade tail
t=np.arange(N)/SR; out*=np.clip((DUR-t)/.45,0,1)
out=np.tanh(out/np.abs(out).max()*1.6)/np.tanh(1.6)*.93
pcm=(out.T*32767).astype('<i2')
with wave.open('soundtrack.wav','wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
print('ok')

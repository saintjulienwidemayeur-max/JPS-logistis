"""Soundtrack + sound design for the Freda Tech showcase (20 s, 120 BPM). Pure synthesis, royalty-free."""
import numpy as np, wave
SR=44100; DUR=20.0; N=int(SR*DUR)
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
BPM=120; BT=60/BPM; M0=2.5; M1=16.5
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
# intro pad (filtered, swelling)
ip=pad([53,60,64,69],2.6); put(ip*np.linspace(.2,1,len(ip)),0,.5,rev=.6)
nbars=int((M1-M0)/(4*BT))
for b in range(nbars):
    t0=M0+b*4*BT; c=CH[b%4]; put(pad(c,4*BT+.3),t0,.55,rev=.5)
    for k in range(16):           # 16th grid
        ts=t0+k*BT/4
        if k%4==0: put(kick(),ts,.95)
        if k in (4,12): put(clap(),ts,.5,rev=.25)
        put(hat(k%4==2),ts,.16 if k%2 else .10,pan=.3 if k%2 else -.3)
        if k%2==0: put(bass(RT[b%4]+(12 if k in (6,14) else 0)),ts,.42)
        arp=[c[0]+12,c[2]+12,c[1]+24,c[3]+12]
        if k%2==1 or b>=3: put(pluck(arp[k%4]+(12 if b>=4 and k%4==3 else 0),.7),ts,.16,pan=.45 if k%4<2 else -.45,rev=.35)
# end chord
put(pad([48,55,60,64,74],3.6),M1,.9,rev=.9)
put(chime([72,76,79,84,88],2.5,.5),M1+.15,.35,rev=.9)
# ---------------- SOUND DESIGN cue sheet (matches promo.html) ----------------
put(riser(.75),0,.35,rev=.3)
for i in range(9): put(bubble(700+i*90),.62+i*.045,.32,pan=rng.uniform(-.7,.7),rev=.3)
put(impact(1.4,.6),.73,.7,rev=.5); put(chime([79,84,88],1.6),.78,.28,rev=.8)
put(swish(.35),.95,.55,pan=-.2); put(tick(2600),1.38,.6); put(chime([88],1.0),1.62,.22,rev=.8)
put(whoosh(.55),2.0,.55,pan=-.4); put(impact(1.5),2.48,.75,rev=.4)
put(swish(.3),2.55,.4); put(whoosh(.35,False),2.72,.45); put(thud(70,.4),2.95,.55)
put(flyby(1.7),2.95,.7,pan=0); 
for i in range(4): put(pop(520+i*120),3.5+i*.15,.55,pan=[-.5,.5,-.5,.5][i],rev=.2)
put(thud(60,.5),4.32,.6); put(whoosh(.5),4.55,.55,pan=.4); put(impact(1.2,.5),4.98,.55,rev=.3)
put(whoosh(.55,False),5.02,.4); put(thud(48,.6),5.55,.8)
put(pop(380,.18),5.85,.6); put(whoosh(.45,False),5.86,.45,pan=.5)
put(swish(.4),5.8,.18,pan=.3); put(click(),6.32,.9); put(chime([84],.6),6.36,.18,rev=.5)
for i in range(26): put(tick(1800+rng.uniform(-200,200),.5),6.6+i*.072,.35,pan=-.2)
put(pop(300,.2),7.05,.6); put(whoosh(.5,False),7.06,.5,pan=-.3); put(lp(noise(.8),.25)*np.exp(-tt(.8)*5),7.15,.25,pan=.5)
for i in range(3): put(pop(700+i*140),7.35+i*.15,.5,pan=[-.5,.5,0][i],rev=.2)
put(riser(.7),8.3,.55); put(whoosh(.5),8.55,.6); put(impact(1.6,1),8.98,.9,rev=.5)
put(swish(.3),9.3,.5,pan=-.7); put(swish(.3),9.5,.5,pan=.7); put(thud(65,.3),9.75,.45,pan=-.4); put(thud(70,.3),9.95,.45,pan=.4)
for i in range(3): put(pop(650+i*130),9.9+i*.13,.5,pan=[-.6,0,.6][i])
for k in range(52,64): put(step(),9+k*.2,.32,pan=-1+2*((k-52)/12))
put(whoosh(.5),12.55,.55,pan=-.4); put(impact(1.2,.5),12.98,.6,rev=.3)
for i in range(6): put(flip(),13.28+i*.14,.6,pan=[-.5,.5][i%2]); put(tick(2200+i*150),13.5+i*.14,.45)
put(chime([84,91],1.2),14.05,.25,rev=.6); put(whoosh(.7,False),14.2,.35,pan=.5)
put(riser(.9),15.6,.6,rev=.3); put(whoosh(.6),16.0,.5)
put(impact(2.6,1.2),16.48,1.0,rev=.7)
for i in range(10): put(bubble(1100+i*80),16.75+i*.03,.25,pan=rng.uniform(-.8,.8),rev=.6)
put(swish(.35),17.08,.5,pan=-.2); put(tick(2600),17.45,.5); put(swish(.3),17.62,.35); put(swish(.3),17.78,.35)
put(chime([88,91,96],1.6),18.25,.25,rev=.8)
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

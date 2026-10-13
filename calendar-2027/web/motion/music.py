import sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
SR=44100; DUR=16.0; N=int(SR*DUR)
rng=np.random.default_rng(27)
L=np.zeros(N); R=np.zeros(N)
def hz(m): return 440*2**((m-69)/12)
def env(n, a=0.005, d=0.1, s=0.0, r=0.1, hold=None):
    t=np.arange(n)/SR; e=np.ones(n)
    a_n=int(a*SR); e[:a_n]=np.linspace(0,1,a_n,endpoint=False) if a_n>0 else 1
    dn=int(d*SR);
    if dn>0 and a_n+dn<n: e[a_n:a_n+dn]=np.linspace(1,s,dn)
    if a_n+dn<n: e[a_n+dn:]=s
    rn=min(int(r*SR),n); e[n-rn:]*=np.linspace(1,0,rn)
    return e
def add(sig, t0, pan=0.0, gain=1.0):
    i=int(t0*SR)
    if i>=N: return
    j=min(N,i+len(sig)); s=sig[:j-i]*gain
    L[i:j]+=s*(1-max(0,pan)); R[i:j]+=s*(1+min(0,pan))
def lp(x,f,o=2): b,a=butter(o,f/(SR/2),'low'); return lfilter(b,a,x)
def hp(x,f,o=2): b,a=butter(o,f/(SR/2),'high'); return lfilter(b,a,x)
def bp(x,f1,f2,o=2): b,a=butter(o,[f1/(SR/2),f2/(SR/2)],'band'); return lfilter(b,a,x)
def tone(m,dur,wave='sine',a=0.01,d=0.15,s=0.5,r=0.2,vib=0):
    n=int(dur*SR); t=np.arange(n)/SR; f=hz(m)*(1+vib*np.sin(2*np.pi*5*t))
    ph=2*np.pi*np.cumsum(f)/SR
    if wave=='sine': x=np.sin(ph)
    elif wave=='tri': x=2/np.pi*np.arcsin(np.sin(ph))
    elif wave=='saw': x=2*((ph/(2*np.pi))%1)-1
    elif wave=='square': x=np.sign(np.sin(ph))
    elif wave=='pluck': x=np.sin(ph)+.4*np.sin(2*ph)+.2*np.sin(3*ph)
    return x*env(n,a,d,s,r)
def kick():
    n=int(.35*SR); t=np.arange(n)/SR; f=45+110*np.exp(-t*28); x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9); x+=0.15*np.exp(-t*80)*rng.standard_normal(n); return x
def hat(open_=False):
    n=int((.18 if open_ else .05)*SR); t=np.arange(n)/SR; x=hp(rng.standard_normal(n),7000)*np.exp(-t*(18 if open_ else 70)); return x*.5
def clap():
    n=int(.22*SR); t=np.arange(n)/SR; x=bp(rng.standard_normal(n),1100,3800)*(np.exp(-t*22)+0.8*np.exp(-((t-.012)**2)*9e4)+0.8*np.exp(-((t-.026)**2)*9e4)); return x*.9
def whoosh(dur,f0,f1,up=True,gain=1.0):
    n=int(dur*SR); t=np.arange(n)/SR; x=rng.standard_normal(n)
    fc=np.geomspace(f0,f1,n) if up else np.geomspace(f1,f0,n)
    out=np.zeros(n); y=0; # simple moving band via time-varying one-pole filters
    a=np.exp(-2*np.pi*fc/SR); lo=np.zeros(n); s=0.0; s2=0.0
    for i in range(n):
        s=a[i]*s+(1-a[i])*x[i]; s2=a[i]*s2+(1-a[i])*s; lo[i]=s-s2
    lo/= (np.max(np.abs(lo))+1e-9)
    e=np.sin(np.pi*np.linspace(0,1,n))**1.5
    return lo*e*gain
def sparkle(n_notes=7,span=.5):
    out=np.zeros(int((span+.6)*SR)); sc=[84,88,91,93,96,100,103]
    for i in range(n_notes):
        tn=tone(sc[i%len(sc)],.5,'sine',a=.002,d=.4,s=0,r=.1)
        k=int(i*span/n_notes*SR); out[k:k+len(tn)]+=tn[:len(out)-k]*(0.5-i*0.03)
    return out
def thud():
    n=int(.7*SR); t=np.arange(n)/SR; f=60*np.exp(-t*3)+38; x=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*6); x+=lp(rng.standard_normal(n),600)*np.exp(-t*25)*.5; return x
def clink():
    n=int(.35*SR); t=np.arange(n)/SR; x=sum(np.sin(2*np.pi*f*t)*np.exp(-t*k) for f,k in [(2400,18),(3700,26),(5200,34)]); return x*.25
def tick(m=96,g=.3): return tone(m,.12,'sine',a=.001,d=.1,s=0,r=.02)*g
def riser(dur,f0,f1):
    n=int(dur*SR); t=np.arange(n)/SR; x=rng.standard_normal(n); f=np.geomspace(f0,f1,n)
    y=bp(x,f0,f1*1.0,2)*np.linspace(0,1,n)**2
    sw=np.sin(2*np.pi*np.cumsum(np.geomspace(300,1800,n))/SR)*np.linspace(0,1,n)**2*.25
    return (y/ (np.max(np.abs(y))+1e-9))*.8+sw

BPM=120; B=60/BPM
prog=[(48,[60,64,67]),(43,[59,62,67]),(45,[57,60,64]),(41,[57,60,65])]   # C G Am F  (bass, chord)
arp=[[72,76,79,84,79,76,79,76],[71,74,79,83,79,74,79,74],[69,72,76,81,76,72,76,72],[69,72,77,81,77,72,77,72]]
# ---- pads + bass (whole piece, 4 s per chord)
for bar,(bs,ch) in enumerate(prog):
    t0=bar*4.0
    for m in ch:
        for det in (-0.07,0.07):
            x=tone(m+det,4.1,'saw',a=.6,d=.3,s=.8,r=.8)*0.05; x=lp(x,1800)
            add(x,t0,pan=det*3)
    for k in range(8):                      # bass eighths
        add(lp(tone(bs,.45,"saw",a=.005,d=.15,s=.4,r=.1),380)*.2, t0+k*B)
# ---- drums: build from 2.6s
for beat in range(int(DUR/B)):
    t=beat*B
    if t>=2.6:
        add(kick()*0.9,t)
        add(hat(False)*0.5,t+B/2)
        if beat%2==1: add(clap()*0.55,t)
    elif t>=1.0 and beat%2==0: add(kick()*0.4,t)
    if t>=5.0: add(hat(True)*0.35,t+B/2,pan=.2)
# drop out of the drums for the months section (13.2-13.6) then outro
# ---- arpeggio lead from 3 s
for bar in range(4):
    for k,m in enumerate(arp[bar]):
        t=bar*4.0+k*B/2*1.0+ (0)
        for rep in range(1):
            tt=bar*4.0+k*0.5
            if tt>=3.0 and tt<15.0:
                add(tone(m,.35,'pluck',a=.003,d=.25,s=0,r=.05)*0.16,tt,pan=-0.3+0.6*((k%4)/3))
    # second octave echoes
for bar in range(4):
    for k,m in enumerate(arp[bar]):
        tt=bar*4.0+k*0.5+0.25
        if 5.0<=tt<15.0: add(tone(m+12,.25,'tri',a=.003,d=.2,s=0,r=.04)*0.07,tt,pan=0.4)
# ---- SFX synced to the animation
add(whoosh(.7,300,5000,True)*.55,.15)           # logo
add(whoosh(.7,300,5000,True)*.5,.42,pan=.4)    # flex
add(tone(96,.3,'sine',a=.002,d=.25,s=0,r=.05)*.25,.9)
for i,t in enumerate([1.1,1.25,1.4]): add(tone(72+i*4,.2,'pluck',a=.002,d=.15,s=0,r=.05)*.35,t+.55)   # digit blips (as they land)
add(riser(.9,300,6000)*.5,1.55)
add(thud()*1.1,2.6); add(sparkle(7,.5)*.6,2.6,pan=0.2); add(whoosh(.5,200,3000,False)*.35,2.5)
add(whoosh(.9,200,2500,True)*.45,3.0)             # globe
add(sparkle(6,.6)*.4,3.9)
add(whoosh(1.4,500,6000,True)*.25,3.3)            # orbit draw
add(sparkle(8,.7)*.55,4.5,pan=-.2)                # medal
for t in (5.2,5.4,5.6,5.8): add(tick(88+int((t-5.2)*10),.35),t+.35)
add(whoosh(.8,2500,300,False)*.4,7.3)             # globe leaves
add(whoosh(1.0,300,3500,False)*.5,7.9)            # containers drop
add(thud()*1.2,8.75); add(clink()*.9,8.8); add(clink()*.6,8.95,pan=.3)
add(whoosh(.6,200,3000,False)*.35,9.3)
for i in range(12): add(tick(84+ (i%6)*2,.22),9.62+i*.12+.25,pan=-.5+i/11)
for i,m in enumerate([96,100,103,108]): add(tick(m,.28),10.6+i*.22,pan=.3)
add(riser(.9,400,7000)*.5,12.3)
add(whoosh(.7,300,4000,False)*.4,13.2)
add(thud()*.7,13.55)
for k,m in enumerate([72,76,79,84]): add(tone(m,1.8,'tri',a=.004,d=.9,s=.25,r=.8)*.25,13.6+k*.05,pan=-.3+.2*k)
add(sparkle(9,.8)*.55,13.7)
add(tone(96,1.2,'sine',a=.002,d=1.0,s=0,r=.1)*.3,14.1)           # contact card ding
add(sparkle(5,.4)*.4,14.5)
# confetti pops
for i in range(14): add(hp(rng.standard_normal(int(.05*SR)),2500)*np.exp(-np.arange(int(.05*SR))/SR*80)*.35,13.7+i*.045+rng.random()*.03,pan=rng.uniform(-.8,.8))
# ---- master
mix=np.stack([L,R],1)
# gentle sidechain-ish compression + limiter via normalisation
mix=np.tanh(mix*1.1)
fade=np.ones(N); f_n=int(.7*SR); fade[-f_n:]=np.linspace(1,0,f_n); fade[:int(.05*SR)]=np.linspace(0,1,int(.05*SR))
mix*=fade[:,None]
mix/=np.max(np.abs(mix))/0.89
wavfile.write(sys.argv[1],SR,(mix*32767).astype(np.int16))
print('ok',mix.shape)

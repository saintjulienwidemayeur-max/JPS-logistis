"""Synthesises the promo soundtrack (120 BPM, 23 s) with pure Python — no samples, no licensing."""
import math, random, struct, wave
SR=44100; DUR=23.0; N=int(SR*DUR)
L=[0.0]*N; R=[0.0]*N
random.seed(3)
def add(buf_t0, samples, gain=1.0, pan=0.0):
    i0=int(buf_t0*SR)
    gl=gain*(1-max(0,pan)); gr=gain*(1+min(0,pan))
    for k,v in enumerate(samples):
        i=i0+k
        if i>=N: break
        if i<0: continue
        L[i]+=v*gl; R[i]+=v*gr
def hz(m): return 440*2**((m-69)/12)
def env(n,a,d,s=0.0,r=0.0):
    out=[]
    for i in range(n):
        t=i/SR
        if t<a: e=t/a
        else: e=s+(1-s)*math.exp(-(t-a)/d) if d>0 else s
        out.append(e)
    return out
def kick(vol=1.0):
    n=int(.42*SR);o=[];ph=0
    for i in range(n):
        t=i/SR;f=45+120*math.exp(-t*28);ph+=2*math.pi*f/SR
        o.append(math.sin(ph)*math.exp(-t*7)*vol+(random.random()*2-1)*math.exp(-t*90)*.15*vol)
    return o
def hat(vol=.3,dec=45):
    n=int(.09*SR);o=[];p=0
    for i in range(n):
        t=i/SR;x=random.random()*2-1;y=x-p;p=x;o.append(y*math.exp(-t*dec)*vol)
    return o
def clap(vol=.5):
    n=int(.25*SR);o=[];lp=0
    for i in range(n):
        t=i/SR;x=random.random()*2-1;lp+=(x-lp)*.35
        e=math.exp(-t*22)+.7*math.exp(-((t-.012)%.02)*0)*0
        o.append(lp*e*vol*(1.3 if t<.2 else 0))
    return o
def pluck(m,vol=.25,dec=9):
    f=hz(m);n=int(.5*SR);o=[]
    for i in range(n):
        t=i/SR;e=math.exp(-t*dec)
        v=math.sin(2*math.pi*f*t)+.4*math.sin(4*math.pi*f*t)*math.exp(-t*14)+.2*math.sin(6*math.pi*f*t)*math.exp(-t*20)
        o.append(v*e*vol)
    return o
def bass(m,length=.45,vol=.5):
    f=hz(m);n=int(length*SR);o=[]
    for i in range(n):
        t=i/SR;e=min(1,t/.008)*math.exp(-t*3.2)
        v=math.sin(2*math.pi*f*t)+.3*math.sin(4*math.pi*f*t)
        o.append(v*e*vol)
    return o
def pad(chord,length,vol=.12):
    n=int(length*SR);o=[0.0]*n
    for m in chord:
        f=hz(m)
        for det in (-.004,.004):
            ff=f*(1+det);ph=random.random()*6.28
            lp=0.0
            for i in range(n):
                t=i/SR
                x=0
                for h in (1,2,3,4):
                    x+=math.sin(2*math.pi*ff*h*t+ph)/h**1.5
                o[i]+=x
    # envelope + gentle swell
    for i in range(n):
        t=i/SR;a=min(1,t/.35);r=min(1,(length-t)/.5)
        o[i]*=a*r*vol/ (len(chord)*2)
    return o
def whoosh(length=1.0,vol=.5,up=True):
    n=int(length*SR);o=[];lp=0;lp2=0
    for i in range(n):
        t=i/SR;k=t/length
        c=.02+.5*(k**2.2 if up else (1-k)**2)
        x=random.random()*2-1;lp+=(x-lp)*c;lp2+=(lp-lp2)*c
        e=(k**1.6) if up else (1-k)**1.2
        o.append(lp2*e*vol*3)
    return o
def impact(vol=1.0):
    n=int(1.4*SR);o=[];ph=0;lp=0
    for i in range(n):
        t=i/SR;f=38+90*math.exp(-t*9);ph+=2*math.pi*f/SR
        x=random.random()*2-1;lp+=(x-lp)*.12
        o.append((math.sin(ph)*math.exp(-t*2.6)+lp*math.exp(-t*7)*.6)*vol)
    return o

BAR=2.0; BEAT=.5
# chords: Am F C G (midi)
CH=[[57,60,64],[53,57,60],[48,55,64],[55,59,62]]
ROOT=[45,41,48,43]
bounds=[3,7,11,15,18]
# pads
nb=int(DUR/BAR)+1
for b in range(nb):
    t0=b*BAR
    if t0>=DUR: break
    c=CH[b%4]
    vol=.10 if t0<3 else .17
    ln=BAR+.4
    if t0>=18: ln=DUR-t0 if b==nb-1 else BAR+.4
    add(t0,pad(c,min(ln,DUR-t0)),vol*3.2)
# drums + bass + arp
beats=int(DUR/BEAT)
for bt in range(beats):
    t=bt*BEAT;bar=int(t//BAR);ci=bar%4
    if t<DUR-1.5:
        if t<3:
            if bt%4==0: add(t,kick(.55))
        else:
            add(t,kick(.9 if bt%2==0 else .0 if t<7 else .0))
            if t>=7 and bt%2==1: pass
            if t>=3:
                add(t+BEAT/2,hat(.22 if t<7 else .3))
            if t>=7 and bt%4 in (1,3): add(t,clap(.45))
            # bass 8ths
            add(t,bass(ROOT[ci]+12*(bt%4==2),.4,.5),1.0)
            add(t+BEAT/2,bass(ROOT[ci],.3,.4),1.0)
    # arp
    if t>=3 and t<DUR-1.2:
        ch=CH[ci]
        pat=[ch[0]+12,ch[1]+12,ch[2]+12,ch[1]+24 if t>=11 else ch[1]+12]
        add(t,pluck(pat[bt%4],.20 if t<11 else .26),1.0,-.3)
        add(t+BEAT/2,pluck(pat[(bt+2)%4]+ (12 if t>=11 else 0),.14),1.0,.3)
# transitions
for tb in bounds:
    add(tb-.8,whoosh(.8,.5,True))
    add(tb-.02,impact(.9))
add(0.0,impact(.6))
add(0.0,whoosh(.5,.25,False))
# UI tick sounds (typing / button / notification)
def tick(f,vol=.3,dec=60):
    n=int(.12*SR);return [math.sin(2*math.pi*f*i/SR)*math.exp(-i/SR*dec)*vol for i in range(n)]
for i in range(9): add(11.6+i*.078,tick(1800+random.random()*400,.18,80))
add(12.4,tick(900,.5,30)); 
for i,t in enumerate([12.65,13.03,13.41,13.79]): add(t,pluck(76+i*2,.35,6),1.0)
add(13.85,pluck(88,.35,5)); add(13.88,pluck(95,.3,5))
add(16.9,tick(900,.5,30)); add(17.0,pluck(88,.35,5)); add(17.04,pluck(93,.3,5))
# final chord hit
add(18.0,pad([57,64,69,72],4.9,.2),3.5)
# fade out
for i in range(N):
    t=i/SR
    f=1.0
    if t>DUR-1.2: f=max(0,(DUR-t)/1.2)
    L[i]*=f;R[i]*=f
# soft clip + normalise
pk=max(max(map(abs,L)),max(map(abs,R)))
sc=.89/pk
with wave.open('soundtrack.wav','wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
    fr=bytearray()
    for i in range(N):
        a=math.tanh(L[i]*sc*1.2)/math.tanh(1.2)*.95;b=math.tanh(R[i]*sc*1.2)/math.tanh(1.2)*.95
        fr+=struct.pack('<hh',int(a*32767),int(b*32767))
    w.writeframes(bytes(fr))
print('ok',pk)

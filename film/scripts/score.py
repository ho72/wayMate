"""Original ambient/piano score, ocean bed and dialogue mix. No stock music."""
import json, math, subprocess, wave
from pathlib import Path
import numpy as np

def smooth(a,window):
    padded=np.pad(a,(window//2,window-1-window//2),mode='edge')
    summed=np.concatenate(([0.0],np.cumsum(padded,dtype=np.float64)))
    return ((summed[window:]-summed[:-window])/window).astype(np.float32)

SR=48000; LENGTH=108; N=SR*LENGTH
rng=np.random.default_rng(2046)
music=np.zeros((N,2),np.float32)

def place(signal,sec,pan=0.0,gain=1):
    start=int(sec*SR); count=min(len(signal),N-start)
    if count<=0:return
    p=(pan+1)*math.pi/4
    music[start:start+count,0]+=signal[:count]*gain*math.cos(p)
    music[start:start+count,1]+=signal[:count]*gain*math.sin(p)

def piano(midi,velocity=.12):
    t=np.arange(int(SR*4.8),dtype=np.float32)/SR
    freq=440*2**((midi-69)/12)
    a=np.zeros_like(t)
    for k,volume in [(1,1),(2,.24),(3,.115),(4,.055),(5,.021)]:
        a+=volume*np.sin(2*np.pi*freq*k*(1+.00008*k*k)*t)*np.exp(-t*(.62+k*.28))
    a*=np.minimum(t/.012,1)*velocity
    a+=rng.standard_normal(len(t)).astype(np.float32)*np.exp(-t*100)*.008
    return a

# Dmaj9 -> Bm7 -> Gmaj9 -> Asus. Slow, original unobtrusive composition.
chords=[[50,57,61,64,69],[47,54,57,62,66],[43,50,54,57,62],[45,52,57,59,64]]
for bar in range(27):
    sec=bar*4
    chord=chords[(bar//2)%4]
    for j,note in enumerate(chord):
        place(piano(note,.09 if j==0 else .045),sec+j*.21,(j-2)*.22)
    if bar%2==0:
        for j,note in enumerate([chord[3]+12,chord[2]+12,chord[4]+12]):
            place(piano(note,.035),sec+1.8+j*.66,(j-1)*.35)

# Room reflections with high-frequency damping.
dry=music.copy()
for delay,atten in [(.127,.18),(.263,.12),(.419,.09),(.653,.06),(.887,.04)]:
    d=int(delay*SR); music[d:]+=dry[:-d,::-1]*atten

# A low, gentle stereo surf bed. Recorded scene is conceptual, ambience is synthesized.
for ch in range(2):
    noise=rng.standard_normal(N).astype(np.float32)
    surf=smooth(noise,16)-smooth(noise,240)
    t=np.arange(N,dtype=np.float32)/SR
    swell=(.5+.5*np.sin(2*np.pi*t/8.7+ch*.4))**2
    music[:,ch]+=surf*(.003+.008*swell)

dialogue=np.zeros((N,2),np.float32)
duck=np.ones(N,np.float32)
manifest=json.loads(Path('public/audio/manifest.json').read_text())
overlaps=[]
for idx,line in enumerate(manifest):
    path='public/'+line['file']
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',path,'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar',str(SR),'-ac','1','-f','f32le','-'])
    a=np.frombuffer(raw,dtype='<f4').copy()
    start=round(line['at']*SR); end=min(N,start+len(a));a=a[:end-start]
    fade=min(320,len(a)//4);a[:fade]*=np.linspace(0,1,fade);a[-fade:]*=np.linspace(1,0,fade)
    dialogue[start:end,0]+=a*.7071;dialogue[start:end,1]+=a*.7071
    ds=max(0,start-int(.25*SR)); de=min(N,end+int(.4*SR));duck[ds:de]=np.minimum(duck[ds:de],.28)
    if idx and line['at']<manifest[idx-1]['at']+manifest[idx-1]['duration']:
        overlaps.append([manifest[idx-1]['id'],line['id']])

# Smooth the music duck envelope without introducing phase into speech.
duck=smooth(duck,int(SR*.25))
fade=np.minimum(np.arange(N)/(SR*1.8),(N-1-np.arange(N))/(SR*3.0)).clip(0,1).astype(np.float32)
music*=fade[:,None]
mix=music*duck[:,None]+dialogue
peak=float(np.max(np.abs(mix)))
if peak>.93:mix*=.93/peak
for name,data in [('score',music),('dialogue',dialogue),('soundtrack',mix)]:
    with wave.open(f'public/audio/{name}.wav','wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((np.clip(data,-1,1)*32767).astype('<i2').tobytes())
Path('output/audio-qc.json').write_text(json.dumps({'seconds':LENGTH,'sampleRate':SR,'originalScore':True,'dialogueLines':len(manifest),'overlaps':overlaps,'preLimitPeak':peak},indent=2))
print('Audio prepared:',LENGTH,'seconds,',len(manifest),'lines, overlaps:',overlaps)

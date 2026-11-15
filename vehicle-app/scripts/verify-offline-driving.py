#!/usr/bin/env python3
"""Drive a dedicated Pleos AVD through the official Console and run offline UI instrumentation.
Never use on an AVD with a live trip. Restores P/0 and closes its Console session.
"""
from pathlib import Path
import argparse,json,subprocess,threading,time,urllib.request,tarfile,io,re,shutil,os
p=argparse.ArgumentParser();p.add_argument('--serial',required=True);p.add_argument('--console-port',type=int,default=18088);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
adb=shutil.which('adb') or str(Path(os.environ.get('ANDROID_HOME', '~/Library/Android/sdk')).expanduser() / 'platform-tools/adb')
pkg='com.waymate.app.demo'
def command(*args,check=True):
    return subprocess.run([adb,'-s',a.serial,*args],check=check,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
base=f'http://127.0.0.1:{a.console_port}';client='durumit-offline-driving-verification'
def console(path,method='GET'):
    with urllib.request.urlopen(urllib.request.Request(base+path,method=method),timeout=5) as r:
        body=r.read();return json.loads(body) if body else {}
def park():
    console('/vehicle/controls?speed=0&accelerator=0&brake=0','PUT');console('/vehicle/gear?gear=Park','PUT')
stop=threading.Event()
def heartbeat():
    while not stop.wait(.8):
        try: console('/browser/session?client='+client,'POST')
        except Exception: pass
trace=[];log=None;proc=None
try:
    command('forward',f'tcp:{a.console_port}','tcp:8088')
    console('/browser/session?client='+client,'POST')
    worker=threading.Thread(target=heartbeat,daemon=True);worker.start()
    for _ in range(30):
        if console('/vehicle/state')['controls']['dds_ready']['all']: break
        time.sleep(.3)
    else: raise RuntimeError('Console DDS not ready')
    park()
    command('shell','run-as',pkg,'--user','10','rm','-f','files/driving-control.txt','files/driving-ack.txt',check=False)
    log=(a.output/'instrumentation.log').open('wb')
    proc=subprocess.Popen([adb,'-s',a.serial,'shell','am','instrument','--user','10','-w','-e','class',
        'com.waymate.app.demo.OfflineDrivingTransitionTest',pkg+'.test/androidx.test.runner.AndroidJUnitRunner'],stdout=log,stderr=subprocess.STDOUT)
    previous='';deadline=time.monotonic()+1200
    while proc.poll() is None:
        if time.monotonic()>deadline: raise TimeoutError('Transition suite exceeded 20 minutes')
        result=command('exec-out','run-as',pkg,'--user','10','cat','files/driving-control.txt',check=False)
        msg=result.stdout.decode().strip() if result.returncode == 0 else ''
        if re.fullmatch(r'\d+:(drive|idle|park|done)', msg) and msg!=previous:
            previous=msg;seq,mode=msg.split(':',1)
            if mode=='drive':
                console('/vehicle/gear?gear=Drive','PUT');console('/vehicle/controls?speed=36&accelerator=0&brake=0','PUT')
            elif mode=='idle':
                console('/vehicle/gear?gear=Drive','PUT');console('/vehicle/controls?speed=0&accelerator=0&brake=0','PUT')
            elif mode=='park': park()
            elif mode=='done': continue
            else: raise ValueError(msg)
            time.sleep(.25)
            ux=command('shell','dumpsys','car_service','--services','CarUxRestrictionsManagerService').stdout.decode()
            line=next((v.strip() for v in ux.splitlines() if 'Display id: 0 UXR:' in v),'')
            trace.append(dict(sequence=int(seq),command=mode,vehicle=console('/vehicle/state'),ux=line))
            command('shell', f"run-as {pkg} --user 10 sh -c 'echo {seq}:{mode} > files/driving-ack.txt'")
            (a.output/'console-transitions.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
            if int(seq)%10==0: print(f'Vehicle step {seq}: {mode}, {line}',flush=True)
        time.sleep(.2)
    log.close();log=None
    output=(a.output/'instrumentation.log').read_text()
    print(output[-3000:])
    archive=command('exec-out','run-as',pkg,'--user','10','tar','cf','-','files/offline-proof').stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar: tar.extractall(a.output,filter='data')
    command('logcat','-d','-s','WayMateAudio:I','AndroidRuntime:E').stdout and (a.output/'audio-logcat.txt').write_bytes(command('logcat','-d','-s','WayMateAudio:I','AndroidRuntime:E').stdout)
    if not re.search(r'OK \(\d+ tests?\)', output): raise RuntimeError('Device suite failed; see instrumentation.log')
finally:
    try: park()
    finally:
        stop.set()
        try: console('/browser/session?client='+client+'&closing=1','POST')
        except Exception: pass
        if log: log.close()
        if proc and proc.poll() is None: proc.terminate()

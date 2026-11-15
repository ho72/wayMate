import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {elevenLabsFromEnvironment} from '../../shared/server/elevenlabs.mjs';

// Director-authored fictional lines. No chat completion or live agent response.
export const lines = [
  {id:'01-opening',at:1.3,role:'내레이션',voice:'default',text:'바다부터 보고, 커피 한 잔.'},
  {id:'02-preference',at:7.1,role:'파도',voice:'default',text:'바다 보면서 멍때리다가, 카페 가는 게 좋아.'},
  {id:'03-duru',at:11.6,role:'두루',voice:'dragon',text:'좋아. 이 소개로 시작해 볼까?'},
  {id:'04-match',at:15.6,role:'두루',voice:'dragon',text:'솔바람도 바다랑 조용한 카페를 좋아해. 강릉에서 시간이 겹쳐.'},
  {id:'05-handoff',at:24.0,role:'두루',voice:'dragon',text:'왔네! 준비해 둔 여행을 이어가자.'},
  {id:'06-question',at:29.7,role:'파도',voice:'default',text:'솔바람은 여행할 때 뭘 제일 좋아해?'},
  {id:'07-rumit',at:33.3,role:'솔바람의 루밋',voice:'bear',text:'천천히 가도 괜찮죠. 솔바람은 바다를 먼저 보고, 커피 마시는 걸 좋아해요.'},
  {id:'08-symmetric',at:40.0,role:'두루',voice:'dragon',text:'파도도 바다 보며 쉬는 시간과 커피 한 잔을 좋아해요.'},
  {id:'09-meeting',at:45.0,role:'두루',voice:'dragon',text:'두 사람 경로에서 들르기 쉬운 카페가 있어. 바다쉼표 카페에서, 20분 정도 만나 볼래?'},
  {id:'10-approval',at:59.0,role:'두루',voice:'dragon',text:'두 사람 모두 동의했어. 경유지로 추가할까? 원래 목적지는 그대로야.'},
  {id:'11-hello',at:68.1,role:'파도',voice:'default',text:'솔바람님? 반가워요.'},
  {id:'12-human',at:70.6,role:'솔바람',voice:'bear',text:'바다 보고 커피 마시는 거 좋아하신다고 들었어요. 천천히 가도 괜찮죠.'},
  {id:'13-recognize',at:76.5,role:'파도',voice:'default',text:'그 말, 캐릭터도 하던데요.'},
  {id:'14-choice',at:81.0,role:'두루',voice:'dragon',text:'이제 남은 여행은 어떻게 이어 갈까? 각자의 마음으로 골라 줘.'},
  {id:'15-walk',at:91.0,role:'솔바람',voice:'bear',text:'사진 한 장 찍고, 천천히 걸을까요?'},
  {id:'16-solo',at:96.0,role:'두루',voice:'dragon',text:'혼자여도 괜찮아. 우리, 네 속도로 가자.'},
  {id:'17-brand',at:102.0,role:'내레이션',voice:'default',text:'나를 아는 친구와, 새로운 여행의 연결. 두루밋.'},
];

await mkdir('public/audio',{recursive:true});
const provider=elevenLabsFromEnvironment();
if(!provider) throw new Error('Configured TTS required');
const maxChars=1600,total=lines.reduce((s,l)=>s+l.text.length,0);
if(total>maxChars) throw new Error('TTS hard budget exceeded');
const manifest=[];
for(const l of lines){
 const hash=createHash('sha256').update(JSON.stringify({text:l.text,voice:l.voice,model:process.env.ELEVENLABS_MODEL_ID||'eleven_multilingual_v2'})).digest('hex');
 const path=`public/audio/${l.id}.mp3`,receipt=`${path}.json`;
 let cached=false;try{cached=JSON.parse(await readFile(receipt,'utf8')).hash===hash;await access(path)}catch{cached=false}
 if(!cached){
   // Sequential, once per line; no automatic paid retry. Successful files persist.
   const audio=await provider.synthesize({text:l.text,voice:l.voice,signal:AbortSignal.timeout(45000)});
   await writeFile(path,audio);await writeFile(receipt,JSON.stringify({hash,source:'elevenlabs',text:l.text,voiceAlias:l.voice},null,2));
 }
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{encoding:'utf8'}).trim());
 manifest.push({...l,file:`audio/${l.id}.mp3`,duration});
 console.log(l.id,cached?'cached':'generated',duration.toFixed(2)+'s');
 // Checkpoint after every success, useful if a later provider call fails.
 await writeFile('public/audio/manifest.json',JSON.stringify(manifest,null,2));
}
console.log(JSON.stringify({lines:manifest.length,characters:total,lastAudioEnd:Math.max(...manifest.map(x=>x.at+x.duration))}));

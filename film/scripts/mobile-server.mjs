import {mkdir} from 'node:fs/promises';
import {startService} from '../../service/server/http.mjs';
await mkdir('.cache',{recursive:true});
const replies=[
 '바다 보면서 쉬고, 커피 한 잔. 좋아! 여행할 때는 어떤 속도가 편해?',
 '천천히 가는 여행이 좋구나. 처음 만나는 사람과는 어떤 대화가 편해?',
 '조용히, 부담 없이 이야기하고 싶구나. 내가 기억해 두면 좋을 게 또 있을까?',
 '바다 산책과 조용한 카페, 느긋한 여행. 내가 이해한 너를 정리해 봤어. 이 소개로 시작해 볼까?',
];
const agent={name:'director-script',model:'fixed-scenario-no-network',async run({onboarding,execute,onDelta}){
 const n=onboarding?.answerCount||1;
 if(n>=4)await execute('propose_preferences',{interests:['바다 산책','조용한 카페'],pace:'느긋하게',conversationStyle:'조용하고 부담 없는 대화',about:'바다를 보고 커피를 마시는 느긋한 여행을 좋아해요.'});
 const reply=replies[Math.min(n-1,3)];onDelta(reply);return {reply};
}};
const app=await startService({port:3048,origin:'http://127.0.0.1:3048',file:'.cache/mobile-film.sqlite',agent,scenarioDemo:true});
console.log('Film mobile server ready http://127.0.0.1:3048 — original web UI, fixed script, no external AI');
for(const s of ['SIGINT','SIGTERM'])process.once(s,async()=>{await app.close();process.exit(0)});

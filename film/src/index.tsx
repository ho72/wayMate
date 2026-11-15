import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Audio,Composition,Easing,Img,Loop,OffthreadVideo,Sequence,continueRender,delayRender,interpolate,registerRoot,spring,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import speech from '../public/audio/manifest.json';
import './style.css';

const FPS=30, TOTAL=108*FPS;
const C={bg:'#082c33',ink:'#f3f4e9',muted:'#a8c7c5',mint:'#b4e6d3',teal:'#0b626c',blue:'#8ec7ea',line:'rgba(185,226,218,.18)'};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const val=(f:number,a:number,b:number,x=0,y=1)=>interpolate(f,[a,b],[x,y],{...clamp,easing:Easing.bezier(.22,.8,.25,1)});
const asset=(name:string)=>staticFile('assets/'+name);
const frame=(name:string)=>staticFile('screens/'+name+'.png');
const ease=(f:number,delay=0)=>spring({fps:FPS,frame:f-delay,config:{damping:22,stiffness:100,mass:.8}});

function PathMark({size=70,color=C.mint}:{size?:number;color?:string}){
 return <svg width={size} height={size*.45} viewBox="0 0 100 45" fill="none"><path d="M9 34 C35 41 37 6 70 12 L89 12" stroke={color} strokeWidth="6" strokeLinecap="round"/><circle cx="9" cy="34" r="8" fill={color}/><circle cx="89" cy="12" r="8" fill={color}/></svg>
}
function Brand({large=false,dark=false}:{large?:boolean;dark?:boolean}){
 return <div style={{display:'flex',gap:large?22:12,alignItems:'center',color:dark?C.teal:C.ink}}><PathMark size={large?104:55} color={dark?C.teal:C.mint}/><span style={{fontSize:large?91:37,fontWeight:800,letterSpacing:large?-6:-2}}>두루밋</span></div>
}
function Backdrop({light=false}:{light?:boolean}){
 const f=useCurrentFrame();
 return <AbsoluteFill style={{background:light?'#edf2ed':C.bg,overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,background:light?'radial-gradient(ellipse at 70% 30%,#e0e8f4 0,transparent 65%)':'radial-gradient(ellipse at 72% 53%,#12474e 0%,#0b353c 42%,#08272e 100%)'}}/>
  <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position:'absolute',opacity:light?.13:.16,transform:`translateX(${Math.sin(f/180)*12}px)`}}>
   <path d="M-100 850 C250 1050 510 450 850 590 S1450 960 2000 220" stroke={light?C.teal:C.mint} strokeWidth="1" fill="none"/>
   <path d="M-100 885 C250 1085 510 485 850 625 S1450 995 2000 255" stroke={light?C.teal:C.mint} strokeWidth="1" fill="none"/>
  </svg>
 </AbsoluteFill>
}
function Chip({children,light=false,style={}}:React.PropsWithChildren<{light?:boolean;style?:React.CSSProperties}>){return <div style={{display:'inline-flex',alignItems:'center',gap:10,padding:'13px 21px',border:`1px solid ${light?'rgba(11,98,108,.2)':C.line}`,borderRadius:999,fontSize:23,fontWeight:600,color:light?C.teal:C.mint,background:light?'rgba(255,255,255,.6)':'rgba(7,38,44,.3)',...style}}>{children}</div>}
function Heading({kicker,title,body,at=0,style={}}:{kicker:string;title:React.ReactNode;body?:React.ReactNode;at?:number;style?:React.CSSProperties}){
 const f=useCurrentFrame(),p=ease(f,at);
 return <div style={{position:'absolute',left:110,top:230,width:600,opacity:val(f,at,at+16),transform:`translateY(${(1-p)*40}px)`,...style}}>
  <div style={{color:C.mint,fontSize:24,letterSpacing:2,fontWeight:600,marginBottom:30}}>{kicker}</div>
  <div style={{fontSize:76,lineHeight:1.17,letterSpacing:-4,fontWeight:700,color:C.ink,wordBreak:'keep-all'}}>{title}</div>
  {body&&<div style={{fontSize:29,lineHeight:1.65,letterSpacing:-.6,color:C.muted,marginTop:30,wordBreak:'keep-all'}}>{body}</div>}
 </div>
}
function Ring({x,y,at=0,color=C.mint}:{x:number;y:number;at?:number;color?:string}){
 const f=useCurrentFrame()-at,p=val(f,0,28);if(f<0||f>32)return null;
 return <div style={{position:'absolute',left:x-30,top:y-30,width:60,height:60,borderRadius:'50%',background:color,opacity:(1-p)*.65,transform:`scale(${.3+p*2.5})`,border:`3px solid ${color}`}}/>;
}
function Character({who='duru',size=350,speaking=false,style={}}:{who?:'duru'|'rumit';size?:number;speaking?:boolean;style?:React.CSSProperties}){
 const f=useCurrentFrame();const move=speaking?Math.sin(f*.19)*3:Math.sin(f*.047)*4;
 return <div style={{position:'relative',width:size,height:size,flexShrink:0,...style}}>
  {speaking&&<svg viewBox="0 0 500 500" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.35}}>{[0,1,2].map((i)=><ellipse key={i} cx="250" cy="285" rx={155+i*24+Math.sin(f*.15+i)*4} ry={95+i*18} fill="none" stroke={C.teal} strokeWidth={2-i*.3}/>)}</svg>}
  <Img src={asset(who+'.png')} style={{width:'100%',height:'100%',objectFit:'contain',transform:`translateY(${move}px) rotate(${Math.sin(f*.04)*.7}deg) scale(${speaking?1+Math.sin(f*.21)*.004:1})`,filter:'drop-shadow(0 18px 18px rgba(19,67,72,.08))'}}/>
 </div>
}
function Phone({children,style={},scale=1,angle=0}:{children:React.ReactNode;style?:React.CSSProperties;scale?:number;angle?:number}){
 return <div style={{position:'absolute',width:422,height:890,padding:12,borderRadius:58,background:'linear-gradient(125deg,#7d9292 0%,#172d31 12%,#080e11 55%,#718787 100%)',boxShadow:'0 45px 90px rgba(0,0,0,.32),inset 0 0 0 2px #8b9b9a',transform:`perspective(1800px) rotateY(${angle}deg) scale(${scale})`,transformOrigin:'center center',...style}}>
  <div style={{height:'100%',borderRadius:47,overflow:'hidden',position:'relative',background:'#edf4f5'}}>{children}<div style={{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',width:102,height:26,borderRadius:30,background:'#071015'}}/><div style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',width:127,height:5,borderRadius:10,background:'#1b3439',opacity:.65}}/></div>
 </div>
}
function Display({children,style={},width=1120,angle=0}:{children:React.ReactNode;style?:React.CSSProperties;width?:number;angle?:number}){
 const height=width*1210/1682;
 return <div style={{position:'absolute',width:width+24,height:height+24,padding:12,borderRadius:35,background:'linear-gradient(140deg,#889b9b 0%,#17353b 12%,#071216 75%,#78918f 100%)',boxShadow:'0 45px 110px rgba(0,0,0,.34),inset 0 0 0 1px rgba(226,244,238,.4)',transform:`perspective(1900px) rotateY(${angle}deg)`,...style}}>
   <div style={{width,height,borderRadius:25,overflow:'hidden',position:'relative',background:'#e1e9f4','--app-scale':width/1240} as React.CSSProperties}>{children}</div>
 </div>
}
function Native({name,motion=false}:{name:string;motion?:boolean}){
 return motion?<Loop durationInFrames={168}><OffthreadVideo src={staticFile('motion/'+name+'.mp4')} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/></Loop>:<Img src={frame(name)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>;
}
function AppSurface({mode='home',who='duru',speaking=false}:{mode?:string;who?:'duru'|'rumit';speaking?:boolean}){
 const f=useCurrentFrame();
 const ui:Record<string,{tag:string;title:string;body:string}>= {
 home:{tag:'연결된 여행',title:'왔네! 준비한 여행을 이어가자.',body:'강릉에서, 너다운 속도로.'},
 peer:{tag:'상대 알아가기',title:'솔바람은 어떤 여행을 좋아해?',body:'천천히 가도 괜찮죠.\n바다를 먼저 보고, 커피 한 잔.'},
 sym:{tag:'친구 소개',title:'파도도 바다를 좋아해요.',body:'바다 보며 쉬기 · 조용한 카페\n서로가 공개한 이야기로 먼저 알아가요.'},
 meet:{tag:'만남 제안',title:'바다쉼표 카페에서 만날까요?',body:'두 사람 경로에서 들르기 쉬운 곳이에요.'},
 nav:{tag:'경로 확인',title:'카페를 경유지로 추가할까요?',body:'기존 목적지는 그대로 유지해요.'},
 choice:{tag:'여행 선택',title:'남은 여행을 어떻게 이어갈까?',body:'상대의 선택은 제출 전까지 보이지 않아요.'},
 end:{tag:'함께하는 여행',title:'두 분 모두 함께를 선택했어요.',body:'해변 산책 14:35–14:55\n다음 일정은 15:20, 그대로 이어가요.'},
 solo:{tag:'나만의 여행',title:'오늘도, 네 속도로 가자.',body:'처음 말했던 바다와 커피.\n두루가 기억하고 있어요.'},
 };
 const s=ui[mode]||ui.home;
 return <div className="app-surface">
  <div className="app-header"><Brand dark/><span>정차 중</span><div className="app-tag">{s.tag}</div></div>
  <div style={{position:'absolute',left:58,top:205,width:470,display:'flex',alignItems:'center',flexDirection:'column'}}>
   <div className="app-voice"><span style={{color:speaking?'#167c79':'#446b74'}}>●</span> {who==='duru'?'두루':'루밋'} · {speaking?'말하고 있어요':'함께하고 있어요'}</div>
   <Character who={who} size={425} speaking={speaking}/>
  </div>
  <div style={{position:'absolute',left:565,right:44,top:260}}>
   <h2 style={{fontSize:39,letterSpacing:-1.5,lineHeight:1.35,margin:'0 0 16px',color:'#233e50'}}>{s.title}</h2>
   <div style={{fontSize:26,lineHeight:1.6,color:'#587086',whiteSpace:'pre-line'}}>{s.body}</div>
   <div className="app-card" style={{marginTop:28}}>
    {mode==='home'?<><div className="app-small">내가 준비한 여행</div><b style={{fontSize:31}}>강릉 · 바다부터 보고, 커피 한 잔</b><div className="app-small" style={{marginTop:12}}>공통 가능 시간 14:00–15:00 · 솔바람과 연결됨</div></>:
    mode==='peer'?<><div className="app-small">솔바람의 루밋 · 공개 프로필 기반</div><div style={{fontSize:28,lineHeight:1.55,marginTop:10}}>“천천히 가도 괜찮죠.”</div></>:
    mode==='sym'?<><div className="app-small">파도가 공개를 승인한 소개</div><div style={{fontSize:30,marginTop:10}}>바다 산책 · 카페 · 느긋한 여행</div></>:
    mode==='meet'?<><div style={{fontSize:32,fontWeight:700}}>14:15–14:35 <span style={{fontWeight:400,fontSize:24}}>· 20분의 만남</span></div><div className="app-small" style={{marginTop:14}}>추가 주행 7분 · 다음 일정 15:20 유지</div></>:
    mode==='nav'?<><div className="app-small">내비 모의 화면 · 시연 장소</div><div style={{fontSize:31,fontWeight:650,marginTop:8}}>기존 경로 + 바다쉼표 카페</div><div className="app-small" style={{marginTop:12}}>두 사람의 만남 동의 후, 운전자가 따로 승인해요.</div></>:
    mode==='choice'?<><div style={{fontSize:28,display:'flex',justifyContent:'space-between',paddingBottom:18,borderBottom:'1px solid #d1dedf'}}>함께 여행 이어가기 <span>○</span></div><div style={{fontSize:28,display:'flex',justifyContent:'space-between',paddingTop:18}}>내 캐릭터와 여행 이어가기 <span>○</span></div></>:
    <><div style={{fontSize:31,fontWeight:650}}>다음 일정 · 15:20</div><div className="app-small" style={{marginTop:10}}>기존 개인 방문지 · 내 일정은 그대로</div></>}
   </div>
   <div className="app-button" style={{marginTop:22}}>{mode==='home'?'상대 캐릭터와 이야기하기':mode==='meet'?'이 장소·시간 제안하기':mode==='nav'?'카페 경유지 추가 승인':mode==='choice'?'선택 제출하기':'다음 이야기'}</div>
  </div>
 </div>;
}

function RouteMap({progress=1,approval=false,style={}}:{progress?:number;approval?:boolean;style?:React.CSSProperties}){
 const f=useCurrentFrame();
 return <div style={{width:900,height:610,borderRadius:36,overflow:'hidden',background:'#e8eee7',position:'relative',...style}}>
  <svg width="100%" height="100%" viewBox="0 0 900 610" fill="none">
   <rect width="900" height="610" fill="#e8eee7"/>
   <path d="M610 -30 C540 60 680 120 608 225 S680 410 600 480 S640 580 604 640 H940 V-30Z" fill="#b8d9da"/>
   <path d="M610 -30 C540 60 680 120 608 225 S680 410 600 480 S640 580 604 640" stroke="#f6f4df" strokeWidth="18"/>
   {[0,1,2,3,4].map(i=><path key={i} d={`M${80+i*108} -20 Q${180+i*80} 200 ${100+i*101} 330 T${145+i*93} 650`} stroke="#fff" strokeWidth="12" opacity=".8"/>)}
   {[0,1,2,3].map(i=><path key={i} d={`M-20 ${80+i*140} Q250 ${40+i*140} 600 ${120+i*120}`} stroke="#fff" strokeWidth="10" opacity=".8"/>)}
   <path d="M120 490 C210 440 170 310 300 295 S400 200 480 130" stroke="#84aaba" strokeWidth="10" strokeLinecap="round" strokeDasharray="14 16"/>
   <path d="M470 530 C450 420 540 395 480 320 S450 220 480 130" stroke="#8cba96" strokeWidth="10" strokeLinecap="round" strokeDasharray="14 16"/>
   <path d="M120 490 C210 440 200 320 340 305 S520 370 535 280 C545 220 500 175 480 130" stroke={C.teal} strokeWidth="12" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress}/>
   <circle cx="120" cy="490" r="18" fill={C.blue} stroke="white" strokeWidth="6"/>
   <circle cx="470" cy="530" r="18" fill="#9fbe85" stroke="white" strokeWidth="6"/>
   <circle cx="480" cy="130" r="13" fill={C.teal} stroke="white" strokeWidth="5"/>
   <g style={{opacity:progress,transform:`translateY(${(1-progress)*-35}px)`}}><circle cx="535" cy="280" r="29" fill={C.teal} stroke="white" strokeWidth="5"/><path d="M523 277h18v9a8 8 0 01-18 0v-9m18 1h3a5 5 0 010 10h-3" stroke="white" strokeWidth="3"/><path d="M522 293h23" stroke="white" strokeWidth="3" strokeLinecap="round"/></g>
   <text x="680" y="300" fill="#5e8b92" fontSize="26" fontFamily="Pretendard">강릉 앞바다</text>
   <text x="440" y="90" fill="#385b61" fontSize="24" fontFamily="Pretendard">기존 목적지</text>
   <text x="73" y="547" fill="#385b61" fontSize="25" fontFamily="Pretendard">파도</text>
   <text x="425" y="588" fill="#385b61" fontSize="25" fontFamily="Pretendard">솔바람</text>
  </svg>
  <div style={{position:'absolute',left:45,top:35,color:'#57777b',fontSize:19,letterSpacing:1}}>가상 장소 · 내비 모의 화면</div>
  {progress>.55&&<div style={{position:'absolute',left:415,top:335,background:'white',color:C.teal,padding:'16px 23px',borderRadius:20,boxShadow:'0 10px 24px #234c4c16',fontSize:25,fontWeight:650,opacity:val(progress,.55,.85)}}>바다쉼표 카페</div>}
 </div>;
}

function Opening(){const f=useCurrentFrame();return <AbsoluteFill>
 <Img src={asset('beach.png')} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.08-val(f,0,180)*.04})`,objectPosition:'center'}}/>
 <AbsoluteFill style={{background:'linear-gradient(90deg,rgba(5,35,42,.88),rgba(5,35,42,.49) 53%,rgba(5,35,42,.06))'}}/>
 <div style={{position:'absolute',left:110,top:260}}>
  <div style={{fontSize:25,color:C.mint,letterSpacing:3,opacity:val(f,3,22)}}>나를 아는 친구, 여행의 새로운 연결</div>
  <div style={{marginTop:35,fontSize:112,lineHeight:1.12,letterSpacing:-6,fontWeight:700,color:C.ink}}>
   {['바다부터 보고,','커피 한 잔.'].map((s,i)=><div key={s} style={{overflow:'hidden'}}><div style={{transform:`translateY(${(1-ease(f,12+i*13))*130}px)`}}>{s}</div></div>)}
  </div>
  <div style={{marginTop:42,opacity:val(f,70,95)}}><Chip>두루밋 · Pleos 서비스 아이디어 제안</Chip></div>
 </div>
 <div style={{position:'absolute',left:110,bottom:128,fontSize:22,color:'#dfebe3',opacity:val(f,100,125)}}>앱 서비스 아이디어 제안 · 콘셉트 목업 시연</div>
 </AbsoluteFill>}

function Mobile(){const f=useCurrentFrame();return <AbsoluteFill><Backdrop/>
 <Heading kicker="여행 전 · 모바일" title={<>좋아하는 걸 말하면,<br/>여행이 시작돼요.</>} body={<>내 친구 두루에게 건넨 한마디.<br/>내가 확인한 취향만 소개로 이어져요.</>}/>
 <Phone scale={.92} angle={val(f,0,80,-8,-2)} style={{left:1090,top:110,transform:`perspective(1800px) rotateY(${val(f,0,80,-8,-2)}deg) scale(.92) translateY(${(1-ease(f))*80}px)`}}>
  <Img src={frame('mobile-chat-capture')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/>
 </Phone>
 <div style={{position:'absolute',left:820,top:480,width:505,padding:'27px 32px',borderRadius:'28px 28px 8px 28px',background:C.mint,color:'#184d54',fontSize:30,lineHeight:1.5,fontWeight:600,boxShadow:'0 24px 50px #00171f33',opacity:val(f,28,45),transform:`translateX(${(1-ease(f,26))*70}px)`}}>바다 보면서 멍때리다가<br/>카페 가는 게 좋아 ㅋㅋ</div>
 <div style={{position:'absolute',left:110,top:685,display:'flex',gap:13}}>{['바다 산책','조용한 카페','느긋한 여행'].map((s,i)=><div key={s} style={{opacity:val(f,95+i*12,110+i*12),transform:`translateY(${(1-ease(f,95+i*12))*20}px)`}}><Chip>{s}</Chip></div>)}</div>
 </AbsoluteFill>}

function Match(){const f=useCurrentFrame();return <AbsoluteFill><Backdrop/>
 <Heading kicker="연결도, 내 속도에 맞게" title={<>취향도, 시간도<br/>잘 맞는 여행자.</>} body={<>같은 강릉, 비슷한 여행의 속도.<br/>모바일에서 대화 연결을 마쳐요.</>} style={{top:220,width:630}}/>
 <Phone scale={.86} style={{left:1160,top:80}}>
  <div style={{padding:'65px 26px 25px',height:'100%',background:'linear-gradient(#e2eafa,#e5f0eb)',color:'#264957'}}>
   <Brand dark/><p style={{fontSize:17,marginTop:28,color:'#657b88'}}>강릉 해변권 · 11월 14일</p><h2 style={{fontSize:31,letterSpacing:-1,lineHeight:1.25}}>이번 여행에서<br/>이야기 나눠 볼까요?</h2>
   <div style={{background:'#ffffffc9',borderRadius:25,padding:23,textAlign:'center',marginTop:20}}><Character who="rumit" size={210} style={{margin:'0 auto'}}/><div style={{fontSize:29,fontWeight:700}}>솔바람</div><p style={{fontSize:18,lineHeight:1.6}}>바다 산책 · 조용한 카페<br/>“천천히 가도 괜찮죠.”</p></div>
   <div style={{marginTop:20,background:'#fff9',borderRadius:18,padding:'18px 16px',fontSize:20}}>공통 가능 시간 <b>14:00–15:00</b></div>
   <div style={{marginTop:18,padding:19,borderRadius:18,background:C.teal,color:'white',textAlign:'center',fontSize:20,fontWeight:650}}>{f>105?'✓ 대화 연결 완료':'대화 연결 요청하기'}</div>
  </div>
 </Phone>
 <div style={{position:'absolute',left:800,top:460,padding:'28px 34px',borderRadius:25,background:'#f0f5ee',color:C.teal,boxShadow:'0 25px 60px #001b2340',opacity:val(f,48,64),transform:`translateY(${(1-ease(f,48))*40}px)`}}><div style={{fontSize:21,marginBottom:10,color:'#64868a'}}>두 사람이 겹치는 시간</div><b style={{fontSize:55,letterSpacing:-2}}>14:00–15:00</b><div style={{fontSize:22,marginTop:13}}>서로 수락하고, 공통 시간 확인</div></div>
 </AbsoluteFill>}

function Handoff(){const f=useCurrentFrame(),p=val(f,0,110),travel=val(f,25,105);return <AbsoluteFill><Backdrop/>
 <div style={{position:'absolute',top:135,left:110,fontSize:64,fontWeight:700,letterSpacing:-3,color:C.ink,opacity:val(f,0,18)}}>준비한 여행이, 차 안으로.</div>
 <svg width="1920" height="1080" style={{position:'absolute',inset:0}}><path d="M460 650 C700 650 680 490 950 490" fill="none" stroke={C.mint} strokeWidth="3" strokeDasharray="8 12" opacity={val(f,20,50)}/><circle cx={460+travel*490} cy={650-travel*160} r="10" fill={C.mint} opacity={val(f,20,35)*(1-val(f,95,110))}/></svg>
 <Phone scale={.68} style={{left:80,top:250,opacity:1-val(f,125,175,0,.6),transform:`scale(.68) translateX(${val(f,0,100,0,-30)}px)`}}><Img src={frame('mobile-summary-capture')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></Phone>
 <Display width={1130} angle={val(f,30,120,-9,0)} style={{left:690,top:245,opacity:val(f,30,60),transform:`perspective(1800px) rotateY(${val(f,30,120,-9,0)}deg) translateX(${(1-ease(f,30))*200}px)`}}>
  {f<140?<AppSurface mode="home"/>:<Native name="home"/>}
 </Display>
 <div style={{position:'absolute',left:865,top:210,opacity:val(f,85,105)}}><Chip>Pleos · 내 여행 불러오기</Chip></div>
 <div style={{position:'absolute',left:500,top:530,width:390,padding:25,borderRadius:23,background:C.mint,color:C.teal,boxShadow:'0 20px 60px #001a2640',opacity:val(f,30,45)*(1-val(f,100,125)),transform:`translate(${travel*230}px,${-travel*80}px) scale(${1-travel*.2})`}}><b style={{fontSize:27}}>강릉 · 나의 여행</b><p style={{margin:'12px 0 0',fontSize:21}}>바다 · 카페 · 느긋하게</p></div>
 </AbsoluteFill>}

function Peer(){const f=useCurrentFrame();return <AbsoluteFill><Backdrop/>
 {f<315?<>
  <Heading kicker="Pleos · 먼저 알아가는 시간" title={<>사람을 만나기 전,<br/>캐릭터와 먼저.</>} body={<>솔바람이 공개한 여행 취향을<br/>그의 루밋에게 물어봐요.</>} style={{top:230,width:620}}/>
  <Display width={1085} style={{left:740,top:165,transform:`perspective(2000px) rotateY(${val(f,0,90,-5,0)}deg) scale(${val(f,0,230,.96,1.02)})`}}>
   {f<65?<Native name="intro"/>:f<185?<Native name="rumit-speaking" motion/>:<AppSurface mode="peer" who="rumit" speaking/>}
  </Display>
  <div style={{position:'absolute',left:110,top:680,fontSize:36,lineHeight:1.6,color:C.mint,opacity:val(f,130,160)}}>“천천히 가도 괜찮죠.”</div>
 </>:<>
  <div style={{position:'absolute',left:110,top:145,fontSize:59,lineHeight:1.25,letterSpacing:-2.5,color:C.ink,fontWeight:650}}>서로의 차 안에서,<br/>먼저 전해지는 소개.</div>
  <Display width={800} style={{left:105,top:330,transform:`translateY(${(1-ease(f,310))*30}px)`}}><AppSurface mode="peer" who="rumit" speaking/></Display>
  <Display width={800} style={{left:1010,top:330,transform:`translateY(${(1-ease(f,322))*30}px)`}}><AppSurface mode="sym" who="duru" speaking/></Display>
  <div style={{position:'absolute',left:117,top:270,color:C.muted,fontSize:25}}>파도의 Pleos · 솔바람의 루밋</div><div style={{position:'absolute',left:1022,top:270,color:C.muted,fontSize:25}}>솔바람의 Pleos · 파도의 두루</div>
  <div style={{position:'absolute',left:895,top:576,transform:`scale(${ease(f,326)})`}}><PathMark size={100}/></div>
 </>}
 </AbsoluteFill>}

function Meeting(){const f=useCurrentFrame(),p=val(f,25,145);return <AbsoluteFill><Backdrop/>
 <Heading kicker="Pleos · 경로에서 찾은 작은 만남" title={<>두 경로 사이,<br/>20분의 약속.</>} body={<>공통 가능 시간 14:00–15:00 안에서<br/>잠깐 만나고, 원래 일정은 그대로.</>} style={{top:185,width:650}}/>
 <RouteMap progress={p} style={{position:'absolute',left:850,top:210,transform:`perspective(1500px) rotateY(${val(f,0,170,-6,0)}deg)`,boxShadow:'0 35px 70px #001c2345'}}/>
 <div style={{position:'absolute',left:110,top:650,width:650,display:'flex',gap:20,alignItems:'center',opacity:val(f,110,140)}}>
  <div style={{padding:'23px 28px',border:'1px solid #90c7bf44',borderRadius:24}}><div style={{fontSize:22,color:C.muted}}>바다쉼표 카페</div><div style={{fontSize:49,fontWeight:650,color:C.ink,marginTop:10,letterSpacing:-2}}>14:15–14:35</div></div>
  <Chip>20분</Chip>
 </div>
 <div style={{position:'absolute',left:910,top:760,display:'flex',gap:14,opacity:val(f,225,245)}}><Chip style={{background:C.mint,color:C.teal}}>✓ 파도 동의</Chip><Chip style={{background:C.mint,color:C.teal,opacity:val(f,255,275)}}>✓ 솔바람 동의</Chip></div>
 <div style={{position:'absolute',left:1170,top:130,opacity:val(f,300,320)}}><Chip>만남 확정</Chip></div>
 <div style={{position:'absolute',left:110,top:820,color:C.muted,fontSize:24,opacity:val(f,170,190)}}>추가 주행 7분 · 다음 일정 15:20 유지</div>
 </AbsoluteFill>}

function Navigation(){const f=useCurrentFrame();return <AbsoluteFill><Backdrop/>
 <Heading kicker="Pleos · 마지막 결정은 운전자에게" title={<>만남 동의와<br/>내비 승인은 따로.</>} body={<>주차 상태에서 직접 확인하고 승인.<br/>기존 목적지 사이에 카페만 추가해요.</>} style={{top:205,width:640}}/>
 <Display width={1060} style={{left:760,top:170}}>{f<130?<Native name="navigation-mock"/>:<AppSurface mode="nav"/>}
  {f>74&&f<180&&<div style={{position:'absolute',left:345,top:355,background:'#f8fbf4',color:C.teal,padding:'25px 40px',borderRadius:22,fontSize:28,fontWeight:650,boxShadow:'0 15px 45px #123b3b33',opacity:val(f,74,90)}}>카페 경유지 추가 승인 <span style={{marginLeft:20}}>✓</span></div>}
  <Ring x={580} y={390} at={95} color="#a6e2cc"/>
 </Display>
 <div style={{position:'absolute',left:870,top:360,opacity:val(f,165,185),transform:`translateY(${(1-ease(f,165))*30}px)`}}><RouteMap progress={val(f,170,220)} style={{width:870,height:505,boxShadow:'0 25px 55px #001e2e33'}}/></div>
 <div style={{position:'absolute',left:110,top:715,opacity:val(f,190,210)}}><Chip>✓ 카페 반영 확인 · 기존 목적지 유지</Chip></div>
 </AbsoluteFill>}

function Cafe(){const f=useCurrentFrame();return <AbsoluteFill>
 <Img src={asset('cafe.png')} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${val(f,0,390,1.03,1.105)})`,objectPosition:'34% center'}}/>
 <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(3,26,31,.28),transparent 40%,rgba(3,26,31,.54))'}}/>
 <div style={{position:'absolute',left:110,top:155,color:'#f9f3df',fontSize:24,letterSpacing:2,opacity:val(f,0,20)}}>14:15 · 바다쉼표 카페 · 시나리오 재연</div>
 <div style={{position:'absolute',right:110,top:240,width:750,fontSize:76,lineHeight:1.25,fontWeight:650,letterSpacing:-3,color:'#fffaf0',textShadow:'0 5px 35px #15383360',opacity:val(f,105,140),transform:`translateY(${(1-ease(f,105))*25}px)`}}>먼저 들었던 말이,<br/>인사가 되는 순간.</div>
 <div style={{position:'absolute',right:125,top:495,width:680,color:'#fffaf0',fontSize:42,letterSpacing:-1.5,opacity:val(f,155,175)}}>“천천히 가도 괜찮죠.”</div>
 </AbsoluteFill>}

function Choice(){const f=useCurrentFrame(),submitted=f>135,revealed=f>225;return <AbsoluteFill><Backdrop/>
 <div style={{position:'absolute',left:110,top:145}}><div style={{fontSize:24,letterSpacing:2,color:C.mint}}>Pleos · 14:35, 다음 여행의 선택</div><div style={{marginTop:18,fontSize:65,fontWeight:650,letterSpacing:-3,color:C.ink}}>서로의 마음은, 각자의 선택으로.</div></div>
 {[0,1].map((n)=><div key={n} style={{position:'absolute',left:n?1015:105,top:330,width:795,height:480,borderRadius:32,background:'linear-gradient(140deg,#e1e9f7,#e1eee6)',padding:35,boxShadow:'0 30px 70px #001b2235',transform:`translateY(${(1-ease(f,n*8))*30}px)`}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',color:C.teal,fontSize:25,fontWeight:650}}><span>{n?'솔바람의 Pleos':'파도의 Pleos'}</span><span style={{fontSize:20}}>정차 중</span></div>
  <div style={{display:'flex',gap:15,alignItems:'center',marginTop:25}}><Character who={n?'rumit':'duru'} size={245}/><div style={{flex:1,color:'#26434b'}}><div style={{fontSize:31,fontWeight:650,marginBottom:24}}>남은 여행은 어떻게?</div>
   {submitted?<div style={{padding:'31px 20px',borderRadius:20,background:'#fff9',fontSize:27,textAlign:'center',color:C.teal}}>{revealed?'✓ 둘 다 함께를 선택했어요':'✓ 선택 제출 완료'}<div style={{fontSize:19,marginTop:12,color:'#638188'}}>{revealed?'이제, 함께 해변 산책':'상대 선택은 결과 확정까지 비공개'}</div></div>:<><div className="choice-option">함께 여행 이어가기 <span>○</span></div><div className="choice-option">내 캐릭터와 이어가기 <span>○</span></div></>}
  </div></div>
  {!submitted&&<div style={{position:'absolute',bottom:35,left:315,right:35,background:C.teal,color:'white',fontSize:23,padding:20,textAlign:'center',borderRadius:18}}>선택 제출하기</div>}
  <Ring x={565} y={401} at={n?125:105}/>
 </div>)}
 <div style={{position:'absolute',bottom:182,left:0,right:0,textAlign:'center',color:C.muted,fontSize:26,opacity:val(f,145,170)}}>{revealed?'양쪽 제출 후에만 결과를 함께 확인해요.':'상대의 선택을 보지 않고, 각자 제출해요.'}</div>
 </AbsoluteFill>}

function Ending(){const f=useCurrentFrame();return <AbsoluteFill>
 <Img src={asset('beach.png')} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${val(f,0,300,1.06,1.02)})`}}/>
 <AbsoluteFill style={{background:'linear-gradient(90deg,rgba(4,36,40,.75),rgba(4,36,40,.1) 80%)'}}/>
 <div style={{position:'absolute',left:110,top:235,color:C.ink,opacity:1-val(f,180,205)}}><div style={{fontSize:25,color:'#d6efdf',marginBottom:27}}>둘 다 원하면, 함께.</div><div style={{fontSize:89,fontWeight:650,lineHeight:1.22,letterSpacing:-4}}>조금 더 걷고 싶은<br/>마음이 같다면.</div><div style={{marginTop:40,fontSize:27,lineHeight:1.7,color:'#e0eee1'}}>해변 산책 14:35–14:55<br/>다음 일정 15:20, 그대로 이어가요.</div></div>
 <div style={{position:'absolute',left:95,top:210,right:95,bottom:160,borderRadius:36,overflow:'hidden',background:'#e0ebef',opacity:val(f,180,205),transform:`translateY(${(1-ease(f,180))*35}px)`,boxShadow:'0 30px 80px #001f2640'}}>
  <div style={{position:'absolute',left:60,top:80,width:850}}><div style={{color:C.teal,fontSize:24}}>각자의 여행도, 똑같이 소중하게.</div><div style={{fontSize:76,lineHeight:1.25,fontWeight:650,letterSpacing:-3,color:'#1c4950',marginTop:25}}>혼자여도,<br/>내 친구는 곁에.</div><p style={{fontSize:29,lineHeight:1.7,color:'#5a7884'}}>처음 말했던 바다와 커피를 기억하며,<br/>원래의 여행을 두루와 이어가요.</p></div>
  <Character who="duru" size={570} speaking style={{position:'absolute',right:80,top:45}}/>
 </div>
 </AbsoluteFill>}

function Outro(){const f=useCurrentFrame();return <AbsoluteFill><Backdrop/>
 <div style={{position:'absolute',left:0,right:0,top:180,display:'flex',flexDirection:'column',alignItems:'center',opacity:val(f,0,20),transform:`translateY(${(1-ease(f))*30}px)`}}>
  <div style={{display:'flex',alignItems:'center',gap:28,marginBottom:24}}><Character who="duru" size={210}/><Brand large/><Character who="rumit" size={210}/></div>
  <div style={{fontSize:62,lineHeight:1.3,letterSpacing:-2.5,fontWeight:600,color:C.ink,textAlign:'center'}}>나를 아는 친구와,<br/><span style={{color:C.mint}}>새로운 여행의 연결.</span></div>
  <div style={{marginTop:45,display:'flex',gap:16}}><Chip>모바일에서 준비하고</Chip><Chip>Pleos에서 이어지는 여행</Chip></div>
 </div>
 <div style={{position:'absolute',left:0,right:0,bottom:155,textAlign:'center',fontSize:22,color:C.muted,lineHeight:1.65,opacity:val(f,40,70)}}>앱 서비스 아이디어 제안 · 콘셉트 목업 시연<br/>대화·만남은 시나리오 재연 및 합성 음성 · 내비는 모의 화면</div>
 </AbsoluteFill>}

const scenes=[
 {id:'opening',start:0,end:6,component:Opening},
 {id:'mobile',start:6,end:15,component:Mobile},
 {id:'match',start:15,end:21,component:Match},
 {id:'handoff',start:21,end:29,component:Handoff},
 {id:'peer',start:29,end:44,component:Peer},
 {id:'meeting',start:44,end:58,component:Meeting},
 {id:'navigation',start:58,end:67,component:Navigation},
 {id:'cafe',start:67,end:80,component:Cafe},
 {id:'choice',start:80,end:90,component:Choice},
 {id:'ending',start:90,end:100,component:Ending},
 {id:'outro',start:100,end:108,component:Outro},
];
function SceneLayer({component:Component,duration,first=false,last=false}:{component:React.ComponentType;duration:number;first?:boolean;last?:boolean}){const f=useCurrentFrame();return <AbsoluteFill style={{opacity:(first?1:val(f,0,12))*(last?1:1-val(f,duration-12,duration)),overflow:'hidden'}}><Component/></AbsoluteFill>}
function Captions(){const f=useCurrentFrame(),s=f/FPS;const l=speech.find(x=>s>=x.at-.08&&s<x.at+x.duration+.28);if(!l)return null;const p=val(f,l.at*FPS-2,l.at*FPS+4);return <div style={{position:'absolute',bottom:48,left:85,right:85,display:'flex',justifyContent:'center',opacity:p}}><div style={{display:'flex',gap:19,alignItems:'center',background:'rgba(3,27,33,.9)',padding:'16px 28px',borderRadius:17,border:'1px solid rgba(222,245,232,.13)',boxShadow:'0 5px 25px #041e2530',maxWidth:1740}}><span style={{flexShrink:0,color:l.voice==='bear'?'#dce6ae':C.mint,fontSize:23,fontWeight:650}}>{l.role}</span><span style={{width:1,height:28,background:'#b9d8d344'}}/><span style={{fontSize:l.text.length>49?29:32,lineHeight:1.4,letterSpacing:-.7,color:'#f8f9ed',wordBreak:'keep-all'}}>{l.text}</span></div></div>}

function Film(){
 const f=useCurrentFrame();const [handle]=useState(()=>delayRender('Loading Korean font'));
 useEffect(()=>{document.fonts.load('600 36px Pretendard').then(()=>continueRender(handle)).catch(()=>continueRender(handle))},[handle]);
 return <AbsoluteFill style={{background:C.bg,color:C.ink,fontFamily:'Pretendard,"Apple SD Gothic Neo",sans-serif'}}>
  {scenes.map((s,i)=>{const d=Math.round((s.end-s.start)*FPS)+(i===scenes.length-1?0:12);return <Sequence key={s.id} from={s.start*FPS} durationInFrames={d}><SceneLayer component={s.component} duration={d} first={i===0} last={i===scenes.length-1}/></Sequence>})}
  <div style={{position:'absolute',top:43,left:65,right:65,display:'flex',alignItems:'center',justifyContent:'space-between',opacity:f>3015?val(f,3015,3070,1,0):1}}><Brand/><div style={{fontSize:20,color:'#e1eee2',letterSpacing:.3,padding:'10px 18px',borderRadius:999,background:'rgba(6,37,43,.53)',border:'1px solid rgba(216,237,223,.16)'}}>Pleos 서비스 제안 · 목업 시연</div></div>
  <Captions/>
  <div style={{position:'absolute',left:65,right:65,bottom:22,height:2,background:'rgba(187,225,215,.16)'}}><div style={{width:`${f/TOTAL*100}%`,height:2,background:C.mint}}/></div>
  <Audio src={staticFile('audio/soundtrack.wav')}/>
  <AbsoluteFill style={{pointerEvents:'none',background:'#061f25',opacity:1-val(f,0,20)+val(f,TOTAL-30,TOTAL)}}/>
 </AbsoluteFill>
}
function Root(){return <Composition id="DurumitFilm" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080}/>}
registerRoot(Root);

import { character } from "./client.mjs";
import { scenarioControls, scenarioOperation } from "./journey-operator.mjs";
import { DEFAULT_TRIP_ID, DEFAULT_PLAN, planBody, dateLabel, stopCount } from "../shared/travel.mjs";
import { escapeText as esc, routeMap, tripStops, tripEditor, readTripForm, adjustPlan } from "./trip-ui.js";
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#ic-${name}"></use></svg>`;
const avatar=id=>character(({"a-01":"dragon","a-02":"bear","a-03":"mocha"})[id]);
const button=(action,text,secondary=false)=>`<button type="button" class="${secondary?'outline-button':'main-button'} journey-button" data-action="journey-${action}">${text}${secondary?'':icon('chevron')}</button>`;
export const registeredJourney=()=>({id:DEFAULT_TRIP_ID,...structuredClone(DEFAULT_PLAN),note:DEFAULT_PLAN.summary});
export function createJourneyFlow({api,getUser,changed,notice,planWithAgent=()=>{},onTripSaved=()=>{}}) {
  let data=null,error='',busy=false,detail=false,mode='journey',active=false,generation=0,timer,tripId=DEFAULT_TRIP_ID,editingIntro=false,workingPlan=null,mapDay=0,introDraft=null;
  const operator=()=>mode==='journey-operator';
  const suffix=()=>'?tripId='+tripId;
  const href=(view)=>'#'+view+'/'+tripId;
  const pendingKey=()=>`waymate.service.journey-pending.${getUser()?.id}.${tripId}`;
  const pending=()=>{try{return JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{return null;}};
  async function read() {
    const epoch=generation,owner=getUser()?.id;
    const result=await api.request((operator()?'/api/journey/operator':'/api/journey')+suffix());
    if(epoch!==generation||owner!==getUser()?.id||!active)return;
    if(data?.state?.runId===result.state.runId&&data.state.version>result.state.version)return;
    const old=JSON.stringify(data);data=result;error='';if(old!==JSON.stringify(data))changed();
  }
  function envelope(type,payload,target) {const s=data.state;return {tripId,commandId:crypto.randomUUID(),runId:s.runId,runSeq:s.runSeq,expectedVersion:s.version,type,payload,target};}
  async function send(body) {
    const key=pendingKey(),epoch=generation;localStorage.setItem(key,JSON.stringify(body));
    try {const r=await api.request('/api/journey/command',body);localStorage.removeItem(key);if(epoch===generation)data=r;return r;}
    catch(e){if(e.status&&e.status<500&&e.status!==429)localStorage.removeItem(key);throw e;}
  }
  async function command(type,payload,target) {
    if(pending())throw new Error('이전 요청의 저장 결과를 먼저 확인해 주세요.');
    const b=data.state.actionBindings[type];if(!b)throw new Error('현재 상태가 바뀌었어요. 최신 여행을 다시 확인해 주세요.');
    return send(envelope(type,payload??b.payload,target??b.target));
  }
  const windowText=s=>(s.social.connection.sharedWindow||[]).join('–');
  const area=()=>data.trip.destination;
  const travelDate=s=>dateLabel(s.trip?.date||data.trip.startDate);
  function guide(text) {const c=data?.state?.profile?avatar(data.state.profile.avatarId):character(getUser()?.profile.avatar);return `<div class="journey-guide"><img src="${c.image}" alt="내 친구 ${c.name}"><p><span>${c.name}</span>${text}</p></div>`;}
  function progress(index){return `<nav class="journey-progress" aria-label="여행 준비 단계">${['여행 준비','소개 공개','새로운 연결','차에서 이어가기'].map((x,i)=>`<span class="${i===index?'current':i<index?'done':''}" ${i===index?'aria-current="step"':''}>${x}</span>`).join('')}</nav>`;}
  function facts(entries){return `<dl class="journey-facts">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;}
  function tripDetail() {
    const p=data.trip,c=character(getUser().profile.avatar),selectedDay=p.days[mapDay]||p.days[0];
    return `<div class="page journey-page"><div class="journey-trip-heading"><span class="journey-overline">내가 등록한 여행</span><h1>${esc(p.title)}</h1><p>${esc(dateLabel(p.startDate))}${p.endDate&&p.endDate!==p.startDate?' – '+esc(dateLabel(p.endDate)):''} · ${esc(p.destination)} · ${p.days.length}일</p></div>${p.days.length>1?`<div class="trip-map-days">${p.days.map((d,i)=>`<button type="button" class="text-button ${i===mapDay?'selected':''}" data-action="journey-map-day" data-day="${i}">DAY ${i+1}</button>`).join('')}</div>`:''}<figure class="journey-route-map">${routeMap({...p,days:[selectedDay]})}<figcaption><span>${icon('car')}${esc(p.destination)} · ${selectedDay.stops.length}곳의 경로</span><span>${p.days.length>1?'DAY '+selectedDay.dayNumber+' · ':''}내 여행 계획</span></figcaption></figure><section class="journey-card journey-note"><p>${esc(p.summary)}</p></section><section class="journey-card"><div class="journey-card-heading">${icon('clock')}<h2>여행 계획</h2></div>${tripStops(p)}</section><section class="journey-card journey-companion-entry"><img src="${c.image}" alt="${c.name}"><div><h2>이 여행과 겹치는 새로운 인연</h2><p>내 일정은 지키면서, 함께할 수 있는 시간을 찾아봐요.</p></div><a href="${href('journey')}" class="main-button journey-button">이 여행과 맞는 친구 찾기 ${icon('chevron')}</a></section><div class="journey-actions">${button('agent','친구와 계획 더 다듬기',true)}<a href="${href('journey-edit')}" class="text-button">여행 계획 직접 수정하기</a><a href="#trips" class="text-button">내 여행 목록으로</a></div></div>`;
  }
  function editTrip() {workingPlan??=planBody(data.trip);return `<div class="page journey-page"><div class="page-intro"><div><h1>여행 계획 다듬기</h1><p class="muted">장소와 시간, 하고 싶은 일을 내 속도에 맞춰 바꿔요.</p></div></div><section class="journey-card">${tripEditor(workingPlan,{formId:'journey-trip-form',id:tripId,version:data.trip.version,action:'journey-plan'})}</section></div>`;}
  function prepare() {
    const p=data.trip,s=data.state,c=character(getUser().profile.avatar),a=s.trip?.sourceVersion===p.version?s.trip.availability:null;
    const first=p.days[0].stops.find(x=>x.time)?.time||'13:00';
    const minutes=Number(first.slice(0,2))*60+Number(first.slice(3)),end=Math.min(minutes+120,1439);
    const endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
    return `${guide('우리 여행에 새로운 인연을 더해볼까?<br>어떤 여행을 함께 나누고 싶은지 네 말로 소개해줘.')}<form id="journey-prepare-form"><section class="journey-card"><div class="journey-card-heading">${icon('route')}<div><h2>${esc(p.title)}</h2><p>${esc(p.destination)} · ${esc(dateLabel(p.startDate))} · ${stopCount(p)}곳</p></div></div><div class="journey-availability"><label class="journey-field">잠깐 함께할 수 있는 날<input type="date" name="meetDate" required min="${p.startDate||''}" max="${p.endDate||''}" value="${esc(s.trip?.sourceVersion===p.version?s.trip.date:p.startDate||p.days[0].date||'')}"></label><label class="journey-field">가능한 시간부터<input type="time" name="start" required value="${a?.start||first}"></label><label class="journey-field">이 시간까지<input type="time" name="end" required value="${a?.end||endTime}"></label></div><p class="journey-footnote">이 시간 안에서만 새로운 연결을 찾아요. 실제 만남 장소와 시간은 나중에 따로 정해요.</p></section><section class="journey-card"><div class="journey-card-heading"><img class="journey-mini-character" src="${c.image}" alt="${c.name}"><div><h2>나를 소개하는 말</h2><p>${esc(getUser().profile.displayName)} · 내 친구 ${c.name}</p></div></div><label class="journey-field">이번 여행에서 어떤 시간을 나누고 싶나요?<textarea class="journey-intro-input" name="introduction" aria-label="나를 소개하는 말" required maxlength="300" rows="5" placeholder="바다를 천천히 걷고, 중간에 커피 한 잔 마시는 여행이 좋아요. 처음에는 부담 없이 잠깐 이야기 나누고 싶어요.">${esc(introDraft??s.profile?.introduction??'')}</textarea></label><div class="journey-intro-example"><b>이렇게 적어도 좋아요</b><p>“사진을 많이 찍기보다는 풍경을 오래 보고 싶어요. 조용히 걸으며 여행 이야기를 나눌 친구면 좋겠어요.”</p></div><p class="journey-footnote">계정의 별명과 캐릭터로 소개해요. 이 문장은 다음 화면에서 확인한 뒤 공개해요.</p></section><div class="journey-actions"><button type="submit" class="main-button journey-button">내 소개 확인하기 ${icon('chevron')}</button><a href="${href('journey-detail')}" class="text-button">여행 상세로 돌아가기</a></div></form>`;
  }
  function publicView(s) {const p=s.profile,c=avatar(p.avatarId);return `${guide('네가 직접 적은 소개야.<br>상대에게 보여줘도 괜찮은지 한 번 더 확인해줘.')}<form id="journey-public-form"><section class="journey-card"><div class="journey-person"><div class="journey-person-avatar">${esc(p.alias.slice(0,1))}</div><div><h2>${esc(p.alias)}</h2><p>내 여행 친구 ${c.name}</p></div><img src="${c.image}" alt="${c.name}"></div><p class="journey-introduction journey-introduction-preview">${esc(p.introduction)}</p><label class="journey-consent"><input type="checkbox" name="shareIntro" checked>이 소개 문장도 보여줄게요</label><p class="journey-footnote">별명과 캐릭터는 연결을 위한 기본 소개예요. 소개 문장은 선택해서 공유할 수 있어요.</p><label class="journey-consent"><input name="profileApproved" type="checkbox" required>선택한 내용으로 내 소개를 공개할게요</label>${button('edit-intro','소개 문장 수정하기',true)}</section><section class="journey-card"><h2>공유할 여행 요약</h2>${facts([['여행 지역',area()],['날짜',travelDate(s)],['가능 시간',(s.trip.availability?.start||'13:00')+'–'+(s.trip.availability?.end||'15:00')]])}<p class="journey-footnote">원문 대화와 상세 일정, 숙소 정보는 상대에게 공개하지 않아요.</p><label class="journey-consent"><input name="tripApproved" type="checkbox" required>이 여행 요약도 공유할게요</label></section><div class="journey-actions"><button type="submit" class="main-button journey-button">이 여행과 맞는 친구 찾기 ${icon('chevron')}</button>${button('private','지금은 내 친구와 여행할게요',true)}</div></form>`;}
  function peerCard(s,full=false) {return `<section class="journey-card journey-peer"><div class="journey-peer-title"><img class="journey-peer-character" src="/assets/rumit.png" alt="루밋"><div><span class="journey-overline">우리 여행과 겹치는 새로운 연결</span><h2>루밋</h2><p>설레는 여정을 함께하는 친구</p></div></div><p class="journey-introduction">서로의 여행은 지키면서, 같은 곳에서 잠깐 이야기를 나눠봐요.</p><div class="journey-chips"><span>${esc(area())}</span><span>${esc(travelDate(s))}</span></div><div class="journey-match"><span>${icon('clock')}함께 가능한 시간</span><b>${windowText(s)}</b></div><p class="journey-footnote">같은 여행 지역과 겹치는 시간으로 연결했어요. 실제 만남은 아직 정하지 않았어요.</p>${full?'<div class="journey-divider"></div><h3>먼저 편안한 대화부터</h3><p class="muted">연결 후 Pleos에서 루밋과 이야기하며 서로의 여행을 알아가요. 통화와 만남은 그때 따로 선택해요.</p>':button('detail','루밋 소개 보기')}</section>`;}
  function candidates(s) {return `${guide(detail?'루밋과 어떤 여행 이야기를 나눠볼까?<br>마음이 맞으면 편하게 연결을 요청해봐.':'우리 여행과 겹치는 친구가 있어.<br>루밋을 먼저 만나볼까?')}${peerCard(s,detail)}<div class="journey-actions">${detail?button('request','루밋에게 연결 요청')+button('list','추천 목록으로',true):''}${button('private','이번에는 내 여행만 이어갈게요',true)}</div>`;}
  function connection(s) {
    const status=s.social.connection.status;
    if(['cancelled','declined','ended'].includes(status))return `${guide('이번 연결은 여기서 마무리할게.<br>우리 여행은 계속 이어갈 수 있어.')}<section class="journey-card journey-centered"><h2>${status==='cancelled'?'연결 요청을 취소했어요':'이번에는 각자의 여행으로'}</h2><p>원래의 일정과 내 친구는 그대로예요.</p></section><div class="journey-actions">${button('private','내 친구와 Pleos로 이어가기')}</div>`;
    if(status==='requested')return `${guide('루밋에게 연결 요청을 보냈어.<br>상대도 괜찮다고 하면 다음으로 이어갈게.')}<section class="journey-card journey-centered"><div class="journey-pair"><img src="${avatar(s.profile.avatarId).image}" alt="내 친구"><span class="journey-wait">···</span><img src="/assets/rumit.png" alt="루밋"></div><span class="journey-status" role="status">루밋의 응답을 기다리고 있어요</span><h2>서로의 여행을 확인하는 중</h2><p>양쪽이 동의해야 대화가 연결돼요.<br>다른 화면에 다녀와도 괜찮아요.</p>${facts([['함께 가능한 시간',windowText(s)],['여행 지역',area()]])}${button('cancel-review','연결 요청 취소',true)}</section>`;
    if(status==='accepted')return `${guide('루밋도 함께 이야기해보고 싶대!<br>겹치는 시간이 괜찮은지 마지막으로 확인해줘.')}<section class="journey-card"><span class="journey-status">루밋이 연결 요청을 수락했어요</span><h2>서로 여유로운 시간</h2><div class="journey-time-window"><span>${travelDate(s)} · ${esc(area())}</span><strong>${windowText(s)}</strong><p>내가 정한 가능 시간 안에서 만나요.</p></div><p class="muted">서로 알아갈 수 있는 시간이에요. 실제 만남 시간이나 장소를 확정하는 단계는 아니에요.</p></section><div class="journey-actions">${button('window','이 시간대로 연결하기')}${button('cancel-review','연결 요청 취소',true)}</div>`;
    return `${guide('이제 루밋과 이야기할 준비가 됐어.<br>준비한 여행 그대로 차에서 이어가자.')}<section class="journey-card"><span class="journey-status">대화 연결 완료</span><div class="journey-pair"><img src="${avatar(s.profile.avatarId).image}" alt="내 친구"><span>${icon('check')}</span><img src="/assets/rumit.png" alt="루밋"></div><h2 class="journey-center-title">${esc(s.profile.alias)}와 루밋</h2>${facts([['함께 알아갈 시간',windowText(s)],['이어갈 곳','Pleos · 루밋과 첫 대화']])}<p class="journey-footnote">통화·만남·동행은 앞으로 각각 동의하고 결정해요.</p></section><div class="journey-actions">${button('handoff','Pleos로 이어가기')}${button('end-review','연결 마무리하기',true)}</div>`;
  }
  function transfer(s) {const received=s.handoff.acknowledged,selected=data.selected,connected=s.handoff.mode==='connected';return `${guide(received?'차에서 여행을 잘 받았어.<br>이제 Pleos에서 이야기를 이어가자.':'모바일에서 준비할 건 다 마쳤어.<br>내 친구와 일정 그대로 차에서 이어갈 수 있어.')}<section class="journey-card journey-centered"><div class="journey-transfer-icon">${icon(received?'check':'car')}</div><span class="journey-status">${received?'차량 수신 확인 완료':selected?'Pleos 전달 준비 완료':'여정 준비 완료'}</span><h2>${received?'차에서 여행을 시작했어요':'이제, 차에서 만나자'}</h2><p>${received?'휴대폰을 닫아도 여행은 이어져요.':'Pleos 두루밋에서 ‘내 여행 불러오기’를 눌러 주세요.'}</p>${facts([['나의 여행',data.trip.title],['여행 지역·날짜',area()+' · '+travelDate(s)],['함께할 AI',avatar(s.profile.avatarId).name],...(connected?[['연결된 친구','루밋'],['공통 시간',windowText(s)]]:[['여행 방식','내 친구와 나만의 여행']])])}<p class="journey-footnote">내가 저장한 여행 계획과 확인한 소개를 차량으로 전달해요. 대화 원문은 보내지 않아요.</p></section><div class="journey-actions">${!selected&&!received?button('transfer','이 여정을 Pleos로 보내기'):''}<a href="#trips" class="main-button journey-button">내 여행으로 돌아가기</a></div><p class="journey-footnote journey-centered" role="status">${received?'차량에서 같은 여행을 불러온 것을 확인했어요.':selected?'차량에서 실제로 불러오면 수신 완료로 바뀌어요.':data.demoEnabled?'전달할 여행을 확인하고 보내 주세요.':'Pleos 연결을 켠 서버에서 이어가 주세요.'}</p>`;}
  function operatorView(s) {const responses=s.social?.pendingResponses||[],names={connection:'연결 요청',call:'통화 요청',meeting:'만남 제안',message:'메시지',final:'최종 동행 선택'};return `<div class="page journey-page"><div class="page-intro"><div><h1>루밋 시연 응답</h1><p class="muted">${esc(data.trip.title)} · 이 여행의 현재 요청에만 응답해요.</p></div></div>${error?`<p role="alert">${esc(error)}</p>`:''}<section class="journey-card"><h2>현재 상태</h2><p>연결 · ${esc(s.social.connection.status)} / 차량 · ${s.vehicleActivation?'여행 시작':'불러오기 전'}</p></section>${responses.map((r,i)=>`<section class="journey-card"><h2>${names[r.kind]||r.kind}</h2><div class="journey-operator-actions">${(r.kind==='final'?['together','my_agent']:r.kind==='message'?['reply']:['accept','reject']).map(decision=>`<button class="${['reject','my_agent'].includes(decision)?'outline-button':'main-button'}" data-action="journey-respond" data-index="${i}" data-decision="${decision}">${({accept:'수락',reject:'거절',reply:'답장 보내기',together:'함께 여행',my_agent:'각자 여행'})[decision]}</button>`).join('')}</div></section>`).join('')||'<section class="journey-card"><p role="status">새 요청을 기다리고 있어요.</p></section>'}<section class="journey-card"><h2>다시 촬영하기</h2><p>기존 기록은 남겨두고 이 여행의 새 회차를 준비해요. 차량에서 이미 시작했다면 차량의 화면과 경유지도 정리해야 해요.</p>${button('reset-review','새 촬영 회차 준비',true)}</section><a class="text-button" href="${href('journey')}">모바일 여정 화면으로</a></div>`;}
  function view() {
    if(!getUser())return `<div class="page"><section class="empty-card"><h1>함께할 여행을 준비해요</h1><p>로그인하면 내 여행과 새로운 인연을 이어갈 수 있어요.</p><button class="main-button" data-action="login">로그인하기</button></section></div>`;
    if(!data)return `<div class="page journey-page"><h1>나의 여행</h1><section class="journey-card" role="status">${error?esc(error):'여행을 불러오고 있어요.'}</section>${error?button('refresh','다시 불러오기'):''}</div>`;
    if(mode==='journey-detail')return tripDetail();if(mode==='journey-edit')return editTrip();
    const s=data.state;if(operator())return operatorView(s)+scenarioControls(s);
    if(s.reset)return `<div class="page journey-page"><h1>다음 여행을 준비하고 있어요</h1><section class="journey-card"><p>${s.reset.blockedReasons.map(esc).join('<br>')}</p>${s.reset.canAcknowledge?button('reset-ack','이전 모바일 여정 정리하기'):''}</section></div>`;
    const c=s.social.connection,needsPreparation=editingIntro||!s.profile||(!c.attempted&&(!s.profile.source||s.trip?.sourceVersion!==data.trip.version)),index=needsPreparation?0:s.handoff?3:c.status!=='none'||s.publication==='published'&&s.social.tripShareApproved?2:1;
    const title=['내 속도로, 여행 준비','나를 소개하는 작은 한 걸음',c.status==='requested'?'연결을 기다리는 중':c.status==='accepted'?'함께할 시간 확인':c.status==='linked'?'루밋과 연결됐어요':'여행이 겹치는 새로운 인연','우리의 여행을 차에서도'][index];
    const content=needsPreparation?prepare():s.handoff?transfer(s):c.status!=='none'?connection(s):s.publication==='published'&&s.social.tripShareApproved?candidates(s):publicView(s);
    let p=pending();if(p&&p.runId!==s.runId&&(s.completedRunIds||[]).includes(p.runId)){localStorage.removeItem(pendingKey());p=null;}
    return `<div class="page journey-page">${progress(index)}<div class="page-intro"><div><h1>${title}</h1><p class="muted">${esc(data.trip.title)}</p></div></div>${error?`<div class="journey-error" role="alert">${esc(error)}${button('refresh','최신 상태 확인',true)}</div>`:''}${p?`<div class="journey-error" role="status">요청의 저장 결과를 다시 확인해요.${button('recover','저장 결과 확인',true)}</div>`:''}${content}</div>`;
  }
  async function work(fn,{scroll=true}={}) {if(busy)return;const epoch=generation;busy=true;error='';document.querySelectorAll('.journey-page button').forEach(el=>el.disabled=true);try{await fn();}catch(e){if(epoch===generation){error=e.message;notice(e.message);}}finally{if(epoch===generation){busy=false;changed();if(scroll)document.getElementById('main-content').scrollTop=0;}}}
  async function activate(){if(data.demoEnabled)data=await api.request('/api/journey/transfer',{tripId,runId:data.state.runId,handoffId:data.state.handoff.handoffId});}
  return {
    view,
    close(){active=false;generation++;clearInterval(timer);busy=false;},
    resume(){if(active&&!document.hidden&&!busy&&!['journey-detail','journey-edit'].includes(mode))read().catch(()=>{});},
    async open(view='journey',id=DEFAULT_TRIP_ID){clearInterval(timer);generation++;active=true;mode=view;tripId=id;data=null;error='';detail=false;editingIntro=false;workingPlan=null;mapDay=0;introDraft=null;if(!getUser())return;const epoch=generation;try{if(['journey-detail','journey-edit'].includes(mode)){const r=await api.request('/api/trips/'+tripId);if(epoch===generation)data={trip:r.trip};}else await read();}catch(e){if(epoch===generation){error=e.message;changed();}}if(!['journey-detail','journey-edit'].includes(mode))timer=setInterval(()=>{if(!document.hidden&&!busy)read().catch(()=>{});},1500);},
    input(event){if(event.target.name==='introduction'&&event.target.form?.id==='journey-prepare-form')introDraft=event.target.value;},
    change(){},
    async action(action,el){
      if(!action.startsWith('journey-'))return false;
      if(action==='journey-map-day'){mapDay=Number(el.dataset.day);changed();return true;}
      if(action==='journey-detail'||action==='journey-list'){detail=action==='journey-detail';changed();document.getElementById('main-content').scrollTop=0;return true;}
      if(action==='journey-edit-intro'){editingIntro=true;changed();document.getElementById('main-content').scrollTop=0;return true;}
      if(action.startsWith('journey-plan-')){const op=action.slice('journey-plan-'.length);if(op==='cancel'){location.hash=href('journey-detail');return true;}workingPlan=adjustPlan(readTripForm(document.getElementById('journey-trip-form'),workingPlan),op,Number(el.dataset.day),Number(el.dataset.stop));changed();return true;}
      if(['journey-cancel-review','journey-end-review','journey-reset-review'].includes(action)){const reset=action==='journey-reset-review';document.getElementById('journey-confirm-title').textContent=reset?'새 촬영 회차를 준비할까요?':action==='journey-cancel-review'?'연결 요청을 취소할까요?':'루밋과의 연결을 마무리할까요?';document.getElementById('journey-confirm-description').textContent=reset?'현재 회차의 기록을 보존해요. 차량에서 이미 시작한 여행은 차량의 정리 확인도 필요해요.':'내 여행 일정과 AI 친구는 그대로 남아요. 이번 회차에서는 새 연결 요청을 다시 만들지 않아요.';document.getElementById('journey-confirm-action').dataset.action=reset?'journey-reset':action==='journey-cancel-review'?'journey-cancel':'journey-end';document.getElementById('journey-confirm-dialog').showModal();return true;}
      await work(async()=>{
        if(action==='journey-operate'){
          const binding=scenarioOperation(data.state,el.dataset);
          if(!binding)throw new Error('현재 시연 상태를 다시 확인해 주세요.');
          const body=envelope(binding.commandType,binding.payload,binding.target),response=body.type==='B_RESPONSE';
          if(response)delete body.type;
          await api.request(response?'/api/journey/respond':'/api/journey/operate',body);await read();
        }
        if(action==='journey-refresh'){if(['journey-detail','journey-edit'].includes(mode))data={trip:(await api.request('/api/trips/'+tripId)).trip};else await read();}
        if(action==='journey-agent')await planWithAgent(tripId);
        if(action==='journey-recover'){const p=pending();if(!p)return;const r=await api.request(`/api/journey/receipts/${p.commandId}?runId=${p.runId}&tripId=${tripId}`);if(r.status==='applied'){localStorage.removeItem(pendingKey());await read();}else await send(p);}
        if(action==='journey-request')await command('CONNECT_REQUEST');
        if(action==='journey-window')await command('CONFIRM_WINDOW');
        if(['journey-cancel','journey-end'].includes(action)){document.getElementById('journey-confirm-dialog').close();await command(action==='journey-cancel'?'CONNECT_CANCEL':'CONNECT_END');}
        if(action==='journey-private'){await command('PROFILE_PRIVATE');await command('HANDOFF_PREPARE',{mode:'my_trip'});await activate();}
        if(action==='journey-handoff'){await command('HANDOFF_PREPARE',{mode:'connected'});await activate();}
        if(action==='journey-transfer')await activate();
        if(action==='journey-reset-ack'){await command('RESET_ACK');await read();}
        if(action==='journey-reset'){document.getElementById('journey-confirm-dialog').close();await api.request('/api/journey/reset',envelope('RESET_BEGIN',{}, {runId:data.state.runId}));await read();}
        if(action==='journey-respond'){const target=data.state.social.pendingResponses[Number(el.dataset.index)];const b=envelope('B_RESPONSE',{decision:el.dataset.decision},target);delete b.type;await api.request('/api/journey/respond',b);await read();}
      });return true;
    },
    async submit(event){if(!['journey-prepare-form','journey-public-form','journey-trip-form'].includes(event.target.id))return false;event.preventDefault();const form=event.target,f=new FormData(form),id=form.id;
      await work(async()=>{
        if(id==='journey-trip-form'){const p=readTripForm(form,workingPlan);const result=await api.request('/api/trips/'+tripId,{version:data.trip.version,plan:p},'PUT');onTripSaved(result);notice('여행 계획을 저장했어요.');location.hash=href('journey-detail');return;}
        if(id==='journey-prepare-form'){introDraft=f.get('introduction');data=await api.request('/api/journey/prepare',{tripId,expectedVersion:data.state.version,profileVersion:getUser().profileVersion,tripVersion:data.trip.version,introduction:introDraft,availability:{date:f.get('meetDate'),start:f.get('start'),end:f.get('end')}});editingIntro=false;}
        if(id==='journey-public-form'){if(!f.has('profileApproved')||!f.has('tripApproved'))return;await command('PROFILE_PUBLISH',{profileVersion:data.state.profileVersion,approvedFields:['alias','avatarId',...(f.has('shareIntro')?['introduction']:[])]});await command('TRIP_SHARE_CONFIRM',{tripVersion:data.state.tripVersion,approved:true});}
      });return true;
    },
  };
}

let session=null;
try{session=JSON.parse(sessionStorage.getItem('roundDemoSession')||'null');}catch{sessionStorage.removeItem('roundDemoSession');}
const invite=new URLSearchParams(location.search),inviteToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(inviteToken&&/^[A-F0-9]{6}$/.test(invite.get('room')||'')){
  session={code:invite.get('room'),token:inviteToken};sessionStorage.setItem('roundDemoSession',JSON.stringify(session));
  history.replaceState(null,'',location.pathname);
}
let snapshot=null,selected=null,moving=false,seenRecords=null,introTimer=null;
let preview=null,moveKind='normal',seenEffects=null,seenMoney=null,seenExtra=null,effectQueue=[],effectActive=false,effectTimer=null;
let bidDraft='0',bidAuctionId=null;
const animations={},animationTimers={};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=n=>new Date(n).toLocaleTimeString('zh-CN',{hour12:false});
async function api(method,path,data){
  const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json',...(session?{'x-session-token':session.token}:{})},body:data?JSON.stringify(data):undefined});
  const j=await r.json();if(!r.ok)throw Error(j.error||'请求失败');return j;
}
function fail(e){alert(e.message||String(e));}
function save(){sessionStorage.setItem('roundDemoSession',JSON.stringify(session));}
function showLobby(error=''){$('lobby').hidden=false;$('game').hidden=true;$('lobbyError').textContent=error;}
function showGame(){$('lobby').hidden=true;$('game').hidden=false;$('roomLabel').textContent=`房间 ${session.code} · ${snapshot.role==='host'?'裁判':snapshot.teamId+' 队'}`;}
async function refresh(){
  if(!session)return;
  try {const next=await api('GET',`/rooms/${session.code}`);if(!snapshot||snapshot.version!==next.version)ingest(next); $('sync').textContent='已同步 '+time(Date.now());}
  catch(e){session=null;sessionStorage.removeItem('roundDemoSession');showLobby(e.message);}
}
function ingest(next){
  if(snapshot&&snapshot.resetCount!==next.resetCount){
    selected=null;preview=null;moving=false;seenRecords=null;seenEffects=null;seenMoney=null;seenExtra=null;effectQueue=[];
    if(effectTimer)clearTimeout(effectTimer);effectTimer=null;
    $('effectIntro').classList.remove('show');effectActive=false;
    for(const id of 'ABC'){if(animationTimers[id])clearTimeout(animationTimers[id]);delete animationTimers[id];delete animations[id];}
  }
  let freshEffects=[],freshMoney=[];
  if(seenEffects===null)seenEffects=new Set(next.effects.map(e=>e.id));
  else for(const event of next.effects)if(!seenEffects.has(event.id)){seenEffects.add(event.id);freshEffects.push(event);}
  if(seenMoney===null)seenMoney=new Set(next.moneyChanges.map(e=>e.id));
  else for(const change of next.moneyChanges)if(!seenMoney.has(change.id)){seenMoney.add(change.id);freshMoney.push(change);}
  if(seenRecords===null)seenRecords=new Set(next.records.map(r=>r.id));
  else for(const record of next.records){if(!seenRecords.has(record.id)){seenRecords.add(record.id);if(Date.now()-record.time<5000&&record.route)animate(record);}}
  const extras=next.records.flatMap(r=>r.extraMoves||[]);
  if(seenExtra===null)seenExtra=new Set(extras.map(e=>e.id));
  else for(const extra of extras)if(!seenExtra.has(extra.id)){seenExtra.add(extra.id);if(Date.now()-extra.time<5000)animate(extra);}
  snapshot=next;render();
  effectQueue.push(...freshEffects);showNextEffect();showMoneyChanges(freshMoney);
  if(next.role==='team'){
    const key=`roundIntro:${next.code}:${next.teamId}:${next.resetCount}`;
    const round=next.teams[next.teamId].round;
    if(sessionStorage.getItem(key)!==String(round)){
      sessionStorage.setItem(key,String(round));showRoundIntro(round);
    }
  }
}
function showNextEffect(){
  if(effectActive||!effectQueue.length)return;
  effectActive=true;const e=effectQueue.shift(),el=$('effectIntro');
  el.innerHTML=`<div class="effectStage"><div class="effectTitle">${e.kind==='event'?'触发事件':'触发厄运'}</div><p>${esc(e.team)} 队</p><div class="effectCards">${e.cards.length?e.cards.map(c=>`<img src="${c.image}" alt="${esc(c.name)}">`).join(''):`<strong>${e.kind==='event'?'事件':'厄运'}已抵消</strong>`}</div></div>`;
  el.classList.add('show');
  effectTimer=setTimeout(()=>{el.classList.remove('show');effectActive=false;effectTimer=null;showNextEffect();},2400);
}
function showMoneyChanges(changes){
  changes.forEach((change,i)=>setTimeout(()=>{
    const score=document.querySelector(`.score[data-team="${change.team}"]`);if(!score)return;
    const el=document.createElement('span');el.className='moneyFloat '+(change.amount>0?'gain':'loss');
    el.textContent=`${change.amount>0?'+':''}${change.amount} 金钱`;el.title=change.reason;
    score.appendChild(el);setTimeout(()=>el.remove(),1700);
  },i*260));
}
function showRoundIntro(round){
  const el=$('roundIntro');if(introTimer)clearTimeout(introTimer);
  el.textContent=`第 ${round} 回合`;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  introTimer=setTimeout(()=>el.classList.remove('show'),1500);
}
function animate(record){
  const id=record.team;if(animationTimers[id])clearTimeout(animationTimers[id]);
  animations[id]={node:record.from,route:record.route,index:0};
  const step=()=>{
    const a=animations[id];if(!a)return;
    a.node=a.route[a.index++];renderMap();
    if(a.index<a.route.length)animationTimers[id]=setTimeout(step,520);
    else animationTimers[id]=setTimeout(()=>{delete animations[id];delete animationTimers[id];renderMap();renderTurnControls();},450);
  };
  animationTimers[id]=setTimeout(step,120);
}
async function action(path,data){try{const next=await api('POST',`/rooms/${session.code}/${path}`,data);ingest(next);return true;}catch(e){fail(e);return false;}}
function render(){showGame();renderScores();renderMap();renderTurnControls();renderCards();renderPreview();renderPending();renderTable();renderTestTools();renderLog();}
function renderScores(){
  $('scoreboard').innerHTML='ABC'.split('').map(id=>{const t=snapshot.teams[id];return `<div class="score" data-team="${id}"><div><b class="${id.toLowerCase()}">${id} 队</b><small>${t.joined?'已入席':'待加入'} · 第 ${t.round} 回合${t.awaitingEnd?'（待结束）':'（待移动）'} · ${esc(t.position)}<br>金钱 ${t.money} · 收入 ${t.income}${t.eventShield?` · 事件抵消 ${t.eventShield}`:''}${t.misfortuneShield?` · 厄运抵消 ${t.misfortuneShield}`:''}</small></div><strong>${t.score} <small>分</small></strong></div>`;}).join('');
  $('myRole').textContent=snapshot.role==='host'?'裁判全览':snapshot.teamId+' 队视图';
}
function renderMap(){
  const grouped={};for(const id of 'ABC'){
    const view=snapshot.mapView[id],useAnimation=snapshot.role==='host'||id===snapshot.teamId||!view.ghost;
    const p=useAnimation&&animations[id]?.node||view.node;(grouped[p]??=[]).push(id);
  }
  for(const [node,ids] of Object.entries(grouped))ids.forEach((id,i)=>{
    let el=document.getElementById('marker-'+id);
    if(!el){el=document.createElement('div');el.id='marker-'+id;el.className='marker '+id;el.textContent=id;$('markers').appendChild(el);}
    const view=snapshot.mapView[id],[x,y]=snapshot.pos[node];
    el.classList.toggle('ghost',view.ghost);el.style.left=(x/16.4+(i-ids.length/2+.5)*1.5)+'%';el.style.top=y/15.1+'%';
    el.title=view.ghost?`${id} 队当前第 ${view.actualRound} 回合 · 尚未进行本队第 ${snapshot.teams[snapshot.teamId].round} 回合 · 实时位置 ${node}`:
      snapshot.role==='team'&&id!==snapshot.teamId?`${id} 队第 ${snapshot.teams[snapshot.teamId].round} 回合位置 ${node} · 当前第 ${view.actualRound} 回合`:`${id} 队第 ${view.actualRound} 回合 · ${node}`;
  });
  const ids=snapshot.role==='host'?[...'ABC']:[...'ABC'].filter(id=>id!==snapshot.teamId);
  $('roundStatus').innerHTML=`<strong>${snapshot.role==='host'?'队伍回合':'其他队伍回合'}</strong>`+ids.map(id=>`<span>${id} 队 · 第 ${snapshot.teams[id].round} 回合${snapshot.teams[id].awaitingEnd?'（待结束）':''}</span>`).join('');
}
function renderTurnControls(){
  if(snapshot.role!=='team'){$('turnControls').innerHTML='';return;}
  const t=snapshot.teams[snapshot.teamId];
  if(!t.awaitingEnd){$('turnControls').innerHTML=`<div class="turnState">第 ${t.round} 回合 · 请选择手牌移动</div>`;return;}
  if(t.pendingChallenge){$('turnControls').innerHTML='<div class="turnState">挑战已提交 · 等待裁判判定</div>';return;}
  if(t.pendingTeleport){
    $('turnControls').innerHTML=`<div class="turnState">巧夺先机：选择传送目的地 <select id="teleportNode">${Object.keys(snapshot.graph).map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select><button id="teleportNow">传送</button></div>`;
    $('teleportNow').onclick=()=>action('teleport',{node:$('teleportNode').value});return;
  }
  if(t.pendingExtraMove){$('turnControls').innerHTML='<div class="turnState">言而无信：选择一张手牌额外移动（不触发格子与战斗）</div>';return;}
  if(!t.cardActionDone){
    const blocked=!!animations[snapshot.teamId]||!!snapshot.pendingAuction||!!snapshot.pendingMisfortuneChoice;
    $('turnControls').innerHTML=`<div class="turnState">第 ${t.round} 回合 · 可使用一张适用手牌 <button id="skipUse" ${blocked?'disabled':''}>不使用卡牌</button></div>`;
    $('skipUse').onclick=()=>action('skip-use',{});return;
  }
  const blocked=!!animations[snapshot.teamId]||!!snapshot.pendingAuction||!!snapshot.pendingMisfortuneChoice;
  $('turnControls').innerHTML=`<div class="turnState">第 ${t.round} 回合结算完成 <button id="endTurn" ${blocked?'disabled':''}>结束回合</button></div>`;
  $('endTurn').onclick=()=>action('end-turn',{});
}
function renderCards(){
  const own=snapshot.role==='team'?snapshot.teams[snapshot.teamId]:null;
  if(!own){$('cards').innerHTML='<p class="notice">裁判可查看三队牌数；各队在自己的设备上选择手牌移动。</p>';$('route').textContent='';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  if(selected&&!own.hand.some(c=>c.id===selected.id))selected=null;
  $('cards').innerHTML=own.hand.map(c=>`<div class="card ${selected?.id===c.id?'selected':''}" role="button" tabindex="0" data-card="${c.id}" title="${esc(c.name)}：${esc(c.effect)}"><img src="${c.image}" alt="${esc(c.name)}"><span class="cardBadge">${esc(c.name)} · ${c.move===7?'?':c.move} 步</span></div>`).join('')+`<p class="notice">牌库 ${own.deckCount} · 弃牌堆 ${own.discardCount} · 手牌 ${own.handCount}</p>`;
  document.querySelectorAll('[data-card]').forEach(el=>{const choose=()=>{
    if(moving)return;
    const mode=own.pendingExtraMove?'extra':!own.awaitingEnd?'move':!own.cardActionDone&&!own.pendingChallenge&&!own.pendingTeleport?'use':own.canDiscard?'discard':'view';
    preview={cardId:el.dataset.card,mode};renderPreview();
  };el.onclick=choose;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};});
  if(snapshot.pendingAuction||snapshot.pendingMisfortuneChoice){$('route').textContent='厄运结算进行中，请先完成选牌和竞标。';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  if(own.awaitingEnd&&!own.pendingExtraMove){selected=null;$('route').textContent=own.cardActionDone?'本回合已完成，可结束回合。':'选择适用手牌使用，或点击“不使用卡牌”。';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  if(!selected){$('route').textContent=own.pendingExtraMove?'选择一张手牌完成额外移动。':'点击手牌预览，选择“打出”后再选择终点。';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  const steps=selected.move===7?(own.pendingRoll?.cardId===selected.id?own.pendingRoll.value:null):selected.move;
  if(steps===null){
    $('route').textContent='问号牌：先掷一颗 d6，骰子点数就是本次移动步数。';
    $('choices').innerHTML='<button id="rollCard">掷骰决定步数</button><button id="cancelMove">取消选牌</button>';
    $('destinations').innerHTML='';
    $('rollCard').onclick=()=>action('roll',{cardId:selected.id});
    $('cancelMove').onclick=()=>{selected=null;renderCards();};return;
  }
  const options=window.routes.reachable(snapshot.graph,snapshot.house,own.position,steps);
  const counts={};for(const o of options)counts[o.node]=(counts[o.node]||0)+1;
  const seen={};
  $('route').textContent=`第 ${own.round} 回合 · ${moveKind==='extra'?'额外移动 · ':''}${steps} 步 · ${Object.keys(counts).length} 个终点、${options.length} 条路线。`;
  $('choices').innerHTML=options.map((o,i)=>`<button data-option="${i}" ${moving?'disabled':''}>${esc(o.node)} <small>经 ${esc(o.route.join(' → '))}</small></button>`).join('')+
    `<button id="cancelMove" ${moving?'disabled':''}>取消选牌</button>`;
  $('destinations').innerHTML=options.map((o,i)=>{const [x,y]=snapshot.pos[o.node],n=seen[o.node]||0;seen[o.node]=n+1;const offset=n-(counts[o.node]-1)/2;return `<button class="destination" data-option="${i}" title="路线：${esc(own.position+' → '+o.route.join(' → '))}" style="left:${x/16.4+offset*3}%;top:${y/15.1+offset*2}%" ${moving?'disabled':''}>${esc(o.node)}${counts[o.node]>1?` ${n+1}`:''}</button>`;}).join('');
  document.querySelectorAll('[data-option]').forEach(el=>el.onclick=async()=>{
    if(moving)return;moving=true;renderCards();
    const choice=options[Number(el.dataset.option)];const cardId=selected.id;
    const ok=await action(moveKind==='extra'?'extra-move':'move',{cardId,route:choice.route});moving=false;
    if(ok)selected=null;renderCards();
  });
  $('cancelMove').onclick=()=>{selected=null;renderCards();};
}
function renderPreview(){
  if(!preview||snapshot?.role!=='team'){$('cardPreview').classList.remove('show');$('cardPreview').innerHTML='';return;}
  const own=snapshot.teams[snapshot.teamId],card=own.hand.find(c=>c.id===preview.cardId);
  if(!card){preview=null;renderPreview();return;}
  const house=card.game_type==='fanshi'?'范式起源':card.game_type;
  const usable=preview.mode!=='use'||(snapshot.house.includes(own.position)&&(card.game_type==='random'||house===own.position)&&own.money>=card.cost);
  const canPlay=preview.mode!=='view'&&usable&&!snapshot.pendingAuction&&!snapshot.pendingMisfortuneChoice;
  $('cardPreview').innerHTML=`<div class="previewBody"><img src="${card.image}" alt="${esc(card.name)}"><div><h2>${esc(card.name)}</h2><p>${esc(card.effect)}</p><p>条件：${esc(card.condition)}</p><p>费用：${card.cost} 金钱 · ${preview.mode==='move'?'移动':preview.mode==='extra'?'额外移动':preview.mode==='discard'?'弃牌':'使用'}${!usable?'（房屋不匹配或金钱不足）':''}</p><div class="previewActions"><button id="playPreview" ${canPlay?'':'disabled'}>打出</button><button id="backPreview">返回</button></div></div></div>`;
  $('cardPreview').classList.add('show');
  $('backPreview').onclick=()=>{preview=null;renderPreview();};
  $('playPreview').onclick=async()=>{
    if(!canPlay)return;const {cardId,mode}=preview;preview=null;renderPreview();
    if(mode==='move'||mode==='extra'){selected=card;moveKind=mode;renderCards();return;}
    if(mode==='use')await action('use-card',{cardId});
    if(mode==='discard')await action('discard-card',{cardId});
  };
}
function renderTable(){
  $('filterNote').textContent=snapshot.role==='host'?'显示所有轮次和到达记录。':`仅显示不晚于本队当前回合（第 ${snapshot.teams[snapshot.teamId].round} 回合）且已到达的记录。`;
  const rounds=[...new Set(snapshot.records.map(r=>r.round))].sort((a,b)=>b-a);
  $('rows').innerHTML=rounds.length?rounds.map(round=>`<tr><td>第 ${round} 轮</td>${'ABC'.split('').map(id=>{const r=snapshot.records.find(x=>x.round===round&&x.team===id);return `<td>${r?`${esc(r.node)}<br><span class="muted">${time(r.time)} · 格子金钱 ${r.moneyDelta>=0?'+':''}${r.moneyDelta}</span><br><span class="muted">${esc(r.card?.name||'')}</span>${r.event?`<div class="drawnCard">${r.event.image?`<img src="${r.event.image}" alt="${esc(r.event.name)}">`:''}<span>事件：${esc(r.event.name)}${r.event.moneyDelta?` · +${r.event.moneyDelta} 金钱`:''}</span></div>`:''}${r.misfortune?`<div class="drawnCard"><img src="${r.misfortune[0].image}" alt="${esc(r.misfortune[0].name)}"><span>厄运：${esc(r.misfortune[0].name)}</span></div>`:''}`:'<span class="muted">—</span>'}</td>`;}).join('')}</tr>`).join(''):'<tr><td colspan="4" class="muted">暂无移动记录</td></tr>';
  $('battles').innerHTML=snapshot.battles.map(b=>{
    const a=snapshot.records.find(r=>r.id===b.first)?.team, c=snapshot.records.find(r=>r.id===b.second)?.team;
    return `<div class="battle ${b.status==='已结算'?'settled':''}">第 ${b.round} 轮 · ${esc(b.node)} · ${a||'?'} 对 ${c||'?'} · ${b.status}${b.winner?' · '+b.winner+' 胜':''}${snapshot.role==='host'&&b.status==='待结算'?`<div><button data-battle="${b.id}" data-winner="${a}">${a} 胜</button><button data-battle="${b.id}" data-winner="${c}">${c} 胜</button></div>`:''}</div>`;
  }).join('');
  document.querySelectorAll('[data-battle]').forEach(el=>el.onclick=()=>action('battle',{id:el.dataset.battle,winner:el.dataset.winner}));
  const challenges=snapshot.role==='host'?Object.entries(snapshot.challenges||{}).map(([id,c])=>`<div class="battle"><b>${id} 队使用「${esc(c.card.name)}」</b><p class="notice">挑战条件：${esc(c.card.condition)}</p><button data-challenge="${id}" data-success="true">挑战成功</button> <button data-challenge="${id}" data-success="false">挑战失败</button></div>`).join(''):'';
  $('hostTools').innerHTML=snapshot.role==='host'?`<h3>待判定的卡牌挑战</h3>${challenges||'<p class="notice">暂无</p>'}<h3>裁判调分</h3><div class="scoreTools">`+ 'ABC'.split('').map(id=>`<button data-score="${id}" data-value="-2">${id} −2</button><button data-score="${id}" data-value="1">${id} +1</button><button data-score="${id}" data-value="2">${id} +2</button>`).join('')+'</div>':'';
  document.querySelectorAll('[data-challenge]').forEach(el=>el.onclick=()=>action('resolve-challenge',{team:el.dataset.challenge,success:el.dataset.success==='true'}));
  document.querySelectorAll('[data-score]').forEach(el=>el.onclick=()=>action('score',{team:el.dataset.score,value:Number(el.dataset.value)}));
}
function renderPending(){
  const choice=snapshot.pendingMisfortuneChoice;
  if(choice){
    const id=snapshot.teamId;
    const cards=choice.cards.map((c,i)=>`<div class="drawnCard"><img src="${c.image}" alt="${esc(c.name)}"><span>${esc(c.name)}${id===choice.target?`<br><button data-misfortune-pick="${i}">选择这张</button>`:''}</span></div>`).join('');
    const targets=id===choice.triggerTeam&&!choice.target?`<div class="testActions">${'ABC'.split('').filter(x=>x!==id).map(x=>`<button data-misfortune-target="${x}">指定 ${x} 队选牌</button>`).join('')}</div>`:'';
    $('pendingAction').innerHTML=`<div class="battle"><b>${esc(choice.triggerTeam)} 队停在厄运 B，抽两张厄运</b><p class="notice">${choice.target?`等待 ${esc(choice.target)} 队选择一张让 ${esc(choice.triggerTeam)} 队承受`:'触发队指定另一队选牌'}</p>${cards}${targets}</div>`;
    document.querySelectorAll('[data-misfortune-target]').forEach(el=>el.onclick=()=>action('misfortune-target',{target:el.dataset.misfortuneTarget}));
    document.querySelectorAll('[data-misfortune-pick]').forEach(el=>el.onclick=()=>action('misfortune-pick',{index:Number(el.dataset.misfortunePick)}));
    return;
  }
  const auction=snapshot.pendingAuction;
  if(!auction){$('pendingAction').innerHTML='';return;}
  if(bidAuctionId!==auction.id){bidAuctionId=auction.id;bidDraft='0';}
  const id=snapshot.teamId,bid=id?auction.bids[id]:undefined;
  const focused=document.activeElement?.id==='bidAmount';
  $('pendingAction').innerHTML=`<div class="battle"><div class="drawnCard"><img src="${auction.card.image}" alt="${esc(auction.card.name)}"><span><b>厄运：${esc(auction.card.name)}</b><br>${esc(auction.card.effect)}<br>${esc(auction.triggerTeam)} 队触发 · ${'ABC'.split('').map(x=>`${x}：${auction.bids[x]===undefined?'待出价':snapshot.role==='host'?auction.bids[x]:'已提交'}`).join(' / ')}</span></div>${id&&bid===undefined?`<div class="bidForm"><input id="bidAmount" type="number" min="0" max="${snapshot.teams[id].money}" step="1" value="${esc(bidDraft)}" aria-label="竞标金额"><button id="submitBid">提交出价</button></div>`:''}</div>`;
  if($('bidAmount')){$('bidAmount').oninput=e=>{bidDraft=e.target.value;};if(focused)$('bidAmount').focus();}
  if($('submitBid'))$('submitBid').onclick=()=>action('bid',{amount:Number($('bidAmount').value)});
}
function renderTestTools(){
  if(snapshot.role!=='host'){$('testTools').innerHTML='';return;}
  const links=snapshot.testMode?'ABC'.split('').map(id=>{
    const url=`/?room=${snapshot.code}&seat=${id}#token=${encodeURIComponent(snapshot.testTokens[id])}`;
    return `<a class="testLink" href="${url}" target="_blank" rel="noopener noreferrer">打开 ${id} 队标签页 ↗</a>`;
  }).join(''):'';
  $('testTools').innerHTML=`<h3>测试工具</h3><p class="notice">初始金钱 ${snapshot.initialMoney} · 初始收入 ${snapshot.initialIncome} · 牌序种子：${snapshot.seed===null?'随机':esc(snapshot.seed)}。重置后保留房间码和四个标签页的身份。</p><div class="testActions">${links}<button id="resetRoom">重置本房间</button></div>`;
  $('resetRoom').onclick=()=>{if(confirm('重置本房间的分数、位置、牌库和战斗记录？'))action('reset',{});};
}
function renderLog(){$('log').innerHTML=snapshot.log.map(e=>`<div>${time(e.time)} · ${esc(e.message)}</div>`).join('');}
async function create(testMode){try{
  const seed=testMode?$('seed').value.trim()||'demo-01':null;
  const initialMoney=Number($('initialMoney').value),initialIncome=Number($('initialIncome').value);
  const r=await api('POST','/rooms',{seed,testMode,initialMoney,initialIncome});session=r;save();snapshot=null;seenRecords=null;await refresh();
}catch(e){$('lobbyError').textContent=e.message;}}
$('create').onclick=()=>create(false);
$('createTest').onclick=()=>create(true);
$('join').onclick=async()=>{try{const code=$('code').value.trim().toUpperCase();if(!/^[A-F0-9]{6}$/.test(code))throw Error('请输入六位房间码');const r=await api('POST',`/rooms/${code}/join`,{team:$('seat').value});session=r;save();snapshot=null;seenRecords=null;await refresh();}catch(e){$('lobbyError').textContent=e.message;}};
if(invite.get('room'))$('code').value=invite.get('room');
if('ABC'.includes(invite.get('seat')||''))$('seat').value=invite.get('seat');
if(session)refresh();else showLobby();setInterval(refresh,1000);

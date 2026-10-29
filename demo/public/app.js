let session=JSON.parse(localStorage.getItem('roundDemoSession')||'null');
let snapshot=null,selected=null,moving=false,seenRecords=null;
const animations={},animationTimers={};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=n=>new Date(n).toLocaleTimeString('zh-CN',{hour12:false});
async function api(method,path,data){
  const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json',...(session?{'x-session-token':session.token}:{})},body:data?JSON.stringify(data):undefined});
  const j=await r.json();if(!r.ok)throw Error(j.error||'请求失败');return j;
}
function fail(e){alert(e.message||String(e));}
function save(){localStorage.setItem('roundDemoSession',JSON.stringify(session));}
function showLobby(error=''){$('lobby').hidden=false;$('game').hidden=true;$('lobbyError').textContent=error;}
function showGame(){$('lobby').hidden=true;$('game').hidden=false;$('roomLabel').textContent=`房间 ${session.code} · ${snapshot.role==='host'?'裁判':snapshot.teamId+' 队'}`;}
async function refresh(){
  if(!session)return;
  try {const next=await api('GET',`/rooms/${session.code}`);if(!snapshot||snapshot.version!==next.version)ingest(next); $('sync').textContent='已同步 '+time(Date.now());}
  catch(e){session=null;localStorage.removeItem('roundDemoSession');showLobby(e.message);}
}
function ingest(next){
  if(seenRecords===null)seenRecords=new Set(next.records.map(r=>r.id));
  else for(const record of next.records){if(!seenRecords.has(record.id)){seenRecords.add(record.id);if(Date.now()-record.time<5000&&record.route)animate(record);}}
  snapshot=next;render();
}
function animate(record){
  const id=record.team;if(animationTimers[id])clearTimeout(animationTimers[id]);
  animations[id]={node:record.from,route:record.route,index:0};
  const step=()=>{
    const a=animations[id];if(!a)return;
    a.node=a.route[a.index++];renderMap();
    if(a.index<a.route.length)animationTimers[id]=setTimeout(step,520);
    else animationTimers[id]=setTimeout(()=>{delete animations[id];delete animationTimers[id];renderMap();},450);
  };
  animationTimers[id]=setTimeout(step,120);
}
async function action(path,data){try{const next=await api('POST',`/rooms/${session.code}/${path}`,data);ingest(next);return true;}catch(e){fail(e);return false;}}
function render(){showGame();renderScores();renderMap();renderCards();renderTable();renderLog();}
function renderScores(){
  $('scoreboard').innerHTML='ABC'.split('').map(id=>{const t=snapshot.teams[id];return `<div class="score"><div><b class="${id.toLowerCase()}">${id} 队</b><small>${t.joined?'已入席':'待加入'} · 待行动第 ${t.round} 轮 · ${esc(t.position)}</small></div><strong>${t.score} <small>分</small></strong></div>`;}).join('');
  $('myRole').textContent=snapshot.role==='host'?'裁判全览':snapshot.teamId+' 队视图';
}
function renderMap(){
  const grouped={};for(const id of 'ABC'){const p=animations[id]?.node||snapshot.teams[id].position;(grouped[p]??=[]).push(id);}
  for(const [node,ids] of Object.entries(grouped))ids.forEach((id,i)=>{
    let el=document.getElementById('marker-'+id);
    if(!el){el=document.createElement('div');el.id='marker-'+id;el.className='marker '+id;el.textContent=id;$('markers').appendChild(el);}
    const [x,y]=snapshot.pos[node];el.style.left=(x/16.4+(i-ids.length/2+.5)*1.5)+'%';el.style.top=y/15.1+'%';el.title=`${id} 队：${node}`;
  });
}
function renderCards(){
  const own=snapshot.role==='team'?snapshot.teams[snapshot.teamId]:null;
  if(!own){$('cards').innerHTML='<p class="notice">裁判可查看三队牌数；各队在自己的设备上选择手牌移动。</p>';$('route').textContent='';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  if(selected&&!own.hand.some(c=>c.id===selected.id))selected=null;
  $('cards').innerHTML=own.hand.map(c=>`<div class="card ${selected?.id===c.id?'selected':''}" role="button" tabindex="0" data-card="${c.id}"><small>移动牌</small><strong>${c.move}</strong><small>步</small></div>`).join('')+`<p class="notice">牌库 ${own.deckCount} · 弃牌堆 ${own.discardCount} · 手牌 ${own.handCount}</p>`;
  document.querySelectorAll('[data-card]').forEach(el=>{const choose=()=>{if(moving)return;selected=own.hand.find(c=>c.id===el.dataset.card);renderCards();};el.onclick=choose;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};});
  if(!selected){$('route').textContent='选择一张手牌，地图上会显示可到达的终点。';$('choices').innerHTML='';$('destinations').innerHTML='';return;}
  const options=window.routes.reachable(snapshot.graph,snapshot.house,own.position,selected.move);
  $('route').textContent=`第 ${own.round} 轮 · ${selected.move} 步 · 可到达 ${options.length} 个终点；房屋可提前停下。`;
  $('choices').innerHTML=options.map((o,i)=>`<button data-option="${i}" ${moving?'disabled':''}>${esc(o.node)} <small>经 ${esc(o.route.join(' → '))}</small></button>`).join('')+`<button id="cancelMove" ${moving?'disabled':''}>取消选牌</button>`;
  $('destinations').innerHTML=options.map((o,i)=>{const [x,y]=snapshot.pos[o.node];return `<button class="destination" data-option="${i}" title="路线：${esc(own.position+' → '+o.route.join(' → '))}" style="left:${x/16.4}%;top:${y/15.1}%" ${moving?'disabled':''}>${esc(o.node)}</button>`;}).join('');
  document.querySelectorAll('[data-option]').forEach(el=>el.onclick=async()=>{
    if(moving)return;moving=true;renderCards();
    const choice=options[Number(el.dataset.option)];const cardId=selected.id;
    const ok=await action('move',{cardId,route:choice.route});moving=false;
    if(ok)selected=null;renderCards();
  });
  $('cancelMove').onclick=()=>{selected=null;renderCards();};
}
function renderTable(){
  $('filterNote').textContent=snapshot.role==='host'?'显示所有轮次和到达记录。':`仅显示不晚于本队待行动轮次（第 ${snapshot.teams[snapshot.teamId].round} 轮）且已到达的记录。`;
  const rounds=[...new Set(snapshot.records.map(r=>r.round))].sort((a,b)=>b-a);
  $('rows').innerHTML=rounds.length?rounds.map(round=>`<tr><td>第 ${round} 轮</td>${'ABC'.split('').map(id=>{const r=snapshot.records.find(x=>x.round===round&&x.team===id);return `<td>${r?`${esc(r.node)}<br><span class="muted">${time(r.time)}</span>`:'<span class="muted">—</span>'}</td>`;}).join('')}</tr>`).join(''):'<tr><td colspan="4" class="muted">暂无移动记录</td></tr>';
  $('battles').innerHTML=snapshot.battles.map(b=>{
    const a=snapshot.records.find(r=>r.id===b.first)?.team, c=snapshot.records.find(r=>r.id===b.second)?.team;
    return `<div class="battle ${b.status==='已结算'?'settled':''}">第 ${b.round} 轮 · ${esc(b.node)} · ${a||'?'} 对 ${c||'?'} · ${b.status}${b.winner?' · '+b.winner+' 胜':''}${snapshot.role==='host'&&b.status==='待结算'?`<div><button data-battle="${b.id}" data-winner="${a}">${a} 胜</button><button data-battle="${b.id}" data-winner="${c}">${c} 胜</button></div>`:''}</div>`;
  }).join('');
  document.querySelectorAll('[data-battle]').forEach(el=>el.onclick=()=>action('battle',{id:el.dataset.battle,winner:el.dataset.winner}));
  $('hostTools').innerHTML=snapshot.role==='host'?'<h3>裁判调分</h3><div class="scoreTools">'+ 'ABC'.split('').map(id=>`<button data-score="${id}" data-value="-2">${id} −2</button><button data-score="${id}" data-value="1">${id} +1</button><button data-score="${id}" data-value="2">${id} +2</button>`).join('')+'</div>':'';
  document.querySelectorAll('[data-score]').forEach(el=>el.onclick=()=>action('score',{team:el.dataset.score,value:Number(el.dataset.value)}));
}
function renderLog(){$('log').innerHTML=snapshot.log.map(e=>`<div>${time(e.time)} · ${esc(e.message)}</div>`).join('');}
$('create').onclick=async()=>{try{const r=await api('POST','/rooms');session=r;save();await refresh();}catch(e){$('lobbyError').textContent=e.message;}};
$('join').onclick=async()=>{try{const code=$('code').value.trim().toUpperCase();if(!/^[A-F0-9]{6}$/.test(code))throw Error('请输入六位房间码');const r=await api('POST',`/rooms/${code}/join`,{team:$('seat').value});session=r;save();await refresh();}catch(e){$('lobbyError').textContent=e.message;}};
if(session)refresh();else showLobby();setInterval(refresh,1000);

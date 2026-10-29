const crypto = require('node:crypto');

const MOVES = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
const HOUSE = new Set(['Arcaea', 'Phigros', '范式起源']);
const GRAPH = {
  R1:['R2'], R2:['R3','B'], R3:['R4'], R4:['R5','P2'],
  R5:['R6'], R6:['R7'], R7:['R8'], R8:['R9','B'], R9:['R10','F4'],
  R10:['R11'], R11:['R12'], R12:['R1','A2'],
  A2:['Arcaea'], Arcaea:['A1'], A1:['R1'],
  P2:['Phigros'], Phigros:['P1'], P1:['R5'],
  F4:['F3'], F3:['范式起源'], '范式起源':['F1'], F1:['F2'], F2:['R10'],
  B:['R2','R8']
};
const POS = {
  R1:[950,950], R2:[800,990], R3:[650,950], R4:[540,840], R5:[500,690], R6:[540,540],
  R7:[650,430], R8:[800,390], R9:[950,430], R10:[1060,540], R11:[1100,690], R12:[1060,840],
  A1:[946,1284], Arcaea:[1441,1371], A2:[1394,836], P2:[295,1070], Phigros:[137,1013], P1:[295,580],
  F4:[853,292], F3:[909,116], '范式起源':[1191,116], F1:[1238,325], F2:[1102,450], B:[800,690]
};
const START = {A:'R1',B:'R5',C:'R9'};
const randomId = () => crypto.randomBytes(18).toString('base64url');
const shuffle = cards => {
  const a = [...cards];
  for (let i=a.length-1;i>0;i--) { const j=crypto.randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};
function newTeam(id) {
  const deck = shuffle(MOVES.map((move,n)=>({id:`${id}-${n+1}`,move})));
  return {id, joined:false, token:null, score:0, round:1, position:START[id], hand:deck.splice(0,6), deck,
    discard:[], lastArrival:0};
}
function createRoom() {
  return {code:'', hostToken:randomId(), teams:{A:newTeam('A'),B:newTeam('B'),C:newTeam('C')},
    records:[], battles:[], log:[], version:0};
}
function note(room, message) {room.log.unshift({time:Date.now(),message});room.log=room.log.slice(0,60);room.version++;}
function join(room,id) {
  const team=room.teams[id];
  if (!team || team.joined) throw Error('该队伍席位不可用');
  team.joined=true;team.token=randomId();note(room,`${id} 队加入房间`);return team.token;
}
function viewer(room,token) {
  if (token===room.hostToken) return {role:'host'};
  for (const id of 'ABC') if (token===room.teams[id].token && room.teams[id].joined) return {role:'team',id};
  throw Error('无效的房间凭证');
}
function state(room,who) {
  const own=who.role==='team'?room.teams[who.id]:null;
  const visible=room.records.filter(r=>who.role==='host'||(r.round<=own.round && r.time<=Date.now()));
  return {code:room.code,version:room.version,role:who.role,teamId:who.id||null,
    teams:Object.fromEntries(Object.entries(room.teams).map(([id,t])=>[id,{joined:t.joined,score:t.score,round:t.round,
      position:t.position,deckCount:t.deck.length,discardCount:t.discard.length,handCount:t.hand.length,
      ...(who.role==='host'||id===who.id?{hand:t.hand}: {})}])),
    records:visible,battles:room.battles.filter(b=>who.role==='host'||visible.some(r=>r.id===b.first||r.id===b.second)),
    log:room.log.filter(e=>who.role==='host'||e.time<=Date.now()),graph:GRAPH,pos:POS,house:[...HOUSE]};
}
function move(room,who,cardId,route) {
  if (who.role!=='team') throw Error('只有队伍可以移动');
  const t=room.teams[who.id], idx=t.hand.findIndex(c=>c.id===cardId);
  if(idx<0) throw Error('这张牌不在手牌中');
  const card=t.hand[idx];
  if(!Array.isArray(route)||route.length<1||route.length>card.move) throw Error('移动步数不正确');
  let node=t.position;
  for(const next of route) {if(!(GRAPH[node]||[]).includes(next)) throw Error('路线不符合地图方向');node=next;}
  if(route.length<card.move&&!HOUSE.has(node)) throw Error('只有进入房屋可以提前结束移动');
  const round=t.round,from=t.position;
  t.hand.splice(idx,1);t.discard.push(card);
  let shuffled=false;
  if(t.deck.length===0){t.deck=shuffle(t.discard);t.discard=[];shuffled=true;}
  t.hand.push(t.deck.shift());t.position=node;t.lastArrival=Date.now();t.round++;
  const record={id:randomId(),round,team:t.id,from,route:[...route],node,time:t.lastArrival,order:room.records.length+1};
  room.records.push(record);
  if(!HOUSE.has(node)) {
    const prior=room.records.find(r=>r.id!==record.id&&r.round===round&&r.node===node);
    if(prior && !room.battles.some(b=>b.round===round&&b.node===node))
      room.battles.push({id:randomId(),round,node,first:prior.id,second:record.id,status:'待结算',winner:null});
  }
  note(room,`${t.id} 队第 ${round} 轮：${card.move} 步，${route.join(' → ')}${shuffled?'；弃牌洗回牌库':''}`);
  return record;
}
function score(room,who,id,value) {
  if(who.role!=='host') throw Error('只有裁判可以调整分数');
  if(!room.teams[id]||!Number.isInteger(value)||Math.abs(value)>20) throw Error('分数调整无效');
  const t=room.teams[id];t.score=Math.max(0,t.score+value);note(room,`${id} 队积分 ${value>=0?'+':''}${value}，现为 ${t.score}`);
}
function battle(room,who,battleId,winner) {
  if(who.role!=='host') throw Error('只有裁判可以结算战斗');
  const b=room.battles.find(x=>x.id===battleId);
  if(!b||b.status!=='待结算') throw Error('战斗不可结算');
  const first=room.records.find(r=>r.id===b.first).team,second=room.records.find(r=>r.id===b.second).team;
  if(winner!==first&&winner!==second) throw Error('胜者必须是参战队伍');
  const loser=winner===first?second:first;
  room.teams[winner].score+=2;room.teams[loser].score=Math.max(0,room.teams[loser].score-2);
  b.status='已结算';b.winner=winner;note(room,`第 ${b.round} 轮 ${b.node} 战斗：${winner} 胜，+2 分；${loser} 负，−2 分`);
}
module.exports={GRAPH,POS,MOVES,createRoom,join,viewer,state,move,score,battle};

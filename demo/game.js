const crypto = require('node:crypto');
const {NODE_TYPES}=require('./map-data');
const {HAND,EVENTS,MISFORTUNES}=require('./catalog');

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
const randomId = () => crypto.randomBytes(18).toString('base64url');
function makeRandom(seed) {
  if(seed===null)return max=>crypto.randomInt(max);
  let counter=0;
  return max=>crypto.createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0)%max;
}
const shuffle = (cards,randomInt) => {
  const a = [...cards];
  for (let i=a.length-1;i>0;i--) { const j=randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
};
function newTeam(id,randomInt,initialMoney,initialIncome,start) {
  const deck = shuffle(HAND.flatMap(card=>Array.from({length:card.quantity},(_,n)=>({...card,id:`${id}-${card.id}-${n+1}`,sourceId:card.id}))),randomInt);
  return {id, joined:false, token:null, score:0, money:initialMoney, income:initialIncome,
    round:1, awaitingEnd:false, cardActionDone:false, position:start, hand:deck.splice(0,6), deck,
    discard:[], lastArrival:0,pendingRoll:null,eventShield:0,misfortuneShield:0,
    pendingChallenge:null,pendingTeleport:false,pendingExtraMove:false,discardAbility:false,discardedRound:0};
}
function makePile(cards,randomInt){return shuffle(cards.flatMap(card=>Array.from({length:card.quantity},()=>card)),randomInt);}
function drawPile(room,kind){
  const deckKey=kind+'Deck',discardKey=kind+'Discard';
  if(!room[deckKey].length){room[deckKey]=shuffle(room[discardKey],room.randomInt);room[discardKey]=[];}
  const card=room[deckKey].shift();if(!card)throw Error(`${kind} 牌库为空`);
  room[discardKey].push(card);return card;
}
function createRoom({seed=null,testMode=false,initialMoney=0,initialIncome=10}={}) {
  if(!Number.isSafeInteger(initialMoney)||initialMoney<0||initialMoney>1_000_000)throw Error('初始金钱必须是 0 到 1000000 的整数');
  if(!Number.isSafeInteger(initialIncome)||initialIncome<0||initialIncome>1_000_000)throw Error('初始收入必须是 0 到 1000000 的整数');
  const room={code:'',hostToken:randomId(),seed,testMode,initialMoney,initialIncome,
    resetCount:0,randomInt:makeRandom(seed),teams:{},
    records:[],battles:[],log:[],effects:[],moneyChanges:[],version:0};
  room.starts=shuffle([...HOUSE],room.randomInt);
  for(const [i,id] of [...'ABC'].entries())room.teams[id]=newTeam(id,room.randomInt,initialMoney,initialIncome,room.starts[i]);
  room.eventDeck=makePile(EVENTS,room.randomInt);room.eventDiscard=[];
  room.misfortuneDeck=makePile(MISFORTUNES,room.randomInt);room.misfortuneDiscard=[];
  room.pendingAuction=null;room.pendingMisfortuneChoice=null;room.auctionQueue=[];
  if(testMode)for(const id of 'ABC'){room.teams[id].joined=true;room.teams[id].token=randomId();}
  return room;
}
function reset(room,who) {
  if(who.role!=='host')throw Error('只有裁判可以重置房间');
  const seats=Object.fromEntries('ABC'.split('').map(id=>[id,{joined:room.teams[id].joined,token:room.teams[id].token}]));
  room.randomInt=makeRandom(room.seed);
  room.starts=shuffle([...HOUSE],room.randomInt);
  for(const [i,id] of [...'ABC'].entries())room.teams[id]={...newTeam(id,room.randomInt,room.initialMoney,room.initialIncome,room.starts[i]),...seats[id]};
  room.eventDeck=makePile(EVENTS,room.randomInt);room.eventDiscard=[];
  room.misfortuneDeck=makePile(MISFORTUNES,room.randomInt);room.misfortuneDiscard=[];
  room.pendingAuction=null;room.pendingMisfortuneChoice=null;room.auctionQueue=[];
  room.records=[];room.battles=[];room.log=[];room.effects=[];room.moneyChanges=[];room.resetCount++;
  note(room,'裁判重置了测试房间');
}
function note(room, message) {room.log.unshift({time:Date.now(),message});room.log=room.log.slice(0,60);room.version++;}
function changeMoney(room,t,delta,reason){
  const before=t.money;t.money=Math.max(0,t.money+delta);
  const amount=t.money-before;
  if(amount)room.moneyChanges.push({id:randomId(),team:t.id,amount,reason,time:Date.now()});
  room.moneyChanges=room.moneyChanges.slice(-120);return amount;
}
function effectNotice(room,kind,team,cards){
  room.effects.push({id:randomId(),kind,team,cards:cards.map(c=>({id:c.id,name:c.name,image:c.image})),time:Date.now()});
  room.effects=room.effects.slice(-80);
}
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
  const mapView=Object.fromEntries(Object.entries(room.teams).map(([id,t])=>{
    if(who.role==='host'||id===who.id)return [id,{node:t.position,ghost:false,actualRound:t.round}];
    const current=room.records.find(r=>r.team===id&&r.round===own.round);
    return [id,{node:current?.finalPosition||current?.node||t.position,ghost:!current,actualRound:t.round}];
  }));
  return {code:room.code,version:room.version,role:who.role,teamId:who.id||null,
    mapView,effects:room.effects,moneyChanges:room.moneyChanges,
    seed:who.role==='host'?room.seed:undefined,testMode:room.testMode,resetCount:room.resetCount,
    initialMoney:who.role==='host'?room.initialMoney:undefined,initialIncome:who.role==='host'?room.initialIncome:undefined,
    pendingAuction:room.pendingAuction?{card:room.pendingAuction.card,triggerTeam:room.pendingAuction.triggerTeam,
      bids:Object.fromEntries('ABC'.split('').map(id=>[id,who.role==='host'||id===who.id?room.pendingAuction.bids[id]:room.pendingAuction.bids[id]===undefined?undefined:'已提交']))}:null,
    pendingMisfortuneChoice:room.pendingMisfortuneChoice,
    challenges:who.role==='host'?Object.fromEntries('ABC'.split('').filter(id=>room.teams[id].pendingChallenge).map(id=>[id,room.teams[id].pendingChallenge])):undefined,
    testTokens:who.role==='host'&&room.testMode?Object.fromEntries('ABC'.split('').map(id=>[id,room.teams[id].token])):undefined,
    teams:Object.fromEntries(Object.entries(room.teams).map(([id,t])=>[id,{joined:t.joined,score:t.score,money:t.money,income:t.income,round:t.round,
      awaitingEnd:t.awaitingEnd,cardActionDone:t.cardActionDone,position:mapView[id].node,
      deckCount:t.deck.length,discardCount:t.discard.length,handCount:t.hand.length,
      eventShield:t.eventShield,misfortuneShield:t.misfortuneShield,discardAbility:t.discardAbility,
      canDiscard:t.discardAbility&&t.awaitingEnd&&HOUSE.has(t.position)&&t.discardedRound!==t.round&&
        !t.pendingChallenge&&!t.pendingTeleport&&!t.pendingExtraMove&&!room.pendingAuction&&!room.pendingMisfortuneChoice&&!t.hand.some(c=>canUse(t,c)),
      pendingChallenge:who.role==='host'||id===who.id?t.pendingChallenge?{id:t.pendingChallenge.id,card:t.pendingChallenge.card}:null:undefined,
      pendingTeleport:id===who.id||who.role==='host'?t.pendingTeleport:undefined,
      pendingExtraMove:id===who.id||who.role==='host'?t.pendingExtraMove:undefined,
      ...(who.role==='host'||id===who.id?{pendingRoll:t.pendingRoll}:{}),
      ...(who.role==='host'||id===who.id?{hand:t.hand}: {})}])),
    records:visible,battles:room.battles.filter(b=>who.role==='host'||visible.some(r=>r.id===b.first||r.id===b.second)),
    log:room.log.filter(e=>who.role==='host'||e.time<=Date.now()),graph:GRAPH,pos:POS,house:[...HOUSE]};
}
function roll(room,who,cardId){
  if(who.role!=='team')throw Error('只有队伍可以掷骰');
  const t=room.teams[who.id],card=t.hand.find(c=>c.id===cardId);
  if(t.awaitingEnd&&!t.pendingExtraMove)throw Error('当前不能掷骰移动');
  if(!card||card.move!==7)throw Error('只能为手中的问号牌掷骰');
  if(t.pendingRoll?.cardId===cardId)return t.pendingRoll.value;
  t.pendingRoll={cardId,value:room.randomInt(6)+1};
  note(room,`${who.id} 队问号牌掷出 ${t.pendingRoll.value} 点`);
  return t.pendingRoll.value;
}
function consumeCard(room,t,index){
  const [card]=t.hand.splice(index,1);t.discard.push(card);
  let shuffled=false;
  if(t.deck.length===0){t.deck=shuffle(t.discard,room.randomInt);t.discard=[];shuffled=true;}
  t.hand.push(t.deck.shift());t.pendingRoll=null;
  return {card,shuffled};
}
const cardHouse=card=>card.game_type==='fanshi'?'范式起源':card.game_type;
function canUse(t,card){return HOUSE.has(t.position)&&(card.game_type==='random'||cardHouse(card)===t.position)&&t.money>=card.cost;}
function useCard(room,who,cardId){
  if(who.role!=='team')throw Error('只有队伍可以使用手牌');
  const t=room.teams[who.id];
  if(!t.awaitingEnd||t.cardActionDone||t.pendingChallenge||t.pendingTeleport||t.pendingExtraMove||room.pendingAuction||room.pendingMisfortuneChoice)throw Error('当前不在使用手牌阶段');
  const index=t.hand.findIndex(c=>c.id===cardId);if(index<0)throw Error('这张牌不在手牌中');
  const card=t.hand[index];if(!canUse(t,card))throw Error('房屋不匹配或金钱不足');
  changeMoney(room,t,-card.cost,`${card.name}使用费用`);consumeCard(room,t,index);
  if(card.effect_type==='event_cancel_random'){
    const points=room.randomInt(6)+1;t.score+=points;changeMoney(room,t,points*70,card.name);t.eventShield++;
    t.cardActionDone=true;note(room,`${t.id} 队使用「${card.name}」：+${points} 分、+${points*70} 金钱，获得一次事件抵消`);
  }else{
    t.pendingChallenge={id:randomId(),card,round:t.round};
    note(room,`${t.id} 队使用「${card.name}」，等待裁判判定挑战：${card.condition}`);
  }
}
function skipUse(room,who){
  if(who.role!=='team')throw Error('只有队伍可以选择');
  const t=room.teams[who.id];
  if(!t.awaitingEnd||!HOUSE.has(t.position)||t.cardActionDone||t.pendingChallenge||t.pendingTeleport||t.pendingExtraMove||room.pendingAuction||room.pendingMisfortuneChoice)throw Error('当前不能跳过手牌');
  t.cardActionDone=true;note(room,`${t.id} 队本回合不使用手牌`);
}
function resolveChallenge(room,who,teamId,success){
  if(who.role!=='host'||typeof success!=='boolean')throw Error('只有裁判可以判定挑战');
  const t=room.teams[teamId];if(!t?.pendingChallenge)throw Error('没有待判定的挑战');
  const card=t.pendingChallenge.card;t.pendingChallenge=null;
  if(!success){t.cardActionDone=true;note(room,`${teamId} 队「${card.name}」挑战失败`);return;}
  switch(card.effect_type){
    case 'score':t.score+=card.effectValue;t.cardActionDone=true;break;
    case 'income':t.income+=card.effectValue;t.cardActionDone=true;break;
    case 'shield_misfortune':t.misfortuneShield+=card.effectValue;t.cardActionDone=true;break;
    case 'teleport':t.pendingTeleport=true;break;
    case 'score_extra_move':t.score+=card.effectValue;t.pendingExtraMove=true;break;
    case 'score_optional_discard':t.score+=card.effectValue;t.discardAbility=true;t.cardActionDone=true;break;
    default:throw Error(`尚不支持卡牌效果 ${card.effect_type}`);
  }
  note(room,`${teamId} 队「${card.name}」挑战成功：${card.effect}`);
}
function setExtraPosition(room,t,node){
  t.position=node;
  const record=room.records.findLast(r=>r.team===t.id&&r.round===t.round);
  if(record)record.finalPosition=node;
}
function teleport(room,who,node){
  if(who.role!=='team')throw Error('只有队伍可以传送');
  const t=room.teams[who.id];
  if(!t.pendingTeleport||!Object.hasOwn(GRAPH,node)||room.pendingAuction||room.pendingMisfortuneChoice)throw Error('当前不能传送到该节点');
  setExtraPosition(room,t,node);t.pendingTeleport=false;t.cardActionDone=true;
  note(room,`${t.id} 队传送到 ${node}（不触发格子与战斗）`);
}
function extraMove(room,who,cardId,route){
  if(who.role!=='team')throw Error('只有队伍可以额外移动');
  const t=room.teams[who.id],index=t.hand.findIndex(c=>c.id===cardId);
  if(!t.pendingExtraMove||index<0||room.pendingAuction||room.pendingMisfortuneChoice)throw Error('当前不能额外移动');
  const card=t.hand[index],steps=card.move===7?t.pendingRoll?.cardId===cardId?t.pendingRoll.value:null:card.move;
  if(steps===null)throw Error('问号牌需要先掷骰');
  if(!Array.isArray(route)||route.length<1||route.length>steps)throw Error('额外移动步数不正确');
  const from=t.position;let node=from;for(const next of route){if(!(GRAPH[node]||[]).includes(next))throw Error('路线不符合地图方向');node=next;}
  if(route.length<steps&&!HOUSE.has(node))throw Error('只有进入房屋可以提前结束移动');
  consumeCard(room,t,index);setExtraPosition(room,t,node);t.pendingExtraMove=false;t.cardActionDone=true;
  const record=room.records.findLast(r=>r.team===t.id&&r.round===t.round);
  if(record)(record.extraMoves??=[]).push({id:randomId(),team:t.id,from,route:[...route],time:Date.now()});
  note(room,`${t.id} 队额外移动至 ${node}（不触发格子与战斗）`);
}
function discardCard(room,who,cardId){
  if(who.role!=='team')throw Error('只有队伍可以弃牌');
  const t=room.teams[who.id],index=t.hand.findIndex(c=>c.id===cardId);
  if(!t.discardAbility||!t.awaitingEnd||!HOUSE.has(t.position)||t.discardedRound===t.round||index<0||t.pendingChallenge||t.pendingTeleport||t.pendingExtraMove||room.pendingAuction||room.pendingMisfortuneChoice||t.hand.some(c=>canUse(t,c)))throw Error('当前不能使用机械帮手弃牌');
  consumeCard(room,t,index);t.discardedRound=t.round;note(room,`${t.id} 队使用机械帮手能力弃一张手牌并补牌`);
}
function queueAuction(room,triggerTeam,card){
  room.auctionQueue.push({id:randomId(),card,triggerTeam,bids:{}});
  if(!room.pendingAuction)room.pendingAuction=room.auctionQueue.shift();
  note(room,`${triggerTeam} 队触发厄运「${card.name}」，等待三队出价`);
}
function misfortuneTarget(room,who,target){
  const choice=room.pendingMisfortuneChoice;
  if(!choice||who.role!=='team'||who.id!==choice.triggerTeam)throw Error('当前不能指定厄运选牌队伍');
  if(choice.target)throw Error('已指定选牌队伍');
  if(!'ABC'.includes(target)||target===who.id)throw Error('请选择另一支队伍');
  choice.target=target;note(room,`${who.id} 队指定 ${target} 队选择厄运`);
}
function misfortunePick(room,who,index){
  const choice=room.pendingMisfortuneChoice;
  if(!choice||who.role!=='team'||who.id!==choice.target)throw Error('当前不能选择厄运');
  if(!Number.isInteger(index)||index<0||index>=choice.cards.length)throw Error('厄运选项无效');
  const card=choice.cards[index];room.pendingMisfortuneChoice=null;
  note(room,`${who.id} 队为 ${choice.triggerTeam} 队选中厄运「${card.name}」`);
  queueAuction(room,choice.triggerTeam,card);
}
function bid(room,who,amount){
  if(who.role!=='team'||!room.pendingAuction)throw Error('当前没有可参与的竞标');
  const t=room.teams[who.id];
  if(room.pendingAuction.bids[who.id]!==undefined)throw Error('本队已经出价');
  if(!Number.isSafeInteger(amount)||amount<0||amount>t.money)throw Error('出价必须是余额内的非负整数');
  room.pendingAuction.bids[who.id]=amount;note(room,`${who.id} 队已提交竞标`);
  if('ABC'.split('').every(id=>room.pendingAuction.bids[id]!==undefined)){
    const bids=room.pendingAuction.bids,min=Math.min(...Object.values(bids));
    for(const id of 'ABC')changeMoney(room,room.teams[id],-bids[id],'社长造访竞标');
    const losers='ABC'.split('').filter(id=>bids[id]===min);
    for(const id of losers)room.teams[id].score=Math.max(0,room.teams[id].score-2);
    note(room,`社长造访竞标结束：${'ABC'.split('').map(id=>`${id} ${bids[id]}`).join('、')}；最低出价 ${losers.join('、')} 队各 −2 分`);
    room.pendingAuction=room.auctionQueue.shift()||null;
  }
}
function move(room,who,cardId,route) {
  if (who.role!=='team') throw Error('只有队伍可以移动');
  if(room.pendingAuction||room.pendingMisfortuneChoice)throw Error('请先完成厄运结算');
  const t=room.teams[who.id], idx=t.hand.findIndex(c=>c.id===cardId);
  if(t.awaitingEnd)throw Error('请先结束当前回合');
  if(idx<0) throw Error('这张牌不在手牌中');
  const card=t.hand[idx];
  const steps=card.move===7?t.pendingRoll?.cardId===cardId?t.pendingRoll.value:null:card.move;
  if(steps===null)throw Error('问号牌需要先掷骰');
  if(!Array.isArray(route)||route.length<1||route.length>steps) throw Error('移动步数不正确');
  let node=t.position;
  for(const next of route) {if(!(GRAPH[node]||[]).includes(next)) throw Error('路线不符合地图方向');node=next;}
  if(route.length<steps&&!HOUSE.has(node)) throw Error('只有进入房屋可以提前结束移动');
  const round=t.round,from=t.position;
  const moneyBefore=t.money,moneyEffects=[];
  for(const [i,step] of route.entries()){
    const type=NODE_TYPES[step],end=i===route.length-1;
    const amount=type==='收入格'?t.income*(end?2:1):type==='收税格'?-20*(end?2:1):0;
    if(amount)moneyEffects.push({node:step,amount:changeMoney(room,t,amount,type)});
  }
  const {shuffled}=consumeCard(room,t,idx);
  t.position=node;t.lastArrival=Date.now();t.awaitingEnd=true;t.cardActionDone=!HOUSE.has(node);
  const record={id:randomId(),round,team:t.id,from,route:[...route],node,time:t.lastArrival,
    order:room.records.length+1,moneyDelta:t.money-moneyBefore,moneyEffects,
    card:{id:card.sourceId,name:card.name,image:card.image,steps}};
  room.records.push(record);
  for(const [i,step] of route.entries())if(step==='B'){
    const atEnd=i===route.length-1;
    if(t.misfortuneShield>0){t.misfortuneShield--;effectNotice(room,'misfortune',t.id,[]);note(room,`${t.id} 队抵消一次厄运`);continue;}
    const draws=atEnd?[drawPile(room,'misfortune'),drawPile(room,'misfortune')]:[drawPile(room,'misfortune')];
    effectNotice(room,'misfortune',t.id,draws);
    (record.misfortune??=[]).push(...draws.map(c=>({id:c.id,name:c.name,image:c.image})));
    if(atEnd){
      room.pendingMisfortuneChoice={triggerTeam:t.id,target:null,cards:draws};
      note(room,`${t.id} 队停在厄运 B，抽两张厄运并指定一队选牌`);
    }else queueAuction(room,t.id,draws[0]);
  }
  if(!HOUSE.has(node)) {
    const prior=room.records.find(r=>r.id!==record.id&&r.round===round&&r.node===node);
    if(prior && !room.battles.some(b=>b.round===round&&b.node===node))
      room.battles.push({id:randomId(),round,node,first:prior.id,second:record.id,status:'待结算',winner:null});
  }
  if(NODE_TYPES[node]==='事件格'){
    if(t.eventShield>0){t.eventShield--;record.event={id:'cancelled',name:'事件已抵消',image:null};effectNotice(room,'event',t.id,[]);note(room,`${t.id} 队抵消了事件格效果`);}
    else{
      const event=drawPile(room,'event');record.event={id:event.id,name:event.name,image:event.image};
      effectNotice(room,'event',t.id,[event]);
      if(event.effect_type==='money')record.event.moneyDelta=changeMoney(room,t,event.effectValue,event.name);
      note(room,`${t.id} 队抽到事件「${event.name}」${record.event.moneyDelta?`，金钱 +${record.event.moneyDelta}`:''}`);
    }
  }
  note(room,`${t.id} 队第 ${round} 轮：${steps} 步，${route.join(' → ')}；格子金钱 ${record.moneyDelta>=0?'+':''}${record.moneyDelta}${shuffled?'；弃牌洗回牌库':''}`);
  return record;
}
function endTurn(room,who){
  if(who.role!=='team')throw Error('只有队伍可以结束回合');
  const t=room.teams[who.id];
  if(!t.awaitingEnd)throw Error('请先完成本回合移动');
  if(room.pendingAuction||room.pendingMisfortuneChoice)throw Error('请先完成厄运结算');
  if(!t.cardActionDone||t.pendingChallenge||t.pendingTeleport||t.pendingExtraMove)throw Error('请先使用手牌或选择不使用');
  t.round++;t.awaitingEnd=false;t.pendingRoll=null;
  note(room,`${t.id} 队结束第 ${t.round-1} 回合，进入第 ${t.round} 回合`);
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
module.exports={GRAPH,POS,HAND,createRoom,reset,join,viewer,state,roll,useCard,skipUse,resolveChallenge,teleport,extraMove,discardCard,bid,misfortuneTarget,misfortunePick,move,endTurn,score,battle};

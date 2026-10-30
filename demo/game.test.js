const test=require('node:test');
const assert=require('node:assert/strict');
const g=require('./game');
const {reachable}=require('./public/routes');
const {NODE_TYPES}=require('./map-data');
function arriveWithCard(sourceId,house,initialMoney=1000){
  const room=g.createRoom({seed:`use-${sourceId}`,initialMoney}),t=room.teams.A,who={role:'team',id:'A'};
  const card=t.hand.find(c=>c.sourceId===sourceId)||t.deck.find(c=>c.sourceId===sourceId);
  if(!t.hand.includes(card)){const old=t.hand[0];t.hand[0]=card;t.deck[t.deck.indexOf(card)]=old;}
  const before={Phigros:'P2',Arcaea:'A2','范式起源':'F3'}[house];
  t.position=before;const mover=t.hand.find(c=>c.id!==card.id&&c.move!==7);mover.move=1;
  g.move(room,who,mover.id,[house]);
  return {room,t,who,card};
}

test('裁判设置初始金钱和收入，三队积分始终从 0 开始，重置复原',()=>{
  const room=g.createRoom({seed:'money',initialMoney:500,initialIncome:30});
  for(const id of 'ABC'){
    assert.equal(room.teams[id].money,500);
    assert.equal(room.teams[id].income,30);
    assert.equal(room.teams[id].score,0);
  }
  room.teams.A.money=1;room.teams.A.score=10;
  g.reset(room,{role:'host'});
  assert.equal(room.teams.A.money,500);
  assert.equal(room.teams.A.score,0);
  assert.throws(()=>g.createRoom({initialMoney:-1}),/初始金钱/);
  assert.throws(()=>g.createRoom({initialIncome:1.5}),/初始收入/);
});

test('起点为三个不同建筑，固定种子重置后分配不变',()=>{
  const room=g.createRoom({seed:'starts'});
  const starts='ABC'.split('').map(id=>room.teams[id].position);
  assert.deepEqual(new Set(starts),new Set(['Arcaea','Phigros','范式起源']));
  g.reset(room,{role:'host'});
  assert.deepEqual('ABC'.split('').map(id=>room.teams[id].position),starts);
});

test('移动后必须手动结束回合才能再次移动',()=>{
  const room=g.createRoom({seed:'turn'}),t=room.teams.A,who={role:'team',id:'A'};
  const card=t.hand.find(c=>c.move!==7);let at=t.position;const route=[];
  for(let i=0;i<card.move;i++){at=g.GRAPH[at][0];route.push(at);}
  assert.throws(()=>g.endTurn(room,who),/先完成/);
  g.move(room,who,card.id,route);
  assert.equal(t.round,1);assert.equal(t.awaitingEnd,true);
  assert.throws(()=>g.move(room,who,t.hand[0].id,route),/结束当前回合/);
  g.endTurn(room,who);
  assert.equal(t.round,2);assert.equal(t.awaitingEnd,false);
  assert.equal(g.state(room,who).teams.A.round,2);
});

test('房屋卡牌阶段可跳过，使用时扣费并由裁判判定挑战',()=>{
  const {room,t,who,card}=arriveWithCard('card1','Phigros',500);
  assert.equal(t.cardActionDone,false);
  assert.throws(()=>g.endTurn(room,who),/使用手牌/);
  g.useCard(room,who,card.id);
  assert.equal(t.money,200);assert.ok(t.pendingChallenge);
  assert.throws(()=>g.endTurn(room,who),/使用手牌/);
  g.resolveChallenge(room,{role:'host'},'A',true);
  assert.equal(t.score,4);assert.equal(t.cardActionDone,true);
  g.endTurn(room,who);
  const skipped=arriveWithCard('card1','Phigros',100);
  assert.throws(()=>g.useCard(skipped.room,skipped.who,skipped.card.id),/金钱不足/);
  g.skipUse(skipped.room,skipped.who);g.endTurn(skipped.room,skipped.who);
});

test('成品手牌的收入、传送、厄运抵消、额外移动与机械帮手能力',()=>{
  const host={role:'host'};
  const income=arriveWithCard('card2','Arcaea');g.useCard(income.room,income.who,income.card.id);
  g.resolveChallenge(income.room,host,'A',true);assert.equal(income.t.income,20);
  const teleport=arriveWithCard('card3','Phigros');g.useCard(teleport.room,teleport.who,teleport.card.id);
  g.resolveChallenge(teleport.room,host,'A',true);assert.equal(teleport.t.pendingTeleport,true);
  g.teleport(teleport.room,teleport.who,'R12');assert.equal(teleport.t.position,'R12');
  assert.equal(teleport.room.records[0].node,'Phigros');assert.equal(teleport.room.records[0].finalPosition,'R12');
  const shield=arriveWithCard('card4','范式起源');g.useCard(shield.room,shield.who,shield.card.id);
  g.resolveChallenge(shield.room,host,'A',true);assert.equal(shield.t.misfortuneShield,1);
  g.endTurn(shield.room,shield.who);shield.t.position='R2';const shieldMover=shield.t.hand.find(c=>c.move!==7);shieldMover.move=1;
  g.move(shield.room,shield.who,shieldMover.id,['B']);
  assert.equal(shield.t.misfortuneShield,0);assert.equal(shield.room.pendingAuction,null);
  const extra=arriveWithCard('card5','Arcaea');g.useCard(extra.room,extra.who,extra.card.id);
  g.resolveChallenge(extra.room,host,'A',true);assert.equal(extra.t.score,1);
  const extraCard=extra.t.hand.find(c=>c.move!==7);extraCard.move=1;
  g.extraMove(extra.room,extra.who,extraCard.id,['A1']);
  assert.equal(extra.t.position,'A1');assert.equal(extra.room.records.length,1);
  assert.deepEqual(extra.room.records[0].extraMoves[0].route,['A1']);
  assert.equal(extra.room.records[0].event,undefined);
  const helper=arriveWithCard('card6','范式起源');g.useCard(helper.room,helper.who,helper.card.id);
  g.resolveChallenge(helper.room,host,'A',true);assert.equal(helper.t.score,9);assert.equal(helper.t.discardAbility,true);
  for(const card of helper.t.hand)card.game_type='Phigros';
  const toDiscard=helper.t.hand[0].id;
  g.discardCard(helper.room,helper.who,toDiscard);assert.equal(helper.t.hand.length,6);
  assert.throws(()=>g.discardCard(helper.room,helper.who,helper.t.hand[0].id),/不能使用/);
});

test('队伍地图按自身当前回合显示领先队伍快照，未行动队伍虚化实时位置',()=>{
  const room=g.createRoom({seed:'map-snapshot'}),b=room.teams.B,whoB={role:'team',id:'B'};
  b.position='R1';
  for(const node of ['R2','R3','R4']){
    b.hand[0].move=1;g.move(room,whoB,b.hand[0].id,[node]);
    if(node!=='R4')g.endTurn(room,whoB);
  }
  const aView=g.state(room,{role:'team',id:'A'});
  assert.deepEqual(aView.mapView.B,{node:'R2',ghost:false,actualRound:3});
  assert.equal(aView.teams.B.position,'R2');
  assert.equal(aView.mapView.C.node,room.teams.C.position);
  assert.equal(aView.mapView.C.ghost,true);
  const hostView=g.state(room,{role:'host'});
  assert.equal(hostView.mapView.B.node,'R4');
  const a=room.teams.A;a.hand[0].move=1;g.move(room,{role:'team',id:'A'},a.hand[0].id,[g.GRAPH[a.position][0]]);
  g.endTurn(room,{role:'team',id:'A'});
  assert.equal(g.state(room,{role:'team',id:'A'}).mapView.B.node,'R3');
});

test('经过与停留收入税格按规则结算，金钱不会低于零',()=>{
  assert.equal(NODE_TYPES.R5,'收入格');assert.equal(NODE_TYPES.R6,'收税格');
  const room=g.createRoom({seed:'economy',initialMoney:0,initialIncome:30});
  const team=room.teams.A,who={role:'team',id:'A'};
  team.position='R4';team.hand[0].move=1;
  const landed=g.move(room,who,team.hand[0].id,['R5']);
  assert.equal(team.money,60);assert.equal(landed.moneyDelta,60);
  g.endTurn(room,who);
  team.position='R4';team.hand[0].move=2;
  const crossed=g.move(room,who,team.hand[0].id,['R5','R6']);
  assert.equal(crossed.moneyDelta,-10);
  assert.deepEqual(crossed.moneyEffects.map(e=>e.amount),[30,-40]);
  assert.equal(team.money,50);
  g.endTurn(room,who);
  team.money=0;team.position='R1';team.hand[0].move=1;
  const taxed=g.move(room,who,team.hand[0].id,['R2']);
  assert.equal(team.money,0);assert.equal(taxed.moneyDelta,0);
});

test('七张成品手牌独立抽弃洗牌，数量始终守恒',()=>{
  const room=g.createRoom();const token=g.join(room,'A');g.join(room,'B');const who=g.viewer(room,token);
  const bBefore=JSON.stringify(room.teams.B);
  for(let i=0;i<5;i++){
    const team=room.teams.A,card=team.hand.find(c=>c.move!==7);let at=team.position;const route=[];
    for(let n=0;n<card.move;n++){at=g.GRAPH[at][0];route.push(at);}
    g.move(room,who,card.id,route);
    g.endTurn(room,who);
    assert.equal(team.hand.length,6);
    assert.equal(team.hand.length+team.deck.length+team.discard.length,7);
  }
  assert.equal(room.teams.A.deck.length+room.teams.A.discard.length,1);
  assert.equal(JSON.stringify(room.teams.B),bBefore);
  assert.equal(room.records.length,5);
  assert.equal(room.records[0].from,room.starts[0]);
  assert.equal(room.records[0].route.at(-1),room.records[0].node);
});

test('成品手牌按 CSV 点数移动，问号牌由服务器掷骰',()=>{
  const room=g.createRoom({seed:'question'}),t=room.teams.A,who={role:'team',id:'A'};
  const card7=t.hand.find(c=>c.sourceId==='card7')||t.deck.find(c=>c.sourceId==='card7');
  if(!t.hand.includes(card7)){const old=t.hand[0];t.hand[0]=card7;t.deck[t.deck.indexOf(card7)]=old;}
  assert.equal(card7.move,7);assert.match(card7.image,/card7\.png$/);
  assert.throws(()=>g.move(room,who,card7.id,['R1']),/掷骰/);
  const steps=g.roll(room,who,card7.id);assert.ok(steps>=1&&steps<=6);
  let at=t.position;const route=[];for(let i=0;i<steps;i++){at=g.GRAPH[at][0];route.push(at);}
  const record=g.move(room,who,card7.id,route);
  assert.equal(record.card.steps,steps);assert.equal(record.card.name,'装腔作势');
  assert.equal(t.pendingRoll,null);
});

test('问号牌可在建筑领取掷骰奖励，并抵消下一次事件',()=>{
  const room=g.createRoom({seed:'question-reward',initialMoney:100}),t=room.teams.A,who={role:'team',id:'A'};
  const card7=t.hand.find(c=>c.sourceId==='card7')||t.deck.find(c=>c.sourceId==='card7');
  if(!t.hand.includes(card7)){const old=t.hand[0];t.hand[0]=card7;t.deck[t.deck.indexOf(card7)]=old;}
  t.position='R12';const mover=t.hand.find(c=>c.id!==card7.id&&c.move!==7);mover.move=2;
  g.move(room,who,mover.id,['A2','Arcaea']);
  const before=t.money;g.useCard(room,who,card7.id);
  const points=t.score;
  assert.ok(points>=1&&points<=6);assert.equal(t.money,before+points*70);assert.equal(t.eventShield,1);
  g.endTurn(room,who);
  t.position='R4';const card=t.hand.find(c=>c.move!==7);card.move=1;
  const record=g.move(room,who,card.id,['P2']);
  assert.equal(record.event.name,'事件已抵消');
  assert.equal(t.money,before+points*70);assert.equal(t.eventShield,0);
});

test('事件格抽成品事件卡并加钱，厄运格触发三队竞标',()=>{
  const room=g.createRoom({seed:'special',initialMoney:100,initialIncome:10});
  const a=room.teams.A;a.position='R4';a.hand[0].move=1;
  const event=g.move(room,{role:'team',id:'A'},a.hand[0].id,['P2']);
  assert.equal(event.event.name,'社团赞助');assert.equal(a.money,300);
  g.endTurn(room,{role:'team',id:'A'});
  a.position='R2';a.hand[0].move=1;a.score=3;
  const bad=g.move(room,{role:'team',id:'A'},a.hand[0].id,['B']);
  assert.equal(bad.misfortune.length,2);
  assert.equal(room.pendingMisfortuneChoice.triggerTeam,'A');
  assert.throws(()=>g.misfortuneTarget(room,{role:'team',id:'B'},'C'),/指定/);
  g.misfortuneTarget(room,{role:'team',id:'A'},'B');
  g.misfortunePick(room,{role:'team',id:'B'},0);
  assert.equal(room.pendingAuction.card.name,'社长造访');
  assert.throws(()=>g.move(room,{role:'team',id:'B'},room.teams.B.hand[0].id,['R1']),/厄运/);
  g.bid(room,{role:'team',id:'A'},0);
  g.bid(room,{role:'team',id:'B'},10);
  g.bid(room,{role:'team',id:'C'},20);
  assert.equal(room.pendingAuction,null);
  assert.equal(a.score,1);assert.equal(room.teams.B.money,90);assert.equal(room.teams.C.money,80);
});

test('路过厄运 B 只抽一张并直接开始竞标',()=>{
  const room=g.createRoom({seed:'pass-b'}),t=room.teams.A;t.position='R2';t.hand[0].move=2;
  const record=g.move(room,{role:'team',id:'A'},t.hand[0].id,['B','R8']);
  assert.equal(record.misfortune.length,1);
  assert.equal(room.pendingMisfortuneChoice,null);
  assert.equal(room.pendingAuction.card.id,'mis1');
});

test('同一次移动多次进入厄运 B 时每次都抽牌',()=>{
  const room=g.createRoom({seed:'loop-b'}),t=room.teams.A;t.position='R2';t.hand[0].move=3;
  const record=g.move(room,{role:'team',id:'A'},t.hand[0].id,['B','R2','B']);
  assert.equal(record.misfortune.length,3);
  assert.ok(room.pendingAuction);
  assert.ok(room.pendingMisfortuneChoice);
});

test('服务端拒绝越过步数及不符合方向的路线',()=>{
  const room=g.createRoom();const who=g.viewer(room,g.join(room,'A'));const card=room.teams.A.hand.find(c=>c.move!==7);
  assert.throws(()=>g.move(room,who,card.id,['R8']),/方向/);
  assert.throws(()=>g.move(room,who,card.id,[]),/步数/);
  assert.equal(room.teams.A.hand.length,6);
});

test('Arcaea 支线与地图箭头一致，终点计算包含房屋提前停留',()=>{
  assert.deepEqual(g.GRAPH.R12,['R1','A2']);
  assert.deepEqual(g.GRAPH.A2,['Arcaea']);
  assert.deepEqual(g.GRAPH.Arcaea,['A1']);
  assert.deepEqual(g.GRAPH.A1,['R1']);
  const options=reachable(g.GRAPH,['Arcaea','Phigros','范式起源'],'R12',4);
  assert.deepEqual(options.find(x=>x.node==='Arcaea').route,['A2','Arcaea']);
  assert.deepEqual(options.find(x=>x.node==='R1').route,['A2','Arcaea','A1','R1']);
  const alternatives=reachable(g.GRAPH,['Arcaea','Phigros','范式起源'],'R1',4).filter(x=>x.node==='B');
  assert.equal(alternatives.length,2);
  assert.notDeepEqual(alternatives[0].route,alternatives[1].route);
});

test('固定种子产生相同牌序；重置后复现牌序并保留四个席位',()=>{
  const a=g.createRoom({seed:'demo-01',testMode:true});
  const b=g.createRoom({seed:'demo-01',testMode:true});
  const initial=Object.fromEntries('ABC'.split('').map(id=>[id,a.teams[id].hand.map(c=>c.id)]));
  for(const id of 'ABC')assert.deepEqual(a.teams[id].hand,b.teams[id].hand);
  const tokens=Object.fromEntries('ABC'.split('').map(id=>[id,a.teams[id].token]));
  const card=a.teams.A.hand[0];let node=a.teams.A.position;const route=[];
  for(let i=0;i<card.move;i++){node=g.GRAPH[node][0];route.push(node);}
  g.move(a,{role:'team',id:'A'},card.id,route);
  assert.throws(()=>g.reset(a,{role:'team',id:'A'}),/裁判/);
  g.reset(a,{role:'host'});
  assert.equal(a.records.length,0);
  assert.equal(a.resetCount,1);
  for(const id of 'ABC'){
    assert.deepEqual(a.teams[id].hand.map(c=>c.id),initial[id]);
    assert.equal(a.teams[id].token,tokens[id]);
    assert.equal(a.teams[id].joined,true);
  }
});

test('同轮同格由先到的两队开战，第三队不补位；队伍看不到超前轮次',()=>{
  const room=g.createRoom();const who={};
  for(const id of 'ABC'){g.join(room,id);room.teams[id].position='R1';room.teams[id].hand[0].move=1;who[id]={role:'team',id};}
  for(const id of 'ABC')g.move(room,who[id],room.teams[id].hand[0].id,['R2']);
  assert.equal(room.battles.length,1);
  const b=room.battles[0];
  assert.equal(room.records.find(r=>r.id===b.first).team,'A');
  assert.equal(room.records.find(r=>r.id===b.second).team,'B');
  g.endTurn(room,who.A);
  room.teams.A.hand[0].move=1;g.move(room,who.A,room.teams.A.hand[0].id,['R3']);
  g.endTurn(room,who.A);
  room.teams.A.hand[0].move=1;g.move(room,who.A,room.teams.A.hand[0].id,['R4']);
  assert.equal(g.state(room,who.B).records.some(r=>r.round===3),false);
  assert.equal(g.state(room,{role:'host'}).records.length,5);
  g.battle(room,{role:'host'},b.id,'B');
  assert.equal(room.teams.B.score,2);
  assert.equal(room.teams.A.score,0);
});

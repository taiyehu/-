const test=require('node:test');
const assert=require('node:assert/strict');
const g=require('./game');
const {reachable}=require('./public/routes');

test('三队牌库独立，移动、抽牌、弃牌洗牌保持每队十张',()=>{
  const room=g.createRoom();const token=g.join(room,'A');g.join(room,'B');const who=g.viewer(room,token);
  const bBefore=JSON.stringify(room.teams.B);
  for(let i=0;i<5;i++){
    const team=room.teams.A,card=team.hand[0];let at=team.position;const route=[];
    for(let n=0;n<card.move;n++){at=g.GRAPH[at][0];route.push(at);}
    g.move(room,who,card.id,route);
    assert.equal(team.hand.length,6);
    assert.equal(team.hand.length+team.deck.length+team.discard.length,10);
  }
  assert.equal(room.teams.A.deck.length,4);
  assert.equal(room.teams.A.discard.length,0);
  assert.equal(JSON.stringify(room.teams.B),bBefore);
  assert.equal(room.records.length,5);
  assert.equal(room.records[0].from,'R1');
  assert.equal(room.records[0].route.at(-1),room.records[0].node);
});

test('服务端拒绝越过步数及不符合方向的路线',()=>{
  const room=g.createRoom();const who=g.viewer(room,g.join(room,'A'));const card=room.teams.A.hand[0];
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
});

test('同轮同格由先到的两队开战，第三队不补位；队伍看不到超前轮次',()=>{
  const room=g.createRoom();const who={};
  for(const id of 'ABC'){g.join(room,id);room.teams[id].position='R1';room.teams[id].hand[0].move=1;who[id]={role:'team',id};}
  for(const id of 'ABC')g.move(room,who[id],room.teams[id].hand[0].id,['R2']);
  assert.equal(room.battles.length,1);
  const b=room.battles[0];
  assert.equal(room.records.find(r=>r.id===b.first).team,'A');
  assert.equal(room.records.find(r=>r.id===b.second).team,'B');
  room.teams.A.hand[0].move=1;g.move(room,who.A,room.teams.A.hand[0].id,['R3']);
  room.teams.A.hand[0].move=1;g.move(room,who.A,room.teams.A.hand[0].id,['R4']);
  assert.equal(g.state(room,who.B).records.some(r=>r.round===3),false);
  assert.equal(g.state(room,{role:'host'}).records.length,5);
  g.battle(room,{role:'host'},b.id,'B');
  assert.equal(room.teams.B.score,2);
  assert.equal(room.teams.A.score,0);
});

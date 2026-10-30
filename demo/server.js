const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const game=require('./game');

const rooms=new Map();
const port=Number(process.env.PORT||3000);
const root=path.resolve(__dirname,'public');
const staticFiles={'/':'index.html','/app.js':'app.js','/routes.js':'routes.js','/style.css':'style.css','/movement.css':'movement.css','/map.svg':'../../map.svg'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',x=>{s+=x;if(s.length>20_000)reject(Error('请求过大'));});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(Error('JSON 格式错误'));}});});}
function roomCode(){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));return code;}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/')){
    const image=url.pathname.match(/^\/cards\/output\/([a-zA-Z0-9_-]+)\.png$/);
    if(image){
      const full=path.resolve(__dirname,'..','cards','output',image[1]+'.png');
      fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':'image/png','cache-control':'public, max-age=3600'});res.end(data);});return;
    }
    const file=staticFiles[url.pathname];if(!file){res.writeHead(404);return res.end();}
    const full=path.resolve(root,file);fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':types[path.extname(full)]});res.end(data);});return;
  }
  try{
    if(req.method==='POST'&&url.pathname==='/api/rooms'){
      const b=await body(req);
      if(b.seed!==undefined&&(typeof b.seed!=='string'||b.seed.length>80))throw Error('测试种子必须是 80 字以内的文字');
      const seed=b.seed?.trim()||null;
      const room=game.createRoom({seed,testMode:b.testMode===true,initialMoney:b.initialMoney,initialIncome:b.initialIncome});room.code=roomCode();rooms.set(room.code,room);
      return send(res,201,{code:room.code,token:room.hostToken});
    }
    const m=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})(?:\/(join|roll|use-card|skip-use|resolve-challenge|teleport|extra-move|discard-card|bid|misfortune-target|misfortune-pick|move|end-turn|score|battle|reset))?$/);
    if(!m) return send(res,404,{error:'房间接口不存在'});
    const room=rooms.get(m[1]);if(!room)return send(res,404,{error:'房间不存在或服务器已重启'});
    if(req.method==='POST'&&m[2]==='join'){
      const b=await body(req);return send(res,200,{code:room.code,token:game.join(room,b.team)});
    }
    const who=game.viewer(room,req.headers['x-session-token']);
    if(req.method==='GET'&&!m[2])return send(res,200,game.state(room,who));
    if(req.method==='POST'){
      const b=await body(req);
      if(m[2]==='roll')game.roll(room,who,b.cardId);
      else if(m[2]==='use-card')game.useCard(room,who,b.cardId);
      else if(m[2]==='skip-use')game.skipUse(room,who);
      else if(m[2]==='resolve-challenge')game.resolveChallenge(room,who,b.team,b.success);
      else if(m[2]==='teleport')game.teleport(room,who,b.node);
      else if(m[2]==='extra-move')game.extraMove(room,who,b.cardId,b.route);
      else if(m[2]==='discard-card')game.discardCard(room,who,b.cardId);
      else if(m[2]==='bid')game.bid(room,who,b.amount);
      else if(m[2]==='misfortune-target')game.misfortuneTarget(room,who,b.target);
      else if(m[2]==='misfortune-pick')game.misfortunePick(room,who,b.index);
      else if(m[2]==='move')game.move(room,who,b.cardId,b.route);
      else if(m[2]==='end-turn')game.endTurn(room,who);
      else if(m[2]==='score')game.score(room,who,b.team,b.value);
      else if(m[2]==='battle')game.battle(room,who,b.id,b.winner);
      else if(m[2]==='reset')game.reset(room,who);
      else return send(res,404,{error:'操作不存在'});
      return send(res,200,game.state(room,who));
    }
    send(res,405,{error:'方法不支持'});
  }catch(err){send(res,400,{error:err.message});}
});
if(require.main===module)server.listen(port,'0.0.0.0',()=>console.log(`Demo: http://localhost:${port}`));
module.exports=server;

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
    const file=staticFiles[url.pathname];if(!file){res.writeHead(404);return res.end();}
    const full=path.resolve(root,file);fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':types[path.extname(full)]});res.end(data);});return;
  }
  try{
    if(req.method==='POST'&&url.pathname==='/api/rooms'){
      const room=game.createRoom();room.code=roomCode();rooms.set(room.code,room);
      return send(res,201,{code:room.code,token:room.hostToken});
    }
    const m=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})(?:\/(join|move|score|battle))?$/);
    if(!m) return send(res,404,{error:'房间接口不存在'});
    const room=rooms.get(m[1]);if(!room)return send(res,404,{error:'房间不存在或服务器已重启'});
    if(req.method==='POST'&&m[2]==='join'){
      const b=await body(req);return send(res,200,{code:room.code,token:game.join(room,b.team)});
    }
    const who=game.viewer(room,req.headers['x-session-token']);
    if(req.method==='GET'&&!m[2])return send(res,200,game.state(room,who));
    if(req.method==='POST'){
      const b=await body(req);
      if(m[2]==='move')game.move(room,who,b.cardId,b.route);
      else if(m[2]==='score')game.score(room,who,b.team,b.value);
      else if(m[2]==='battle')game.battle(room,who,b.id,b.winner);
      else return send(res,404,{error:'操作不存在'});
      return send(res,200,game.state(room,who));
    }
    send(res,405,{error:'方法不支持'});
  }catch(err){send(res,400,{error:err.message});}
});
if(require.main===module)server.listen(port,'0.0.0.0',()=>console.log(`Demo: http://localhost:${port}`));
module.exports=server;

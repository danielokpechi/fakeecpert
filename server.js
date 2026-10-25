const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ ok: true }));
const rooms = new Map();
const facts = [
['Octopuses have three hearts.','Octopuses have blue blood.'],['Bananas are berries.','Strawberries are berries.'],['A day on Venus is longer than its year.','A day on Mars is longer than its year.'],['Honey can remain edible for thousands of years.','Olive oil can remain edible for thousands of years.'],['Sharks existed before trees.','Whales existed before trees.'],['The Eiffel Tower can grow taller in summer.','The Statue of Liberty can grow taller in summer.'],['Wombat poop is cube-shaped.','Koala poop is cube-shaped.'],['Cleopatra lived closer to the Moon landing than the pyramids.','Julius Caesar lived closer to the Moon landing than the pyramids.'],['Scotland’s national animal is the unicorn.','Ireland’s national animal is the unicorn.'],['A group of flamingos is called a flamboyance.','A group of penguins is called a flamboyance.'],['There are more possible chess games than atoms in the observable universe.','There are more possible Go games than atoms in the observable universe.'],['The heart of a shrimp is in its head.','The heart of a crab is in its head.'],['Some turtles can breathe through their rear ends.','Some frogs can breathe through their rear ends.'],['The first oranges were not orange.','The first lemons were not yellow.'],['A cloud can weigh over a million pounds.','A tornado can weigh over a million pounds.'],['Oxford University is older than the Aztec Empire.','Cambridge University is older than the Aztec Empire.'],['The inventor of the Pringles can is buried in one.','The inventor of the paperclip is buried in one.'],['A bolt of lightning is hotter than the Sun’s surface.','A bolt of lightning is colder than the Sun’s surface.'],['Cows have best friends.','Sheep have best friends.'],['The shortest war in history lasted under an hour.','The longest war in history lasted under an hour.'],['Some cats are allergic to humans.','Some dogs are allergic to humans.'],['A snail can sleep for years.','A slug can sleep for years.'],['The fingerprints of koalas are similar to humans’.','The fingerprints of pandas are similar to humans’.'],['The first computer bug was an actual moth.','The first computer virus was an actual moth.'],['The inventor of the frisbee was turned into a frisbee.','The inventor of the hula hoop was turned into a hula hoop.'],['There is a basketball court above the US Supreme Court.','There is a swimming pool above the US Supreme Court.'],['The Moon has moonquakes.','Mars has moonquakes.'],['A blue whale’s heart can weigh hundreds of pounds.','A great white shark’s heart can weigh hundreds of pounds.'],['The hashtag symbol is technically called an octothorpe.','The ampersand symbol is technically called an octothorpe.'],['The first webcam watched a coffee pot.','The first webcam watched a vending machine.']
];
const id = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const token = () => crypto.randomBytes(18).toString('hex');
function publicRoom(r) {
 return {code:r.code, phase:r.phase, hostId:r.hostId, round:r.round, players:[...r.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,connected:p.connected})), deadline:r.deadline, hints:r.hints.map(h=>({playerId:h.playerId,text:h.text})), votes:Object.keys(r.votes).length, fact:r.phase==='reveal'?r.fact:null, fakerId:r.phase==='reveal'?r.fakerId:null, realFact:r.phase==='reveal'?r.realFact:null, winner:r.winner||null};
}
function send(r) { io.to(r.code).emit('state', publicRoom(r)); }
function privateSend(p, r) { io.to(p.socketId).emit('role', {role:p.id===r.fakerId?'faker':'expert', fact:p.id===r.fakerId?null:r.realFact, round:r.round}); }
function timer(r, phase, seconds, fn) {
 clearTimeout(r.timer); r.phase=phase; r.deadline=Date.now()+seconds*1000; send(r);
 r.timer=setTimeout(()=>fn(r),seconds*1000);
}
function startRound(r) {
 const active=[...r.players.values()].filter(p=>p.connected);
 if(active.length<3){r.phase='lobby';r.deadline=null;send(r);return;}
 r.round++;r.hints=[];r.votes={};r.winner=null;
 const pair=facts[Math.floor(Math.random()*facts.length)]; r.realFact=pair[0];r.fact=r.realFact;
 r.fakerId=active[Math.floor(Math.random()*active.length)].id;
 for(const p of active) privateSend(p,r);
 timer(r,'hint',45,()=>timer(r,'vote',30,()=>reveal(r)));
 send(r);
}
function reveal(r) {
 clearTimeout(r.timer);r.phase='reveal';r.deadline=null;
 const tally={};Object.values(r.votes).forEach(v=>tally[v]=(tally[v]||0)+1);
 const max=Math.max(0,...Object.values(tally));const leaders=Object.keys(tally).filter(k=>tally[k]===max);
 const fakerCaught=max>0&&leaders.length===1&&leaders[0]===r.fakerId;
 for(const [voter,target] of Object.entries(r.votes)) if(target===r.fakerId) r.players.get(voter).score++;
 if(!fakerCaught && r.players.has(r.fakerId)) r.players.get(r.fakerId).score+=2;
 const top=Math.max(0,...[...r.players.values()].map(p=>p.score));
 if(top>=5){const winners=[...r.players.values()].filter(p=>p.score===top);r.winner=winners.map(p=>p.name).join(' & ');}
 send(r);
}
io.on('connection', socket=>{
 socket.on('create',({name})=>{
  const code=id(); const p={id:token(),name:String(name||'Player').trim().slice(0,20)||'Player',score:0,connected:true,socketId:socket.id};
  const r={code,hostId:p.id,players:new Map([[p.id,p]]),phase:'lobby',round:0,deadline:null,hints:[],votes:{},timer:null};
  rooms.set(code,r);socket.join(code);socket.emit('joined',{code,playerId:p.id,token:p.id});send(r);
 });
 socket.on('join',({code,name,token:resume})=>{
  const r=rooms.get(String(code||'').toUpperCase());if(!r)return socket.emit('errorMsg','Room not found. Check the code.');
  let p=resume&&r.players.get(resume);
  if(p){p.connected=true;p.socketId=socket.id;}
  else {if(r.phase!=='lobby'&&r.phase!=='reveal')return socket.emit('errorMsg','This game is in progress. You can join next round.');
   if(r.players.size>=8)return socket.emit('errorMsg','This room is full (8 players).');
   p={id:token(),name:String(name||'Player').trim().slice(0,20)||'Player',score:0,connected:true,socketId:socket.id};r.players.set(p.id,p);}
  socket.join(r.code);socket.emit('joined',{code:r.code,playerId:p.id,token:p.id});send(r);if(r.phase==='hint'||r.phase==='vote')privateSend(p,r);
 });
 socket.on('start',()=>{const r=[...rooms.values()].find(x=>x.players.has([...x.players.values()].find(p=>p.socketId===socket.id)?.id));if(!r)return;const p=[...r.players.values()].find(x=>x.socketId===socket.id);if(p?.id===r.hostId&&r.phase==='lobby'&&r.players.size>=3)startRound(r);});
 socket.on('hint',text=>{const r=[...rooms.values()].find(x=>[...x.players.values()].some(p=>p.socketId===socket.id));if(!r||r.phase!=='hint')return;const p=[...r.players.values()].find(x=>x.socketId===socket.id);if(!p)return;const value=String(text||'').trim().slice(0,120);if(!value)return;const old=r.hints.find(h=>h.playerId===p.id);if(old)old.text=value;else r.hints.push({playerId:p.id,text:value});send(r);});
 socket.on('vote',target=>{const r=[...rooms.values()].find(x=>[...x.players.values()].some(p=>p.socketId===socket.id));if(!r||r.phase!=='vote')return;const p=[...r.players.values()].find(x=>x.socketId===socket.id);if(!p||!r.players.has(target)||target===p.id)return;r.votes[p.id]=target;send(r);if(Object.keys(r.votes).length>=[...r.players.values()].filter(x=>x.connected).length)reveal(r);});
 socket.on('next',()=>{const r=[...rooms.values()].find(x=>[...x.players.values()].some(p=>p.socketId===socket.id));if(!r)return;const p=[...r.players.values()].find(x=>x.socketId===socket.id);if(p?.id===r.hostId&&r.phase==='reveal'){if(r.winner){r.phase='lobby';r.round=0;for(const q of r.players.values())q.score=0;r.winner=null;send(r);}else startRound(r);}});
 socket.on('disconnect',()=>{for(const r of rooms.values()){const p=[...r.players.values()].find(x=>x.socketId===socket.id);if(!p)continue;p.connected=false;if(p.id===r.hostId){const next=[...r.players.values()].find(x=>x.connected);if(next)r.hostId=next.id;}send(r);setTimeout(()=>{if(!p.connected&&r.players.size>0&&r.players.has(p.id)){r.players.delete(p.id);if(!r.players.size){clearTimeout(r.timer);rooms.delete(r.code);}else send(r);}},30000);}});
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Fake Expert listening on '+port));

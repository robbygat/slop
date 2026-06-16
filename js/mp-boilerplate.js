// Premium multiplayer boilerplate for AI-generated SLOP.games.
// Injected alongside SlopNet — games call SlopMP.boot() instead of wiring lobby/sync by hand.

export const SLOP_MP_RULES = `MULTIPLAYER — use the injected SlopMP + SlopNet (DO NOT rebuild lobby/netcode):
1. Call SlopMP.boot({ title, sync:'realtime'|'turn', maxPlayers, colors, onStart, getState, setState, onInput }) AFTER your canvas/DOM is ready.
2. sync:'turn' for chess/checkers/card games (state pushes after each move). sync:'realtime' for action games (~20Hz broadcast).
3. onStart({ players, myId, isHost }) — init game; players is [{id,name,color}].
4. getState() — host returns JSON-serializable snapshot; setState(s) — client applies snapshot.
5. onInput(fromId, input) — HOST ONLY: apply move/input, return true if state changed (turn-based auto-broadcasts).
6. For realtime: host calls SlopMP.requestFrame() each sim tick OR SlopMP.broadcast() after changes.
7. SlopMP handles: lobby UI, host/join, __SLOP_ROOM auto-join, share link copy, player roster, start button.
8. Expose window.GAME = { state, config } for live remix patches.`;

export const SLOP_MP_INLINE = `
<style id="slop-mp-css">
#slop-mp-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;
background:radial-gradient(ellipse at 50% 30%,rgba(255,78,184,.25),rgba(26,26,46,.92) 70%);font-family:'Nunito',system-ui,sans-serif;color:#fff}
#slop-mp-overlay.hidden{display:none!important}
.slop-mp-card{width:min(420px,94vw);background:#FFFBF0;border:3px solid #1A1A2E;border-radius:20px;padding:22px 20px 18px;box-shadow:8px 8px 0 #1A1A2E;color:#1A1A2E}
.slop-mp-title{font-family:Georgia,serif;font-weight:900;font-size:22px;margin:0 0 4px;color:#FF4EB8}
.slop-mp-sub{font-size:13px;font-weight:700;color:#3A3A5C;margin:0 0 16px;line-height:1.45}
.slop-mp-btns{display:flex;flex-direction:column;gap:9px;margin-bottom:14px}
.slop-mp-btn{font-family:inherit;font-weight:900;font-size:15px;border:2.5px solid #1A1A2E;border-radius:100px;padding:12px 16px;cursor:pointer;box-shadow:4px 4px 0 #1A1A2E;transition:transform .1s}
.slop-mp-btn:hover{transform:translate(-2px,-2px)}
.slop-mp-btn.primary{background:#FF4EB8;color:#fff}
.slop-mp-btn.host{background:#3DFFB0;color:#1A1A2E}
.slop-mp-btn.join{background:#4ECAFF;color:#1A1A2E}
.slop-mp-row{display:flex;gap:8px;margin-top:8px}
.slop-mp-row input{flex:1;font:inherit;font-weight:700;border:2.5px solid #1A1A2E;border-radius:100px;padding:10px 14px;outline:none}
.slop-mp-room{font-family:monospace;font-size:13px;font-weight:700;background:#FFE135;border:2px solid #1A1A2E;border-radius:10px;padding:10px 12px;margin:10px 0;word-break:break-all}
.slop-mp-players{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.slop-mp-pill{font-size:11px;font-weight:800;padding:5px 10px;border-radius:100px;border:2px solid #1A1A2E;background:#fff}
.slop-mp-status{font-size:12px;font-weight:700;color:#3A3A5C;min-height:18px;margin-top:6px}
.slop-mp-copy{width:100%;margin-top:6px;font-size:12px;font-weight:800;background:#1A1A2E;color:#3DFFB0;border:none;border-radius:100px;padding:9px;cursor:pointer}
.slop-mp-start{width:100%;margin-top:10px;font-size:16px;font-weight:900;background:#FF4EB8;color:#fff;border:2.5px solid #1A1A2E;border-radius:100px;padding:12px;cursor:pointer;box-shadow:4px 4px 0 #1A1A2E}
.slop-mp-start:disabled{opacity:.5;cursor:not-allowed}
.slop-mp-back{font-size:11px;font-weight:700;color:#3A3A5C;background:none;border:none;cursor:pointer;margin-top:10px;text-decoration:underline}
</style>
<div id="slop-mp-overlay"><div class="slop-mp-card" id="slop-mp-card"></div></div>
<script id="slop-mp-js">
window.SlopMP=(function(){
var cfg=null,players=[],myId='solo',started=false,hostLoop=null,overlay,card,statusEl;
var COLORS=['#FF4EB8','#4ECAFF','#3DFFB0','#FFE135','#FF7A35','#2B6BFF','#FF6B6B','#9CE8C6'];
function $(id){return document.getElementById(id);}
function show(){if(overlay)overlay.classList.remove('hidden');}
function hide(){if(overlay)overlay.classList.add('hidden');}
function setStatus(t){if(statusEl)statusEl.textContent=t||'';}
function shareUrl(){var c=window.SlopNet&&SlopNet.roomCode?SlopNet.roomCode():null;return c?(window.slopShareUrl?window.slopShareUrl(c):location.href.split('?')[0]+'?room='+c):'';}
function renderMenu(){
card.innerHTML='<h2 class="slop-mp-title">'+(cfg.title||'Online Play')+'</h2>'
+'<p class="slop-mp-sub">Play solo, host a room, or join a friend. Share the link — they click and play.</p>'
+'<div class="slop-mp-btns">'
+'<button type="button" class="slop-mp-btn primary" data-act="solo">Single Player</button>'
+'<button type="button" class="slop-mp-btn host" data-act="host">Host Online Game</button>'
+'<button type="button" class="slop-mp-btn join" data-act="join">Join with Code</button>'
+'</div>'
+'<div class="slop-mp-row" id="slop-mp-join-row" style="display:none"><input id="slop-mp-code" placeholder="paste room code…" maxlength="48"><button type="button" class="slop-mp-btn join" data-act="dojoin">Join</button></div>'
+'<p class="slop-mp-status" id="slop-mp-status"></p>';
statusEl=$('slop-mp-status');
card.querySelector('[data-act=solo]').onclick=function(){hide();started=true;myId='solo';players=[{id:'solo',name:'You',color:COLORS[0]}];cfg.onStart&&cfg.onStart({players:players,myId:myId,isHost:true});};
card.querySelector('[data-act=host]').onclick=hostOnline;
card.querySelector('[data-act=join]').onclick=function(){$('slop-mp-join-row').style.display='flex';};
card.querySelector('[data-act=dojoin]').onclick=function(){var c=$('slop-mp-code').value.trim();if(c)doJoin(c);};
}
function renderLobby(code){
var list=players.map(function(p){return '<span class="slop-mp-pill" style="border-color:'+p.color+'">'+p.name+'</span>';}).join('');
card.innerHTML='<h2 class="slop-mp-title">'+(SlopNet.isHost?'Your Room':'Joined Room')+'</h2>'
+'<div class="slop-mp-room">'+code+'</div>'
+(SlopNet.isHost?'<button type="button" class="slop-mp-copy" id="slop-mp-copy">Copy invite link</button>':'')
+'<div class="slop-mp-players">'+list+'</div>'
+(SlopNet.isHost?'<button type="button" class="slop-mp-start" id="slop-mp-start">Start Game</button>':'<p class="slop-mp-sub">Waiting for host to start…</p>')
+'<button type="button" class="slop-mp-back" id="slop-mp-back">← back</button>'
+'<p class="slop-mp-status" id="slop-mp-status"></p>';
statusEl=$('slop-mp-status');
if(SlopNet.isHost){
$('slop-mp-copy').onclick=function(){var u=shareUrl();if(navigator.clipboard)navigator.clipboard.writeText(u);setStatus('link copied!');};
$('slop-mp-start').onclick=startMulti;
}
$('slop-mp-back').onclick=function(){try{SlopNet.destroy&&SlopNet.destroy();}catch(e){}players=[];started=false;clearInterval(hostLoop);hostLoop=null;renderMenu();};
}
function hostOnline(){
if(!SlopNet.available()){setStatus('needs internet — PeerJS failed to load');return;}
setStatus('creating room…');
SlopNet.on('join',function(conn){
var i=players.length;var p={id:conn.peer,name:'Player '+(i+1),color:COLORS[i%COLORS.length]};
players.push(p);SlopNet.assignId(conn,p.id);renderLobby(SlopNet.roomCode());
});
SlopNet.on('leave',function(conn){players=players.filter(function(p){return p.id!==conn.peer;});renderLobby(SlopNet.roomCode());});
SlopNet.on('input',function(from,input){if(!SlopNet.isHost||!started)return;try{if(cfg.onInput&&cfg.onInput(from,input)){broadcastState();}}catch(e){}});
SlopNet.on('state',function(s){if(SlopNet.isHost)return;try{cfg.setState&&cfg.setState(s);}catch(e){}});
SlopNet.on('connected',function(){setStatus('connected!');});
SlopNet.on('error',function(e){setStatus('connection error: '+e);});
SlopNet.host(function(code){
players=[{id:'host',name:'Host (you)',color:COLORS[0]}];myId='host';renderLobby(code);
});
}
function doJoin(code){
if(!SlopNet.available()){setStatus('needs internet');return;}
setStatus('joining…');
SlopNet.on('state',function(s){if(!started){started=true;hide();cfg.onStart&&cfg.onStart({players:players,myId:myId,isHost:false});}try{cfg.setState&&cfg.setState(s);}catch(e){}});
SlopNet.on('init',function(id){myId=id;});
SlopNet.on('connected',function(){setStatus('connected — waiting for host…');});
SlopNet.on('error',function(e){setStatus('could not join: '+e);});
SlopNet.join(code,function(){players=[{id:'client',name:'You',color:COLORS[1]}];});
}
function startMulti(){
if(!SlopNet.isHost)return;started=true;hide();
cfg.onStart&&cfg.onStart({players:players,myId:myId,isHost:true});
broadcastState();
if(cfg.sync==='realtime'){clearInterval(hostLoop);hostLoop=setInterval(function(){if(!SlopNet.isHost)return;broadcastState();},cfg.hz?Math.round(1000/cfg.hz):50);}
SlopNet.broadcastLobby&&SlopNet.broadcastLobby({t:'start'});
}
function broadcastState(){if(!SlopNet.isHost||!cfg.getState)return;try{SlopNet.broadcastState(cfg.getState());}catch(e){}}
return {
boot:function(c){
cfg=c||{};overlay=$('slop-mp-overlay');card=$('slop-mp-card');if(!overlay||!card){setTimeout(function(){SlopMP.boot(c);},100);return;}
show();renderMenu();
SlopNet.on('lobby',function(m){if(m.t==='start'&&!SlopNet.isHost){started=true;hide();cfg.onStart&&cfg.onStart({players:[{id:myId,name:'You',color:COLORS[1]}],myId:myId,isHost:false});}});
var auto=window.__SLOP_ROOM;if(auto){doJoin(auto);}
},
sendInput:function(input){if(SlopNet.isHost)return;if(SlopNet.sendInput)SlopNet.sendInput(input);},
broadcast:broadcastState,
requestFrame:broadcastState,
isOnline:function(){return started&&myId!=='solo';},
isHost:function(){return SlopNet.isHost;},
myId:function(){return myId;}
};
})();
</scr`+`ipt>`;

// slop netcore — a reusable host-authoritative multiplayer harness.
//
// One import gives any game drop-in rooms over WebRTC (PeerJS): the host runs
// the simulation and broadcasts snapshots; clients send inputs and render what
// they receive. It also carries "live mod" messages so a remix applied by the
// host hot-patches every player's running game with no restart.
//
// import { NetCore } from '../../js/netcore.js';
// const net = new NetCore({ prefix: 'slop-kart' });
// net.on('join', conn => ...); net.on('input', (id, input) => ...);
// net.on('state', snap => ...); net.on('mod', (code, summary) => ...);
// net.host(code => showCode(code)); // or net.join(code, () => ...)
// net.broadcastState(snapshot); // host, ~20Hz
// net.sendInput(input); // client, ~30Hz
// net.broadcastMod(code, summary); // host, on live remix
//
// PeerJS must be loaded on the page (CDN script tag).

export class NetCore {
constructor({ prefix = 'slop' } = {}) {
this.prefix = prefix;
this.peer = null;
this.conn = null; // client → host
this.conns = []; // host → clients
this.isHost = false;
this.roomCode = null;
this.selfId = 'me';
this.handlers = {}; // event → [fn]
this.mods = []; // applied live mods, replayed to late joiners
}

static available() { return typeof window.Peer !== 'undefined'; }

on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
_emit(evt, ...args) { (this.handlers[evt] || []).forEach((f) => { try { f(...args); } catch (e) { console.warn(e); } }); }

host(onCode) {
if (!NetCore.available()) { this._emit('error', 'no-peerjs'); return; }
this.isHost = true;
this.selfId = 'host';
const code = `${this.prefix}-${Math.random().toString(36).slice(2, 7)}`;
this.peer = new window.Peer(code);
this.peer.on('open', (id) => { this.roomCode = id; onCode?.(id); this._emit('open', id); });
this.peer.on('error', (err) => {
if (err.type === 'unavailable-id') { this.peer.destroy(); this.host(onCode); }
else this._emit('error', err.type);
});
this.peer.on('connection', (conn) => {
conn.on('open', () => {
this.conns.push(conn);
// replay active mods so the newcomer matches the room
for (const m of this.mods) conn.send({ t: 'mod', code: m.code, summary: m.summary });
this._emit('join', conn);
});
conn.on('data', (msg) => this._route(conn, msg));
conn.on('close', () => { this.conns = this.conns.filter((c) => c !== conn); this._emit('leave', conn); });
});
}

join(code, onReady) {
if (!NetCore.available()) { this._emit('error', 'no-peerjs'); return; }
this.isHost = false;
this.peer = new window.Peer();
this.peer.on('error', (err) => this._emit('error', err.type));
this.peer.on('open', () => {
this.conn = this.peer.connect(code, { reliable: true });
this.conn.on('open', () => { onReady?.(); this._emit('connected'); });
this.conn.on('data', (msg) => this._route(this.conn, msg));
this.conn.on('close', () => this._emit('disconnected'));
});
}

_route(conn, msg) {
if (!msg || typeof msg !== 'object') return;
switch (msg.t) {
case 'state': this._emit('state', msg.s); break;
case 'input': this._emit('input', conn.peer, msg.i); break;
case 'mod':
if (!this.isHost) this.mods.push({ code: msg.code, summary: msg.summary });
this._emit('mod', msg.code, msg.summary); break;
case 'lobby': this._emit('lobby', msg); break;
case 'msg': this._emit('msg', msg.d); break;
case 'init': this.selfId = msg.id; this._emit('init', msg.id); break;
default: this._emit('data', conn, msg);
}
}

// host helpers
assignId(conn, id) { try { conn.send({ t: 'init', id }); } catch { /* dropped */ } }
broadcastState(snapshot) { this._send({ t: 'state', s: snapshot }); }
broadcastMod(code, summary) {
this.mods.push({ code, summary });
this._send({ t: 'mod', code, summary });
}
broadcastLobby(data) { this._send({ t: 'lobby', ...data }); }
broadcast(msg) { this._send(msg); }
_send(msg) { for (const c of this.conns) if (c.open) { try { c.send(msg); } catch { /* drop */ } } }

// client helpers
sendInput(input) { if (this.conn?.open) this.conn.send({ t: 'input', i: input }); }
send(msg) { if (this.conn?.open) this.conn.send(msg); }

get peerCount() { return this.isHost ? this.conns.length : (this.conn ? 1 : 0); }
shareLink() { return `${location.origin}${location.pathname}?room=${this.roomCode}`; }
destroy() { try { this.peer?.destroy(); } catch { /* gone */ } this.peer = null; this.conn = null; this.conns = []; }
}

// A self-contained version of the harness, as a string, to inline into
// AI-generated single-file games (which can't import modules). Exposes the
// same shape on window.SlopNet. Studio injects this when a game wants multiplayer.
export const SLOPNET_INLINE = `
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></scr`+`ipt>
<script>
window.SlopNet = (function(){
var h={}, peer=null, conn=null, conns=[], isHost=false, code=null, selfId='me', mods=[];
function emit(e){var a=[].slice.call(arguments,1);(h[e]||[]).forEach(function(f){try{f.apply(null,a)}catch(x){}});}
function route(c,m){ if(!m||typeof m!=='object')return;
if(m.t==='state')emit('state',m.s); else if(m.t==='input')emit('input',c.peer,m.i);
else if(m.t==='mod'){ if(!isHost)mods.push(m); emit('mod',m.code,m.summary); }
else if(m.t==='init'){selfId=m.id;emit('init',m.id);} else emit('data',c,m); }
return {
available:function(){return typeof Peer!=='undefined';},
on:function(e,f){(h[e]=h[e]||[]).push(f);return this;},
host:function(cb){ if(typeof Peer==='undefined'){emit('error','no-peerjs');return;} isHost=true;selfId='host';
code='slopnet-'+Math.random().toString(36).slice(2,7); peer=new Peer(code);
peer.on('open',function(id){code=id;cb&&cb(id);emit('open',id);});
peer.on('error',function(e){emit('error',e.type);});
peer.on('connection',function(c){ c.on('open',function(){conns.push(c);mods.forEach(function(m){c.send(m)});emit('join',c);});
c.on('data',function(m){route(c,m);}); c.on('close',function(){conns=conns.filter(function(x){return x!==c});emit('leave',c);}); }); },
join:function(rc,cb){ if(typeof Peer==='undefined'){emit('error','no-peerjs');return;} isHost=false; peer=new Peer();
peer.on('error',function(e){emit('error',e.type);});
peer.on('open',function(){ conn=peer.connect(rc,{reliable:true});
conn.on('open',function(){cb&&cb();emit('connected');}); conn.on('data',function(m){route(conn,m);});
conn.on('close',function(){emit('disconnected');}); }); },
assignId:function(c,id){try{c.send({t:'init',id:id})}catch(e){}},
broadcastState:function(s){conns.forEach(function(c){if(c.open)try{c.send({t:'state',s:s})}catch(e){}});},
broadcastMod:function(code,summary){mods.push({t:'mod',code:code,summary:summary});conns.forEach(function(c){if(c.open)c.send({t:'mod',code:code,summary:summary})});},
sendInput:function(i){if(conn&&conn.open)conn.send({t:'input',i:i});},
get isHost(){return isHost;}, get peerCount(){return isHost?conns.length:(conn?1:0);},
shareLink:function(){return location.origin+location.pathname+'?room='+code;}, roomCode:function(){return code;}
};
})();
</scr`+`ipt>`;

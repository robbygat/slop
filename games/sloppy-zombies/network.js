// Multiplayer sync over WebRTC data channels via PeerJS (loaded from CDN).
//
// Host flow: new Peer(shortId) → display room code → accept connections →
// receive client inputs at 30hz, broadcast full state at 20hz.
// Client flow: new Peer() → connect(roomCode) → send inputs, render states.
// Host is authoritative — clients simulate nothing.

export class Net {
constructor(handlers = {}) {
this.handlers = handlers; // { onJoin, onLeave, onData, onError }
this.peer = null;
this.conn = null; // client → host connection
this.conns = []; // host's client connections
this.isHost = false;
this.roomCode = null;
}

static available() {
return typeof window.Peer !== 'undefined';
}

host(onCode) {
this.isHost = true;
const code = 'slop-sz-' + Math.random().toString(36).slice(2, 7);
this.peer = new window.Peer(code);

this.peer.on('open', (id) => {
this.roomCode = id;
onCode(id);
});
this.peer.on('error', (err) => {
// id collision → retry with a fresh code
if (err.type === 'unavailable-id') {
this.peer.destroy();
this.host(onCode);
} else {
this.handlers.onError?.(err.type);
}
});
this.peer.on('connection', (conn) => {
conn.on('open', () => {
this.conns.push(conn);
this.handlers.onJoin?.(conn);
});
conn.on('data', (data) => this.handlers.onData?.(conn, data));
conn.on('close', () => {
this.conns = this.conns.filter((c) => c !== conn);
this.handlers.onLeave?.(conn);
});
});
}

join(code, onOpen) {
this.isHost = false;
this.peer = new window.Peer();

this.peer.on('error', (err) => this.handlers.onError?.(err.type));
this.peer.on('open', () => {
this.conn = this.peer.connect(code);
this.conn.on('open', () => onOpen());
this.conn.on('data', (data) => this.handlers.onData?.(this.conn, data));
this.conn.on('close', () => this.handlers.onLeave?.(this.conn));
});
}

broadcast(msg) {
for (const c of this.conns) {
if (c.open) c.send(msg);
}
}

send(msg) {
if (this.conn?.open) this.conn.send(msg);
}

destroy() {
try { this.peer?.destroy(); } catch { /* already gone */ }
this.peer = null;
this.conn = null;
this.conns = [];
}
}

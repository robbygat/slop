// Minimal zero-dependency ZIP writer (STORE method, no compression).
// Enough to download a whole game folder as one .zip from the browser.
// makeZip([{ name:'index.html', data:'...' }, { name:'sprites/p.png', data:Uint8Array }]) → Blob

const enc = new TextEncoder();

const CRC = (() => {
const t = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
return t;
})();
function crc32(buf) {
let c = 0xFFFFFFFF;
for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
return (c ^ 0xFFFFFFFF) >>> 0;
}
const toBytes = (d) => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));

export function makeZip(files) {
const chunks = [];
const central = [];
let offset = 0;
for (const f of files) {
const name = enc.encode(f.name);
const data = toBytes(f.data);
const crc = crc32(data);
const local = new Uint8Array(30 + name.length);
const dv = new DataView(local.buffer);
dv.setUint32(0, 0x04034b50, true); // local file header sig
dv.setUint16(4, 20, true); // version
dv.setUint16(6, 0, true); // flags
dv.setUint16(8, 0, true); // method = store
dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); // time/date
dv.setUint32(14, crc, true);
dv.setUint32(18, data.length, true); // compressed
dv.setUint32(22, data.length, true); // uncompressed
dv.setUint16(26, name.length, true);
dv.setUint16(28, 0, true);
local.set(name, 30);
chunks.push(local, data);

const cen = new Uint8Array(46 + name.length);
const cv = new DataView(cen.buffer);
cv.setUint32(0, 0x02014b50, true);
cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
cv.setUint16(10, 0, true); cv.setUint16(12, 0, true);
cv.setUint32(16, crc, true);
cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
cv.setUint16(28, name.length, true);
cv.setUint32(42, offset, true);
cen.set(name, 46);
central.push(cen);
offset += local.length + data.length;
}
let cenSize = 0;
for (const c of central) cenSize += c.length;
const end = new Uint8Array(22);
const ev = new DataView(end.buffer);
ev.setUint32(0, 0x06054b50, true);
ev.setUint16(8, files.length, true);
ev.setUint16(10, files.length, true);
ev.setUint32(12, cenSize, true);
ev.setUint32(16, offset, true);
return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

// data:URL → Uint8Array (for sprite PNG/JPEG bytes)
export function dataUrlToBytes(dataUrl) {
const b64 = dataUrl.split(',')[1] || '';
const bin = atob(b64);
const out = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
return out;
}

export function downloadBlob(blob, filename) {
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = filename;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(url), 2000);
}

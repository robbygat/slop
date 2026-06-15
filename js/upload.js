// Upload from repo — for real. Drop (or pick) your game's files: a single
// self-contained .html works instantly; an index.html plus local .js/.css
// files gets inline-bundled right here in the browser. The build is
// crash-tested in the hidden sandbox, lands in your grid, and is publishable
// to the community like any cooked game.

import { testGameHTML } from './sandbox.js';
import { addCookedGame } from './games-grid.js';
import { showToast } from './toast.js';

const $ = (id) => document.getElementById(id);

// inline local <script src> / <link href> references using the dropped file set
function bundle(indexHTML, files) {
let html = indexHTML;
html = html.replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*)><\/script>/gi, (m, pre, src, post) => {
if (/^https?:|^\/\//i.test(src)) return m; // leave CDN scripts alone
const name = src.split('/').pop();
const body = files.get(name);
if (body == null) return m;
const keepType = /type=["']module["']/.test(pre + post) ? ' type="module"' : '';
return `<script${keepType}>\n${body.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
});
html = html.replace(/<link([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (m, pre, href) => {
if (/^https?:|^\/\//i.test(href)) return m;
const name = href.split('/').pop();
const body = files.get(name);
if (body == null) return m;
return `<style>\n${body}\n</style>`;
});
return html;
}

async function handleFiles(fileList) {
const status = $('upload-status');
const files = [...fileList].filter((f) =>
/\.(html?|js|css|json|txt)$/i.test(f.name) && f.size < 4 * 1024 * 1024);

if (!files.length) {
status.textContent = '! drop .html / .js / .css files (HTML5 builds). Unity/Godot exports: drop the built .html bundle.';
return;
}

status.textContent = 'reading files…';
const contents = new Map();
for (const f of files) contents.set(f.name, await f.text());

const htmlName = [...contents.keys()].find((n) => /^index\.html?$/i.test(n))
|| [...contents.keys()].find((n) => /\.html?$/i.test(n));
if (!htmlName) {
status.textContent = '! no .html entry file found — include your index.html';
return;
}

status.textContent = contents.size > 1 ? 'bundling files into one build…' : 'preparing build…';
const html = contents.size > 1 ? bundle(contents.get(htmlName), contents) : contents.get(htmlName);

status.textContent = 'crash-testing your build…';
const test = await testGameHTML(html);
if (!test.ok) {
status.textContent = `! the build crashed in testing (${test.error}) — note: uploads run sandboxed, so localStorage isn't available`;
return;
}

const name = htmlName.replace(/\.html?$/i, '').replace(/[-_]/g, ' ').trim() || 'uploaded game';
const game = addCookedGame({
id: `upload-${Math.random().toString(36).slice(2, 8)}`,
name: name === 'index' ? 'My Uploaded Game' : name,
desc: 'uploaded from a repo — crash-tested and live',
html,
thumb: test.thumb,
uploaded: true,
createdAt: Date.now(),
});

status.innerHTML = `OK <b>${game.name}</b> is live in your grid — <a href="play.html?id=${encodeURIComponent(game.id)}">play it</a>, remix it, publish it`;
showToast(`${game.name} uploaded — it's in the grid`);
document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' });
}

export function initUpload() {
const zone = $('upload-zone');
const input = $('upload-input');
if (!zone || !input) return;

zone.addEventListener('click', () => input.click());
input.addEventListener('change', () => { if (input.files.length) handleFiles(input.files); });

for (const ev of ['dragover', 'dragenter']) {
zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); });
}
for (const ev of ['dragleave', 'drop']) {
zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); });
}
zone.addEventListener('drop', (e) => {
if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
});
}

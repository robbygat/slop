// Player, enemies, projectiles, pickups, and the rare-item pool.

import { W, H, WALL, drawPlayerSprite, drawEnemySprite, sfx } from './assets.js';

// ---------------------------------------------------------------- player

export class Player {
constructor(id, color, name = 'hero') {
this.id = id;
this.color = color;
this.name = name;
this.isPlayer = true;
this.x = W / 2;
this.y = H / 2;
this.r = 14;
this.aim = 0;
this.alive = true;
this.coins = 0;
this.iframes = 0;
this.fireCd = 0;
this.input = { up: false, down: false, left: false, right: false, aim: 0, shoot: false };
this.resetStats();
}

resetStats() {
this.maxHp = 3;
this.hp = 3;
this.speed = 185;
this.damage = 1;
this.fireRate = 2.6; // shots per second
this.tearSize = 5;
this.tearSpeed = 430;
this.multishot = 1;
this.pierce = false;
}

get inv() { return this.iframes > 0; }

update(dt, game) {
if (!this.alive) return;
this.iframes = Math.max(0, this.iframes - dt);
this.fireCd = Math.max(0, this.fireCd - dt);

let dx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
let dy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
if (dx || dy) {
const m = Math.hypot(dx, dy);
this.x += (dx / m) * this.speed * dt;
this.y += (dy / m) * this.speed * dt;
}
this.aim = this.input.aim;
game.clampToRoom(this);

if (this.input.shoot && this.fireCd <= 0) this.shoot(game);
}

shoot(game) {
this.fireCd = 1 / this.fireRate;
const n = this.multishot;
for (let i = 0; i < n; i++) {
const a = this.aim + (i - (n - 1) / 2) * 0.17;
game.projectiles.push(new Projectile(
this.x, this.y,
Math.cos(a) * this.tearSpeed, Math.sin(a) * this.tearSpeed,
this.tearSize, this.damage, true, this.pierce
));
}
sfx.shoot();
}

hurt(game) {
if (this.iframes > 0 || !this.alive) return;
this.hp -= 1;
this.iframes = 1.5;
game.shake = 0.25;
sfx.hurt();
if (this.hp <= 0) {
this.alive = false;
game.onPlayerDeath(this);
}
}

draw(ctx, t) { drawPlayerSprite(ctx, this, t); }
}

// ---------------------------------------------------------------- enemies

class Enemy {
constructor(type, x, y, floor) {
this.type = type;
this.x = x;
this.y = y;
this.floor = floor;
this.flash = 0;
this.touch = 1;
this.t = Math.random() * 10; // personal clock for desynced wiggles
}

takeHit(dmg) {
this.hp -= dmg;
this.flash = 0.12;
sfx.hit();
}

draw(ctx, t) { drawEnemySprite(ctx, this, t); }
}

class Fly extends Enemy {
constructor(x, y, f) {
super('fly', x, y, f);
this.r = 10;
this.hp = 2 + Math.floor(f / 2);
this.maxHp = this.hp;
this.speed = 58 + f * 5;
}
update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
const p = game.nearestPlayer(this);
if (!p) return;
const a = Math.atan2(p.y - this.y, p.x - this.x) + Math.sin(this.t * 5) * 0.75;
this.x += Math.cos(a) * this.speed * dt;
this.y += Math.sin(a) * this.speed * dt;
game.clampToRoom(this);
}
}

class Gaper extends Enemy {
constructor(x, y, f) {
super('gaper', x, y, f);
this.r = 14;
this.hp = 4 + f;
this.maxHp = this.hp;
this.speed = 62 + f * 4;
this.charging = false;
this.chargeT = 0;
this.chargeCd = 1.5;
this.cvx = 0;
this.cvy = 0;
}
update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
const p = game.nearestPlayer(this);
if (!p) return;

if (this.charging) {
this.chargeT -= dt;
this.x += this.cvx * dt;
this.y += this.cvy * dt;
if (this.chargeT <= 0) { this.charging = false; this.chargeCd = 2.2; }
} else {
this.chargeCd -= dt;
const dx = p.x - this.x;
const dy = p.y - this.y;
// lined up with the player → charge in a straight cardinal line
if (this.chargeCd <= 0 && (Math.abs(dx) < 26 || Math.abs(dy) < 26) && Math.hypot(dx, dy) < 360) {
this.charging = true;
this.chargeT = 0.55;
if (Math.abs(dx) < 26) { this.cvx = 0; this.cvy = Math.sign(dy) * 330; }
else { this.cvx = Math.sign(dx) * 330; this.cvy = 0; }
} else {
const a = Math.atan2(dy, dx);
this.x += Math.cos(a) * this.speed * dt;
this.y += Math.sin(a) * this.speed * dt;
}
}
game.clampToRoom(this);
}
}

class Spider extends Enemy {
constructor(x, y, f) {
super('spider', x, y, f);
this.r = 11;
this.hp = 3 + Math.floor(f / 2);
this.maxHp = this.hp;
this.speed = 150 + f * 6;
this.retarget = 0;
this.dir = Math.random() * Math.PI * 2;
this.spawnsOnDeath = true;
}
update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
this.retarget -= dt;
if (this.retarget <= 0) {
this.retarget = 0.3 + Math.random() * 0.25;
const p = game.nearestPlayer(this);
if (p && Math.random() < 0.65) {
this.dir = Math.atan2(p.y - this.y, p.x - this.x) + (Math.random() - 0.5) * 1.6;
} else {
this.dir = Math.random() * Math.PI * 2;
}
}
this.x += Math.cos(this.dir) * this.speed * dt;
this.y += Math.sin(this.dir) * this.speed * dt;
game.clampToRoom(this);
}
}

class FatBat extends Enemy {
constructor(x, y, f) {
super('fatbat', x, y, f);
this.r = 17;
this.hp = 6 + f * 2;
this.maxHp = this.hp;
this.orbitA = Math.random() * Math.PI * 2;
this.dropsItem = true;
}
update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
const p = game.nearestPlayer(this);
if (!p) return;
// swoop: orbit the player on a breathing radius
this.orbitA += dt * 1.35;
const orbitR = 110 + Math.sin(this.t * 1.6) * 75;
const tx = p.x + Math.cos(this.orbitA) * orbitR;
const ty = p.y + Math.sin(this.orbitA) * orbitR;
const a = Math.atan2(ty - this.y, tx - this.x);
this.x += Math.cos(a) * 135 * dt;
this.y += Math.sin(a) * 135 * dt;
game.clampToRoom(this);
}
}

class Monstro extends Enemy {
constructor(x, y, f) {
super('monstro', x, y, f);
this.name = 'MONSTRO';
this.r = 46;
this.hp = 60 + (f - 1) * 25;
this.maxHp = this.hp;
this.touch = 1;
this.isBoss = true;
this.hopCd = 1.6;
this.hopT = 0; // >0 while airborne (drives squash anim)
this.hvx = 0;
this.hvy = 0;
}

get phase() {
const f = this.hp / this.maxHp;
return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
}

update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);

if (this.hopT > 0) {
this.hopT -= dt;
this.x += this.hvx * dt;
this.y += this.hvy * dt;
if (this.hopT <= 0) this.land(game);
} else {
this.hopCd -= dt;
if (this.hopCd <= 0) {
const p = game.nearestPlayer(this);
if (!p) return;
const a = Math.atan2(p.y - this.y, p.x - this.x);
const speed = this.phase === 3 ? 330 : 260;
this.hvx = Math.cos(a) * speed;
this.hvy = Math.sin(a) * speed;
this.hopT = 0.5;
this.hopCd = this.phase === 3 ? 0.85 : this.phase === 2 ? 1.2 : 1.5;
}
}
game.clampToRoom(this);
}

land(game) {
game.shake = Math.max(game.shake, 0.2);
const p = game.nearestPlayer(this);
if (!p) return;
const aimAt = Math.atan2(p.y - this.y, p.x - this.x);
if (this.phase >= 2) {
// spread shot at the player
for (let i = -2; i <= 2; i++) game.spawnEnemyShot(this.x, this.y, aimAt + i * 0.22, 200);
sfx.eshoot();
}
if (this.phase === 3) {
// radial burst
for (let i = 0; i < 8; i++) game.spawnEnemyShot(this.x, this.y, (i / 8) * Math.PI * 2, 150);
}
}
}

class DukeOfFlies extends Enemy {
constructor(x, y, f) {
super('duke', x, y, f);
this.name = 'DUKE OF FLIES';
this.r = 40;
this.hp = 55 + (f - 1) * 22;
this.maxHp = this.hp;
this.isBoss = true;
this.orbitA = Math.random() * Math.PI * 2;
this.spawnCd = 2.2;
this.spitCd = 3;
}

get phase() { return this.hp / this.maxHp > 0.5 ? 1 : 2; }

update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
const p = game.nearestPlayer(this);
if (!p) return;

// lazy drift in a wide circle around the room center, leaning at the player
this.orbitA += dt * (this.phase === 2 ? 0.9 : 0.55);
const tx = 400 + Math.cos(this.orbitA) * 190 + (p.x - 400) * 0.18;
const ty = 300 + Math.sin(this.orbitA) * 130 + (p.y - 300) * 0.18;
const a = Math.atan2(ty - this.y, tx - this.x);
const speed = this.phase === 2 ? 95 : 65;
this.x += Math.cos(a) * speed * dt;
this.y += Math.sin(a) * speed * dt;

// belch out flies
this.spawnCd -= dt;
if (this.spawnCd <= 0 && game.enemies.length < 26) {
this.spawnCd = this.phase === 2 ? 2.4 : 3.6;
game.enemies.push(makeEnemy('fly', this.x - 20, this.y + 10, this.floor));
if (this.phase === 2) game.enemies.push(makeEnemy('fly', this.x + 20, this.y + 10, this.floor));
}

// phase 2: occasional radial spit
if (this.phase === 2) {
this.spitCd -= dt;
if (this.spitCd <= 0) {
this.spitCd = 2.6;
for (let i = 0; i < 6; i++) {
game.spawnEnemyShot(this.x, this.y, (i / 6) * Math.PI * 2 + this.orbitA, 160);
}
}
}
game.clampToRoom(this);
}
}

class Husk extends Enemy {
constructor(x, y, f) {
super('husk', x, y, f);
this.name = 'THE HUSK';
this.r = 42;
this.hp = 70 + (f - 1) * 28;
this.maxHp = this.hp;
this.isBoss = true;
this.charging = false;
this.chargeT = 0;
this.chargeCd = 1.8;
this.cvx = 0;
this.cvy = 0;
this.summonCd = 6;
}

get phase() {
const fr = this.hp / this.maxHp;
return fr > 0.66 ? 1 : fr > 0.33 ? 2 : 3;
}

update(dt, game) {
this.t += dt;
this.flash = Math.max(0, this.flash - dt);
const p = game.nearestPlayer(this);
if (!p) return;

if (this.charging) {
this.chargeT -= dt;
this.x += this.cvx * dt;
this.y += this.cvy * dt;
if (this.chargeT <= 0) {
this.charging = false;
this.chargeCd = this.phase === 3 ? 1.1 : 1.9;
game.shake = Math.max(game.shake, 0.25);
// slam burst aimed at the player
const aimAt = Math.atan2(p.y - this.y, p.x - this.x);
const n = this.phase >= 2 ? 8 : 5;
for (let i = 0; i < n; i++) {
game.spawnEnemyShot(this.x, this.y, aimAt + (i - (n - 1) / 2) * 0.3, 170);
}
}
} else {
this.chargeCd -= dt;
const a = Math.atan2(p.y - this.y, p.x - this.x);
this.x += Math.cos(a) * 42 * dt;
this.y += Math.sin(a) * 42 * dt;
if (this.chargeCd <= 0) {
this.charging = true;
this.chargeT = 0.6;
const speed = this.phase === 3 ? 380 : 300;
this.cvx = Math.cos(a) * speed;
this.cvy = Math.sin(a) * speed;
}
}

// phase 3: raise gapers
if (this.phase === 3) {
this.summonCd -= dt;
if (this.summonCd <= 0 && game.enemies.length < 24) {
this.summonCd = 5.5;
game.enemies.push(makeEnemy('gaper', this.x - 50, this.y, this.floor));
game.enemies.push(makeEnemy('gaper', this.x + 50, this.y, this.floor));
}
}
game.clampToRoom(this);
}
}

export const ENEMY_TYPES = {
fly: Fly, gaper: Gaper, spider: Spider, fatbat: FatBat,
monstro: Monstro, duke: DukeOfFlies, husk: Husk,
};

export const BOSS_ROTATION = ['monstro', 'duke', 'husk'];

export const BOSS_NAMES = { monstro: 'MONSTRO', duke: 'DUKE OF FLIES', husk: 'THE HUSK' };

export function makeEnemy(type, x, y, floor) {
return new ENEMY_TYPES[type](type === 'monstro' ? x : x, y, floor);
}

// ---------------------------------------------------------------- projectiles

export class Projectile {
constructor(x, y, vx, vy, r, damage, friendly, pierce = false) {
this.x = x;
this.y = y;
this.vx = vx;
this.vy = vy;
this.r = r;
this.damage = damage;
this.friendly = friendly;
this.pierce = pierce;
this.hitIds = pierce ? new Set() : null;
this.dead = false;
}
update(dt) {
this.x += this.vx * dt;
this.y += this.vy * dt;
if (this.x < WALL - 8 || this.x > W - WALL + 8 || this.y < WALL - 8 || this.y > H - WALL + 8) {
this.dead = true;
}
}
}

// ---------------------------------------------------------------- pickups

export class Pickup {
constructor(x, y, kind) {
this.x = x;
this.y = y;
this.kind = kind;
this.r = 14;
}
}

export function randomDrop() {
const roll = Math.random();
if (roll < 0.28) return 'heart';
if (roll < 0.56) return 'coin';
if (roll < 0.71) return 'speed';
if (roll < 0.86) return 'damage';
return 'firerate';
}

// ---------------------------------------------------------------- rare items

export const ITEM_POOL = [
{
id: 'big-tears', name: 'Big Tears',
desc: 'tear size +60%, damage +25%',
apply(p) { p.tearSize *= 1.6; p.damage *= 1.25; },
},
{
id: 'caffeine', name: 'Caffeine Rush',
desc: 'speed +30%, fire rate +15%',
apply(p) { p.speed *= 1.3; p.fireRate *= 1.15; },
},
{
id: 'glass-cannon', name: 'Glass Cannon',
desc: 'damage +100%',
apply(p) { p.damage *= 2; },
},
{
id: 'extra-heart', name: 'Extra Heart',
desc: '+1 max HP, full heal',
apply(p) { p.maxHp += 1; p.hp = p.maxHp; },
},
{
id: 'triple-shot', name: 'Triple Shot',
desc: 'fire 3 tears in a spread, damage -25%',
apply(p) { p.multishot = Math.min(5, p.multishot + 2); p.damage *= 0.75; },
},
{
id: 'piercing', name: 'Piercing Tears',
desc: 'tears pass through enemies',
apply(p) { p.pierce = true; },
},
{
id: 'rapid-fire', name: 'Rapid Fire',
desc: 'fire rate +50%',
apply(p) { p.fireRate *= 1.5; },
},
{
id: 'sniper', name: 'Long Range',
desc: 'tear speed +50%, damage +20%',
apply(p) { p.tearSpeed *= 1.5; p.damage *= 1.2; },
},
{
id: 'brimstone-brew', name: 'Brimstone Brew',
desc: 'damage +80%, fire rate -20%',
apply(p) { p.damage *= 1.8; p.fireRate *= 0.8; },
},
{
id: 'feather-boots', name: 'Feather Boots',
desc: 'speed +45%',
apply(p) { p.speed *= 1.45; },
},
{
id: 'stone-tears', name: 'Stone Tears',
desc: 'huge slow tears, damage +40%',
apply(p) { p.tearSize *= 2; p.tearSpeed *= 0.8; p.damage *= 1.4; },
},
{
id: 'cursed-eye', name: 'Cursed Eye',
desc: '+1 shot, but -1 max HP',
apply(p) {
p.multishot = Math.min(5, p.multishot + 1);
p.maxHp = Math.max(1, p.maxHp - 1);
p.hp = Math.min(p.hp, p.maxHp);
},
},
{
id: 'spread-doctrine', name: 'Spread Doctrine',
desc: '+1 shot, fire rate +10%',
apply(p) { p.multishot = Math.min(5, p.multishot + 1); p.fireRate *= 1.1; },
},
{
id: 'adrenaline', name: 'Adrenaline',
desc: 'speed +25%, damage +20%',
apply(p) { p.speed *= 1.25; p.damage *= 1.2; },
},
{
id: 'iron-skin', name: 'Iron Skin',
desc: '+2 max HP, speed -10%',
apply(p) { p.maxHp += 2; p.hp += 2; p.speed *= 0.9; },
},
{
id: 'soul-siphon', name: 'Soul Siphon',
desc: 'full heal, damage +15%',
apply(p) { p.hp = p.maxHp; p.damage *= 1.15; },
},
];

export function rollItemChoices(n = 3) {
const pool = [...ITEM_POOL];
const out = [];
while (out.length < n && pool.length) {
out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
}
return out;
}

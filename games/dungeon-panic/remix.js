// DUNGEON PANIC — live remix, powered by the shared SLOP.game remix dock.
// The dock sits BESIDE the game (never covering it), reads the real source,
// and applies Grok-written patches to the running game. In multiplayer the
// host's mods are broadcast to the whole room (see game.js mod sync).

import { mountRemixDock } from '../../js/remix-dock.js';

mountRemixDock({
gameId: 'dungeon-panic',
title: 'remix dungeon panic — live',
apiName: 'DP',
getApi: () => window.DP,
sources: ['entities.js', 'game.js'],
storageKey: 'dp-live-mods',
shell: '#shell',
chips: [
'make my tears huge and rainbow colored',
'double all enemy speed',
'give me 10 max hearts',
'flies explode into bullets when they die',
'add an item that makes tears homing',
'bosses drop 50 coins',
],
describe: `"Dungeon Panic" — a top-down twin-stick canvas roguelike (Isaac-style): procedural floors, rooms with doors, 5 enemy types, 3 rotating bosses, a blessing/item pool, hearts, coins, and host-authoritative co-op multiplayer.
THE DP OBJECT (your entire modding surface):
- DP.game — live state: { state, mode, floorNum, floor, room, players[], enemies[], projectiles[], score, kills, shake, t, paused, choice } plus helpers nearestPlayer(e), clampToRoom(ent), spawnEnemyShot(x,y,angle,speed). game.room has { doors, cleared, type, pickups[], spawns[] }.
- DP.Player — player class, prototype patchable. resetStats() defines base stats (maxHp, hp, speed, damage, fireRate, tearSize, tearSpeed, multishot, pierce). shoot(game), hurt(game), update(dt, game), draw(ctx, t).
- DP.ENEMY_TYPES — { fly, gaper, spider, fatbat, monstro, duke, husk } actual classes; prototypes patchable (update, takeHit, draw, land...). monstro/duke/husk are bosses (isBoss=true, rotate by floor).
- DP.Projectile (x, y, vx, vy, r, damage, friendly, pierce) and DP.Pickup (x, y, kind) — kinds: heart, coin, speed, damage, firerate, item, trapdoor.
- DP.ITEM_POOL — mutable array of items { id, name, desc, apply(p) }; push new ones to add them to the blessing pool.
- DP.makeEnemy(type, x, y, floor), DP.rollItemChoices(n), DP.randomDrop().
- DP.sfx — reassignable sound functions. DP.gameMsg(text) — on-screen banner. DP.consts — { W: 800, H: 600, WALL: 48, DOOR: 88, PLAYER_COLORS }.
- DP.hooks — render override points checked every frame: hooks.drawRoom(ctx, room, t), hooks.drawPickup(ctx, pk, t), hooks.drawProjectile(ctx, pr), hooks.postRender(ctx, game). USE THESE for visual changes to projectiles/pickups/room (the engine calls its internal draw functions directly otherwise). Player/enemy visuals: override DP.Player.prototype.draw / DP.ENEMY_TYPES.*.prototype.draw.
- DP.assets — original { drawRoom, drawPlayerSprite, drawEnemySprite, drawProjectile, drawPickup } to call from hooks when decorating defaults.
- In multiplayer the HOST simulates everything; the dock shares applied mods with the room automatically.`,
smokeTest(DP) {
const probe = new DP.Player('__probe__', '#fff');
probe.resetStats();
for (const type of Object.keys(DP.ENEMY_TYPES)) DP.makeEnemy(type, 100, 100, 1);
},
});

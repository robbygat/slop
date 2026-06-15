// RUN 3 — live remix via the shared slop.game dock. Sits beside the game, reads
// the real source, applies Grok-written patches to the running game with no
// reload. In a race the host's mods broadcast to the room (see game.js shareMod).

import { mountRemixDock } from '../../js/remix-dock.js';

mountRemixDock({
gameId: 'run3',
title: 'remix run 3 — live',
apiName: 'R3',
getApi: () => window.R3,
sources: ['game.js'],
storageKey: 'run3-live-mods',
shell: '#shell',
chips: [
'double the run speed',
'make the tunnel rainbow colored',
'way more holes and gaps',
'giant low gravity moon jumps',
'tons of orbs everywhere',
'make the player a glowing neon blob',
],
describe: `"Run 3" — a gravity TUBE runner on <canvas>. You auto-run along the inside of a tunnel; A/D rotate you around the cross-section (whatever surface is under you is "down", so the camera spins to keep you at the bottom); SPACE jumps across the gaps. The safe platform is a winding ribbon that narrows the further you run. Two players race the same SEEDED tunnel side by side.
THE R3 OBJECT (your whole modding surface):
- R3.cfg — live tunables: SEG (tiles around the ring), BASE_R/FOCAL/ROWLEN/DEPTH (the perspective tube), jumpInward, runnerSpeed, skaterSpeed, rampPer1000, gravity, jumpV, angAccel/angFriction/angMax (rotation), fallDeath, finish (race metres), doubleUnlockAt, shrink (how fast the platform narrows), difficultyOver. Mutate for instant feel changes (e.g. R3.cfg.gravity *= 0.4; R3.cfg.shrink = 0.2 for a wider easier path).
- R3.game — live run state: { state, mode, char, dist, ang, viewRot, h, vy, onGround, alive, orbs, remote, ... }.
- R3.colors — { solid, solidEdge, player, playerLine, orb, ghost }. Reassign for recolours.
- LEVEL GEN (patchable): R3.segHole(row,seg)→bool and R3.tileSolid(row,seg)→bool decide the tunnel; R3.pathCenter(row)→radians is the centre of the safe ribbon; R3.safeHalf(row)→segments is its half-width (shrinks with R3.difficulty(row)); R3.orbAt(row)→seg|null places orbs. Wrap these to reshape the course.
- R3.project(ang, z, h) → {x,y,s} — the tube projector (segment angle, depth, jump height → screen). R3.consts = { W:800, H:600, SEG }.
- R3.hooks.postRender(ctx, game) — runs every frame after the tube + players draw; add overlays/effects here.
- R3.sfx — { jump, land, orb, die } reassignable sound fns. R3.gameMsg(text) — on-screen banner.
- In a multiplayer race the HOST broadcasts applied mods to the room automatically.`,
smokeTest(R3) {
R3.tileSolid(20, 4);
R3.pathCenter(20);
R3.project(0, 0, 0);
},
});

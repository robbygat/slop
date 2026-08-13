(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const PALETTES = [
    { id: 'tangerine', name: 'Tangerine', glow: '#FFE9BE', light: '#FFB13B', mid: '#FF8A22', deep: '#F4561D', shade: '#B8300F', ink: '#3B1206', cheek: '#FF7595' },
    { id: 'grape', name: 'Grape', glow: '#F0E2FF', light: '#C79BFF', mid: '#9A5CF6', deep: '#7431DC', shade: '#45178F', ink: '#260A4D', cheek: '#FF7595' },
    { id: 'mint', name: 'Mint', glow: '#E4FFF0', light: '#9BF3C6', mid: '#48DC96', deep: '#15B36D', shade: '#067044', ink: '#043723', cheek: '#FF7595' },
    { id: 'bubblegum', name: 'Bubblegum', glow: '#FFE7F1', light: '#FFAAD0', mid: '#FF6FAE', deep: '#EF3B88', shade: '#A8145B', ink: '#4E0526', cheek: '#FF4F93' },
    { id: 'blueberry', name: 'Blueberry', glow: '#E0F0FF', light: '#93C6FF', mid: '#4A93FF', deep: '#2B6BFF', shade: '#123C86', ink: '#0A2050', cheek: '#FF7595' },
    { id: 'lime', name: 'Lime', glow: '#F8FFD8', light: '#DDF97C', mid: '#AEE62E', deep: '#7CBB10', shade: '#477207', ink: '#243C03', cheek: '#FF7595' },
    { id: 'aqua', name: 'Aqua', glow: '#DFFCFF', light: '#8AEBF7', mid: '#32C8DF', deep: '#0E9ABB', shade: '#055C74', ink: '#03303E', cheek: '#FF7595' },
    { id: 'void', name: 'Void', glow: '#B7C0D6', light: '#6E778C', mid: '#434B5C', deep: '#272C38', shade: '#12151C', ink: '#05070B', cheek: '#7E6BFF' },
    { id: 'peach', name: 'Peach', glow: '#FFEFE2', light: '#FFC2A3', mid: '#FF9670', deep: '#EE6A45', shade: '#A83C23', ink: '#4A1608', cheek: '#FF7595' },
    { id: 'lavender', name: 'Lavender', glow: '#F6EFFF', light: '#D4BEFF', mid: '#B295F0', deep: '#8E6BD6', shade: '#573C91', ink: '#2C1B52', cheek: '#FF7595' },
    { id: 'ember', name: 'Ember', glow: '#FFD9B0', light: '#FF8B5E', mid: '#F4522E', deep: '#C42714', shade: '#751007', ink: '#3A0703', cheek: '#FF7595' },
    { id: 'butter', name: 'Butter', glow: '#FFFBE0', light: '#FFEB8F', mid: '#FFD43B', deep: '#E0AC00', shade: '#8F6C00', ink: '#453200', cheek: '#FF7595' },
    { id: 'rose', name: 'Rose', glow: '#FFEDF2', light: '#FFB3C6', mid: '#F5789B', deep: '#D34A72', shade: '#8C2145', ink: '#430F21', cheek: '#FF7595' },
    { id: 'slate', name: 'Slate', glow: '#E8EEF6', light: '#AEBDD1', mid: '#7A8CA5', deep: '#52627A', shade: '#2C3646', ink: '#151C26', cheek: '#FF7595' },
    { id: 'toxic', name: 'Toxic', glow: '#EBFFC7', light: '#B6FF4D', mid: '#7BE800', deep: '#4EA800', shade: '#2A6100', ink: '#162F00', cheek: '#D6FF6B' },
    { id: 'ultraviolet', name: 'Ultraviolet', glow: '#EBD6FF', light: '#B07BFF', mid: '#7A3BE8', deep: '#4A15A8', shade: '#250459', ink: '#12002E', cheek: '#00E5FF' },
    { id: 'seafoam', name: 'Seafoam', glow: '#EAFFF8', light: '#A8F0DC', mid: '#5FD6B8', deep: '#27A98A', shade: '#0F6552', ink: '#063228', cheek: '#FF7595' },
    { id: 'cherry', name: 'Cherry', glow: '#FFE0E0', light: '#FF8A8A', mid: '#F04848', deep: '#C01F1F', shade: '#750B0B', ink: '#3B0303', cheek: '#FF7595' },
    { id: 'porcelain', name: 'Porcelain', glow: '#FFFFFF', light: '#F3F1EC', mid: '#DDD9D0', deep: '#B9B3A6', shade: '#8A8478', ink: '#3A362E', cheek: '#FF7595' },
    { id: 'cocoa', name: 'Cocoa', glow: '#F3E2D2', light: '#CBA37C', mid: '#9E7350', deep: '#6F4B31', shade: '#41291A', ink: '#23140C', cheek: '#FF7595' }
  ];
  // The production app's complete 70-item cosmetic collection.
  const FINISHES = ['living-jelly', 'soft-gummy', 'pearl', 'molten', 'galaxy', 'chrome', 'hologram', 'aurora', 'crystal', 'obsidian', 'first-batch', 'clear-glass', 'sunforge-gold', 'wildfire-gel'];
  const AURAS = ['none', 'bubbles', 'stardust', 'embers', 'hearts', 'glitch', 'orbit', 'fireflies', 'lightning', 'portal', 'prismatic', 'sloplings', 'petals', 'idea-comets', 'sound-rings', 'echo-trail', 'ribbon-trail'];
  const HATS = ['bare', 'sprout', 'headphones', 'halo', 'crown', 'horns', 'bow', 'beanie', 'propeller', 'star', 'afro', 'antenna', 'mushroom', 'chef-puff', 'idea-wizard', 'satin-bow', 'pearl-tiara', 'blossom-crown', 'butterfly-clips'];
  const PATTERNS = ['clean', 'bubbles', 'swirl', 'sparkles', 'stars', 'lava-lamp', 'topographic', 'confetti', 'nebula', 'kintsugi', 'spots', 'stripes', 'drips', 'checker', 'hearts', 'camo', 'fruit-slices', 'gummy-worms', 'arcade-bits', 'gingham-bloom'];
  const EYES = ['round', 'wide', 'sleepy', 'star', 'wink', 'cyclops', 'dot', 'kawaii', 'heart', 'angry', 'sparkle', 'spiral', 'visor', 'squint', 'three', 'many', 'liquid', 'crescent', 'velvet-lash'];
  const EYE_COLORS = ['#3B1206', '#5A3418', '#2E8BE6', '#2C8A4B', '#D98A12', '#8145E0', '#C42035', '#E85C93', '#12A5A5', '#C9A227', '#8D97A6', '#35F0C0'];

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const random = (low, high) => low + Math.random() * (high - low);
  const smoothstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smootherstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const normalizedAngle = value => {
    let wrapped = (value + Math.PI) % TAU;
    if (wrapped < 0) wrapped += TAU;
    return wrapped - Math.PI;
  };
  const rgba = (hex, alpha) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
  };
  const labelFor = value => value.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
  const unitFor = rect => rect.w / 100;

  function depthPose(value) {
    const orientation = normalizedAngle(value);
    const side = Math.sin(orientation);
    const facing = Math.cos(orientation);
    const edge = Math.abs(side);
    const front = smoothstep((facing + 0.28) / 0.28);
    const back = smoothstep((-facing + 0.18) / 0.36);
    const surfaceOffset = side * 0.49 * (0.965 + 0.035 * Math.max(0, facing));
    return {
      orientation,
      side,
      facing,
      front,
      back,
      bodyScaleX: 1 - edge * 0.16,
      faceOffsetX: surfaceOffset,
      faceScaleX: 0.14 + Math.max(0, facing) * 0.86,
      patternScaleX: 0.38 + Math.abs(facing) * 0.62,
      lightOffsetX: side * 0.16
    };
  }

  function makeBodyPath(rect, phase, wobble, spread, lean) {
    const points = [];
    const samples = 128;
    const halfWidth = rect.w / 2;
    const halfHeight = rect.h / 2;
    const spin = phase * TAU;
    for (let index = 0; index < samples; index += 1) {
      const angle = index / samples * TAU;
      let x = Math.cos(angle) * halfWidth;
      let y = Math.sin(angle) * halfHeight;
      const crownDelta = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
      const crown = 0.018 * Math.exp(-(crownDelta * crownDelta) / (2 * 0.94 * 0.94));
      const ripple = (Math.sin(angle * 3 + spin) * 0.008 + Math.sin(angle * 5 - spin * 1.4) * 0.004) * wobble;
      x *= 1 + ripple + crown * wobble;
      y *= 1 + ripple + crown * wobble;
      const vertical = clamp(y / halfHeight, -1, 1);
      x *= 1 + wobble * (0.13 * vertical + 0.12 * vertical * vertical - 0.03) + spread * 0.3 * Math.max(0, vertical);
      if (vertical > 0) y *= 1 - wobble * 0.13 * vertical * vertical;
      x += lean * halfWidth * (-y / halfHeight) * 0.14;
      points.push({ x: rect.cx + x, y: rect.cy + y });
    }
    const path = new Path2D();
    path.moveTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    for (let index = 1; index <= points.length; index += 1) {
      const current = points[index % points.length];
      const next = points[(index + 1) % points.length];
      path.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    path.closePath();
    return path;
  }

  class SlopToon {
    constructor(stage) {
      this.stage = stage;
      this.canvas = stage.querySelector('canvas');
      this.ctx = this.canvas?.getContext?.('2d');
      if (!this.ctx) return;
      this.mode = stage.dataset.slopToon || 'hero';
      this.width = 0;
      this.height = 0;
      this.angle = 0;
      this.dragAngle = 0;
      this.dragStartX = 0;
      this.dragStartedAt = 0;
      this.dragTravel = 0;
      this.lastDragAngle = 0;
      this.lastMoveAt = 0;
      this.pointerId = null;
      this.dragged = false;
      this.angularVelocity = 0;
      this.reactionAt = -Infinity;
      this.lastInteraction = performance.now();
      this.lastFrameAt = performance.now();
      this.visible = true;
      this.gaze = { x: 0, y: 0, tx: 0, ty: 0 };
      this.pointerLookUntil = 0;
      this.nextGazeAt = 0;
      this.nextAutoSpin = performance.now() + random(7000, 14000);
      this.autoSpin = null;
      this.skin = {
        palette: PALETTES.find(palette => palette.id === stage.dataset.palette) || PALETTES[0],
        finish: FINISHES.includes(stage.dataset.finish) ? stage.dataset.finish : 'living-jelly',
        aura: AURAS.includes(stage.dataset.aura) ? stage.dataset.aura : 'bubbles',
        hat: HATS.includes(stage.dataset.hat) ? stage.dataset.hat : 'bare',
        pattern: PATTERNS.includes(stage.dataset.pattern) ? stage.dataset.pattern : 'clean',
        eyes: EYES.includes(stage.dataset.eyes) ? stage.dataset.eyes : 'cyclops',
        eye: EYE_COLORS.includes(stage.dataset.eye) ? stage.dataset.eye : EYE_COLORS[0]
      };
      this.bags = Object.create(null);
      this.skinChangedAt = -Infinity;
      this.shuffleTimer = 0;
      this.mouthAmount = 0;
      this.bind();
      this.resize();
      requestAnimationFrame(timestamp => this.draw(timestamp));
    }

    bind() {
      this.stage.addEventListener('pointermove', event => this.trackPointer(event));
      this.stage.addEventListener('pointerleave', () => {
        this.pointerLookUntil = 0;
      });

      if (this.mode === 'hero') {
        window.addEventListener('pointermove', event => this.trackGlobalPointer(event), { passive: true });
        this.stage.addEventListener('pointerdown', event => this.startDrag(event));
        this.stage.addEventListener('pointerup', event => this.endDrag(event));
        this.stage.addEventListener('pointercancel', event => this.endDrag(event));
        this.stage.addEventListener('keydown', event => this.onKey(event));
      } else {
        this.stage.addEventListener('pointerdown', () => {
          this.reactionAt = performance.now();
        });
        new MutationObserver(() => {
          if (this.stage.dataset.mouth === 'open') this.reactionAt = performance.now();
        }).observe(this.stage, { attributes: true, attributeFilter: ['data-mouth'] });
      }

      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(this.canvas);
      else window.addEventListener('resize', () => this.resize());
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          this.visible = entries.some(entry => entry.isIntersecting);
        }, { rootMargin: '140px' }).observe(this.stage);
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const pixelWidth = Math.round(this.width * dpr);
      const pixelHeight = Math.round(this.height * dpr);
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    trackPointer(event) {
      const rect = this.stage.getBoundingClientRect();
      this.gaze.tx = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
      this.gaze.ty = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1);
      this.pointerLookUntil = performance.now() + 950;
      if (this.mode !== 'hero' || event.pointerId !== this.pointerId) return;
      const nextAngle = this.dragAngle + (event.clientX - this.dragStartX) / (Math.max(1, this.stage.clientWidth) * 0.62) * TAU;
      if (Math.abs(event.clientX - this.dragStartX) > 5) this.dragged = true;
      this.dragTravel += Math.abs(nextAngle - this.lastDragAngle);
      const now = performance.now();
      const deltaSeconds = Math.max(0.008, (now - this.lastMoveAt) / 1000);
      const instantVelocity = (nextAngle - this.lastDragAngle) / deltaSeconds;
      this.angularVelocity = this.angularVelocity * 0.62 + instantVelocity * 0.38;
      this.angle = nextAngle;
      this.lastDragAngle = nextAngle;
      this.lastMoveAt = now;
      this.lastInteraction = now;
    }

    trackGlobalPointer(event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const rect = this.stage.getBoundingClientRect();
      const rangeX = Math.max(rect.width * 1.4, innerWidth * 0.34);
      const rangeY = Math.max(rect.height * 1.4, innerHeight * 0.34);
      this.gaze.tx = clamp((event.clientX - (rect.left + rect.width / 2)) / rangeX, -1, 1);
      this.gaze.ty = clamp((event.clientY - (rect.top + rect.height / 2)) / rangeY, -0.9, 0.9);
      this.pointerLookUntil = performance.now() + 2800;
    }

    startDrag(event) {
      if (this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      this.dragStartX = event.clientX;
      this.dragAngle = this.angle;
      this.lastDragAngle = this.angle;
      this.dragTravel = 0;
      this.dragStartedAt = performance.now();
      this.lastMoveAt = this.dragStartedAt;
      this.angularVelocity = 0;
      this.dragged = false;
      this.autoSpin = null;
      this.lastInteraction = this.dragStartedAt;
      this.stage.classList.add('is-dragging');
      this.stage.setPointerCapture?.(this.pointerId);
    }

    endDrag(event) {
      if (event.pointerId !== this.pointerId) return;
      this.stage.releasePointerCapture?.(this.pointerId);
      this.pointerId = null;
      this.stage.classList.remove('is-dragging');
      const now = performance.now();
      if (!this.dragged) {
        this.angularVelocity = 0;
        this.shuffleLook();
      } else {
        this.angularVelocity = clamp(this.angularVelocity, -15, 15);
        const seconds = Math.max(0.12, (now - this.dragStartedAt) / 1000);
        const travelTurns = this.dragTravel / TAU;
        if (travelTurns > 0.58 && travelTurns / seconds > 1.05) this.shuffleLook();
      }
      this.lastInteraction = now;
      this.nextAutoSpin = now + random(9000, 24000);
    }

    onKey(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.angle += event.key === 'ArrowLeft' ? -Math.PI / 4 : Math.PI / 4;
        this.lastInteraction = performance.now();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.shuffleLook();
        this.lastInteraction = performance.now();
      }
    }

    shuffleLook() {
      clearTimeout(this.shuffleTimer);
      const now = performance.now();
      this.reactionAt = now;
      this.angularVelocity = (Math.random() < .5 ? -1 : 1) * 18;
      if (reduceMotion.matches) {
        this.randomizeSkin();
        return;
      }
      this.stage.classList.remove('is-shuffling');
      void this.stage.offsetWidth;
      this.stage.classList.add('is-shuffling');
      this.shuffleTimer = setTimeout(() => {
        this.randomizeSkin();
        setTimeout(() => this.stage.classList.remove('is-shuffling'), 520);
      }, 430);
    }

    drawFromBag(key, items, current) {
      let bag = this.bags[key];
      if (!bag?.length) {
        bag = [...items];
        for (let index = bag.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(Math.random() * (index + 1));
          [bag[index], bag[swap]] = [bag[swap], bag[index]];
        }
        this.bags[key] = bag;
      }
      let next = bag.pop();
      if (next === current && bag.length) {
        const alternate = bag.pop();
        bag.unshift(next);
        next = alternate;
      }
      return next;
    }

    randomizeSkin() {
      const palette = this.drawFromBag('palette', PALETTES, this.skin.palette);
      this.skin = {
        palette,
        finish: this.drawFromBag('finish', FINISHES, this.skin.finish),
        aura: this.drawFromBag('aura', AURAS, this.skin.aura),
        hat: this.drawFromBag('hat', HATS, this.skin.hat),
        pattern: this.drawFromBag('pattern', PATTERNS, this.skin.pattern),
        eyes: this.drawFromBag('eyes', EYES, this.skin.eyes),
        eye: this.drawFromBag('eye', EYE_COLORS, this.skin.eye)
      };
      this.skinChangedAt = performance.now();
      this.reactionAt = this.skinChangedAt;
      this.stage.dataset.skin = palette.id;
      const rgb = Number.parseInt(palette.mid.slice(1), 16);
      const luminance = (((rgb >> 16) * 299) + (((rgb >> 8) & 255) * 587) + ((rgb & 255) * 114)) / 1000;
      this.stage.dispatchEvent(new CustomEvent('slopskinchange', {
        detail: {
          palette: palette.name,
          pattern: this.skin.pattern,
          traits: [labelFor(this.skin.finish), labelFor(this.skin.aura), labelFor(this.skin.hat), labelFor(this.skin.pattern), `${labelFor(this.skin.eyes)} eyes`],
          colors: { ...palette, contrast: luminance > 142 ? '#120b08' : '#fffdf8' }
        }
      }));
    }

    updateGaze(timestamp, phase) {
      if (timestamp > this.pointerLookUntil && timestamp > this.nextGazeAt) {
        this.gaze.tx = clamp(Math.sin(phase * 0.63) * 0.72 + random(-0.26, 0.26), -1, 1);
        this.gaze.ty = clamp(Math.cos(phase * 0.41) * 0.46 + random(-0.2, 0.2), -0.78, 0.78);
        this.nextGazeAt = timestamp + random(850, 2300);
      }
      const speed = reduceMotion.matches ? 0.25 : 0.075;
      this.gaze.x += (this.gaze.tx - this.gaze.x) * speed;
      this.gaze.y += (this.gaze.ty - this.gaze.y) * speed;
    }

    updateAutoSpin(timestamp) {
      if (this.mode !== 'hero' || reduceMotion.matches || this.pointerId !== null) return 0;
      if (!this.autoSpin && timestamp >= this.nextAutoSpin && timestamp - this.lastInteraction > 5000) {
        this.autoSpin = { start: timestamp, duration: random(2900, 4300), direction: Math.random() < 0.5 ? -1 : 1, shuffle: Math.random() < 0.58, changed: false };
      }
      if (!this.autoSpin) return 0;
      const progress = (timestamp - this.autoSpin.start) / this.autoSpin.duration;
      if (this.autoSpin.shuffle && !this.autoSpin.changed && progress > 0.68) {
        this.autoSpin.changed = true;
        this.stage.classList.add('is-shuffling');
        this.randomizeSkin();
        setTimeout(() => this.stage.classList.remove('is-shuffling'), 620);
      }
      if (progress >= 1) {
        this.angle += TAU * this.autoSpin.direction;
        this.autoSpin = null;
        this.nextAutoSpin = timestamp + random(12000, 28000);
        return 0;
      }
      return smootherstep(progress) * TAU * this.autoSpin.direction;
    }

    ellipse(x, y, radiusX, radiusY, fill, stroke, lineWidth = 1) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.01, radiusX), Math.max(0.01, radiusY), 0, 0, TAU);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    }

    drawAura(rect, phase) {
      const ctx = this.ctx;
      const { aura, palette } = this.skin;
      if (aura === 'none') return;
      const unit = rect.w / 100;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (aura === 'portal' || aura === 'orbit' || aura === 'sound-rings' || aura === 'prismatic') {
        const count = aura === 'sound-rings' ? 3 : 2;
        for (let i = 0; i < count; i += 1) {
          ctx.strokeStyle = aura === 'prismatic' ? `hsla(${(phase * 45 + i * 120) % 360},90%,70%,.38)` : rgba(palette.light, 0.28 - i * 0.06);
          ctx.lineWidth = unit * (1.8 - i * 0.3);
          ctx.beginPath();
          ctx.ellipse(rect.cx, rect.cy + unit * 7, rect.w * (0.55 + i * 0.08), rect.h * (0.38 + i * 0.06), phase * 0.08 + i, 0, TAU);
          ctx.stroke();
        }
      } else if (aura === 'lightning') {
        ctx.strokeStyle = '#D9F7FF';
        ctx.shadowColor = '#52D9FF';
        ctx.shadowBlur = unit * 4;
        ctx.lineWidth = unit * 1.4;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(rect.cx + side * rect.w * .49, rect.cy - unit * 22);
          ctx.lineTo(rect.cx + side * rect.w * .61, rect.cy - unit * 7);
          ctx.lineTo(rect.cx + side * rect.w * .52, rect.cy + unit * 3);
          ctx.lineTo(rect.cx + side * rect.w * .64, rect.cy + unit * 21);
          ctx.stroke();
        }
      } else if (aura === 'glitch' || aura === 'echo-trail') {
        ctx.globalAlpha = .22;
        for (const [dx, color] of [[-8, '#45E7FF'], [8, '#FF4F9A']]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = unit * 3;
          ctx.stroke(makeBodyPath({ ...rect, cx: rect.cx + dx * unit }, phase / 5, .5, .1, 0));
        }
      } else if (aura === 'ribbon-trail') {
        const gradient = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
        gradient.addColorStop(0, '#54E7FF');gradient.addColorStop(.5, '#FF6FAE');gradient.addColorStop(1, '#FFE77B');
        ctx.strokeStyle = gradient;ctx.lineWidth = unit * 3.5;ctx.globalAlpha = .55;
        ctx.beginPath();ctx.moveTo(rect.x - unit * 9, rect.cy + Math.sin(phase) * unit * 12);ctx.bezierCurveTo(rect.cx - unit * 30, rect.cy - unit * 38, rect.cx + unit * 29, rect.cy + unit * 42, rect.x + rect.w + unit * 10, rect.cy);ctx.stroke();
      } else {
        const symbols = aura === 'hearts' ? ['♥','♥','♥','♥','♥'] : aura === 'petals' ? ['✿','✿','✿','✿','✿'] : aura === 'idea-comets' ? ['✦','✧','✦','✧','✦'] : ['•','✦','•','✦','•','✦'];
        ctx.font = `700 ${unit * (aura === 'sloplings' ? 9 : 6)}px sans-serif`;
        ctx.textAlign = 'center';ctx.textBaseline = 'middle';
        symbols.forEach((symbol, i) => {
          const angle = phase * (.32 + i * .013) + i / symbols.length * TAU;
          const radius = rect.w * (.57 + (i % 2) * .08);
          ctx.fillStyle = aura === 'embers' ? '#FF9B40' : aura === 'hearts' ? palette.cheek : aura === 'fireflies' ? '#F8FF8B' : aura === 'sloplings' ? palette.light : rgba(palette.glow, .75);
          ctx.globalAlpha = .42 + .34 * (Math.sin(phase * 2 + i) * .5 + .5);
          ctx.fillText(aura === 'sloplings' ? '●' : symbol, rect.cx + Math.cos(angle) * radius, rect.cy + Math.sin(angle) * rect.h * .48);
        });
      }
      ctx.restore();
    }

    drawFinish(rect, body, phase) {
      const ctx = this.ctx;
      const { finish, palette } = this.skin;
      if (finish === 'living-jelly') return;
      ctx.save();ctx.clip(body);
      if (finish === 'soft-gummy') {
        ctx.fillStyle = rgba(palette.glow,.14);ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      } else if (finish === 'pearl' || finish === 'chrome' || finish === 'sunforge-gold') {
        const g=ctx.createLinearGradient(rect.x,rect.y,rect.x+rect.w,rect.y+rect.h);
        const colors=finish==='sunforge-gold'?['#6B3500','#FFF0A0','#C96B00','#FFF4B0']:finish==='chrome'?['#121820','#F7FFFF','#697785','#FFFFFF','#222B33']:['#FFF8FF','#A9EAF0','#F4B6E1','#FFF9E8'];
        colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c));ctx.globalAlpha=finish==='pearl'?.34:.48;ctx.fillStyle=g;ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      } else if (finish === 'galaxy' || finish === 'obsidian' || finish === 'first-batch') {
        ctx.fillStyle=finish==='obsidian'?'rgba(2,3,9,.58)':'rgba(19,4,44,.48)';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
        ctx.fillStyle=finish==='first-batch'?'#FF9B45':'#F5E8FF';
        for(let i=0;i<18;i++){const x=rect.x+((i*47)%97)/100*rect.w,y=rect.y+((i*71)%93)/100*rect.h;this.ellipse(x,y,unitFor(rect)*(i%3===0?1.1:.55),unitFor(rect)*(i%3===0?1.1:.55),ctx.fillStyle)}
      } else if (finish === 'molten' || finish === 'wildfire-gel') {
        const g=ctx.createRadialGradient(rect.cx,rect.cy,0,rect.cx,rect.cy,rect.w*.55);g.addColorStop(0,'#FFE76B');g.addColorStop(.46,'#FF6A16');g.addColorStop(1,'#741008');ctx.globalAlpha=.52;ctx.fillStyle=g;ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      } else if (finish === 'hologram' || finish === 'aurora') {
        const g=ctx.createLinearGradient(rect.x,rect.y,rect.x+rect.w,rect.y+rect.h);for(let i=0;i<5;i++)g.addColorStop(i/4,`hsla(${(phase*28+i*82)%360},90%,70%,.7)`);ctx.globalAlpha=.38;ctx.fillStyle=g;ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      } else if (finish === 'crystal' || finish === 'clear-glass') {
        ctx.globalAlpha=finish==='clear-glass'?.22:.34;ctx.fillStyle='#DDF8FF';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.strokeStyle='#FFFFFF';ctx.lineWidth=unitFor(rect)*1.2;for(let i=-2;i<4;i++){ctx.beginPath();ctx.moveTo(rect.cx+i*unitFor(rect)*13,rect.y);ctx.lineTo(rect.cx+(i+2)*unitFor(rect)*9,rect.y+rect.h);ctx.stroke()}
      }
      ctx.restore();
    }

    drawHat(rect, pose, phase) {
      if (pose.front < .04 || this.skin.hat === 'bare') return;
      const ctx=this.ctx, u=rect.w/100, x=rect.cx+rect.w*pose.faceOffsetX*.28, y=rect.y+u*4, hat=this.skin.hat, p=this.skin.palette;
      ctx.save();ctx.globalAlpha=pose.front;ctx.translate(x,y);ctx.scale(pose.faceScaleX*.55+.45,1);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=p.ink;ctx.lineWidth=u*2;
      if(hat==='halo'){ctx.strokeStyle='#FFF2A1';ctx.shadowColor='#FFE95C';ctx.shadowBlur=u*7;this.ellipse(0,-u*9,u*18,u*5,null,ctx.strokeStyle,u*2.2)}
      else if(hat==='sprout'||hat==='antenna'){ctx.beginPath();ctx.moveTo(0,u*2);ctx.quadraticCurveTo(u*1,-u*13,u*(hat==='antenna'?0:8),-u*18);ctx.stroke();this.ellipse(hat==='antenna'?0:u*10,-u*19,u*4,u*3,hat==='antenna'?p.cheek:'#66D764',p.ink,u*1.4)}
      else if(hat==='headphones'){ctx.lineWidth=u*5;ctx.beginPath();ctx.arc(0,0,u*24,Math.PI,TAU);ctx.stroke();this.ellipse(-u*24,u*3,u*6,u*11,p.deep,p.ink,u*1.5);this.ellipse(u*24,u*3,u*6,u*11,p.deep,p.ink,u*1.5)}
      else if(hat==='crown'||hat==='pearl-tiara'){ctx.fillStyle=hat==='crown'?'#FFD75A':'#F5DDFC';ctx.beginPath();ctx.moveTo(-u*18,u*3);ctx.lineTo(-u*15,-u*15);ctx.lineTo(-u*5,-u*6);ctx.lineTo(0,-u*18);ctx.lineTo(u*6,-u*6);ctx.lineTo(u*16,-u*15);ctx.lineTo(u*18,u*3);ctx.closePath();ctx.fill();ctx.stroke()}
      else if(hat==='horns'){ctx.fillStyle='#F5E7D1';for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(s*u*10,u*3);ctx.quadraticCurveTo(s*u*27,-u*14,s*u*18,-u*26);ctx.quadraticCurveTo(s*u*7,-u*10,s*u*10,u*3);ctx.fill();ctx.stroke()}}
      else if(hat.includes('bow')||hat==='butterfly-clips'){ctx.fillStyle=hat==='satin-bow'?'#FF91BE':p.cheek;for(const s of[-1,1]){ctx.beginPath();ctx.ellipse(s*u*10,-u*4,u*10,u*7,s*.35,0,TAU);ctx.fill();ctx.stroke()}this.ellipse(0,-u*4,u*4,u*4,'#FFE6A8',p.ink,u)}
      else if(hat==='beanie'||hat==='mushroom'||hat==='chef-puff'||hat==='afro'){ctx.fillStyle=hat==='afro'?'#351B14':hat==='mushroom'?'#F36B65':hat==='beanie'?p.deep:'#FFF5DF';const rx=hat==='afro'?29:hat==='mushroom'?27:22,ry=hat==='afro'?20:hat==='chef-puff'?17:12;this.ellipse(0,-u*4,u*rx,u*ry,ctx.fillStyle,p.ink,u*2);if(hat==='beanie')this.ellipse(0,-u*20,u*5,u*5,p.light,p.ink,u)}
      else if(hat==='propeller'){ctx.fillStyle=p.light;this.ellipse(0,-u*1,u*18,u*7,ctx.fillStyle,p.ink,u*2);ctx.beginPath();ctx.moveTo(0,-u*7);ctx.lineTo(0,-u*19);ctx.stroke();ctx.save();ctx.translate(0,-u*20);ctx.rotate(phase*4);this.ellipse(0,0,u*18,u*3,p.cheek,p.ink,u);ctx.restore()}
      else if(hat==='star'){ctx.fillStyle='#FFE568';ctx.font=`900 ${u*30}px sans-serif`;ctx.textAlign='center';ctx.fillText('★',0,u*1)}
      else if(hat==='idea-wizard'){ctx.fillStyle='#7244C9';ctx.beginPath();ctx.moveTo(-u*20,u*4);ctx.lineTo(u*2,-u*34);ctx.lineTo(u*19,u*4);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#FFE568';ctx.font=`900 ${u*8}px sans-serif`;ctx.fillText('✦',-u*1,-u*13)}
      else if(hat==='blossom-crown'){ctx.fillStyle='#FF9BC2';for(let i=0;i<5;i++)this.ellipse((i-2)*u*8,-u*(5+Math.abs(i-2)*2),u*5,u*5,ctx.fillStyle,p.ink,u)}
      else {ctx.fillStyle=p.deep;ctx.beginPath();ctx.ellipse(0,-u*2,u*24,u*9,0,Math.PI,TAU);ctx.lineTo(u*18,u*5);ctx.lineTo(-u*18,u*5);ctx.closePath();ctx.fill();ctx.stroke()}
      ctx.restore();
    }

    drawPattern(rect, pose, phase) {
      const ctx = this.ctx;
      const palette = this.skin.palette;
      const unit = rect.w / 100;
      const pattern = this.skin.pattern;
      if (pattern === 'clean') return;
      ctx.save();
      ctx.translate(rect.cx + pose.side * rect.w * 0.08, rect.cy);
      ctx.scale(pose.patternScaleX, 1);
      ctx.translate(-rect.cx, -rect.cy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (pattern === 'spots' || pattern === 'lava-lamp' || pattern === 'camo' || pattern === 'fruit-slices' || pattern === 'gummy-worms') {
        for (const [x, y, radius] of [[-23, -18, 7], [18, -11, 5], [-9, 15, 4], [26, 22, 8], [-29, 29, 5]]) {
          this.ellipse(rect.cx + x * unit, rect.cy + y * unit, radius * unit, radius * (pattern==='gummy-worms'?.32:.78) * unit, pattern==='fruit-slices'?'rgba(255,245,130,.38)':rgba(pattern==='camo'?palette.ink:palette.glow, 0.22));
        }
      } else if (pattern === 'stripes' || pattern === 'drips' || pattern === 'gingham-bloom') {
        ctx.strokeStyle = rgba(palette.ink, 0.13);
        ctx.lineWidth = unit * 7;
        for (let x = -70; x < 70; x += 23) {
          ctx.beginPath();
          ctx.moveTo(rect.cx + (x - 24) * unit, rect.y);
          ctx.lineTo(rect.cx + (x + 24) * unit, rect.y + rect.h);
          ctx.stroke();
        }
      } else if (pattern === 'stars' || pattern === 'sparkles' || pattern === 'confetti' || pattern === 'hearts' || pattern === 'arcade-bits') {
        const marks = [[-24, -21], [18, -23], [-4, 9], [29, 19], [-29, 27], [10, 31]];
        ctx.strokeStyle = rgba(palette.glow, 0.42);
        ctx.lineWidth = unit * 1.7;
        for (const [x, y] of marks) {
          ctx.beginPath();
          ctx.moveTo(rect.cx + (x - 3) * unit, rect.cy + y * unit);
          ctx.lineTo(rect.cx + (x + 3) * unit, rect.cy + y * unit);
          if (pattern === 'stars' || pattern === 'sparkles' || pattern === 'hearts') {
            ctx.moveTo(rect.cx + x * unit, rect.cy + (y - 3) * unit);
            ctx.lineTo(rect.cx + x * unit, rect.cy + (y + 3) * unit);
          } else {
            ctx.lineTo(rect.cx + (x + 5) * unit, rect.cy + (y + 3) * unit);
          }
          ctx.stroke();
        }
      } else if (pattern === 'swirl' || pattern === 'topographic' || pattern === 'nebula' || pattern === 'kintsugi') {
        ctx.strokeStyle = rgba(palette.glow, pattern === 'swirl' ? 0.26 : 0.19);
        ctx.lineWidth = unit * 1.8;
        const count = pattern === 'swirl' ? 3 : 6;
        for (let index = 0; index < count; index += 1) {
          ctx.beginPath();
          ctx.ellipse(rect.cx, rect.cy + unit * 4, unit * (9 + index * 7), unit * (6 + index * 4.8), phase * 0.035, 0.15 * Math.PI, 1.88 * Math.PI);
          ctx.stroke();
        }
      } else if (pattern === 'bubbles') {
        ctx.strokeStyle = rgba(palette.glow, 0.34);
        ctx.lineWidth = unit * 1.5;
        for (const [x, y, radius] of [[-24, -18, 6], [20, -20, 4], [26, 13, 7], [-16, 21, 5], [3, 31, 3]]) {
          this.ellipse(rect.cx + x * unit, rect.cy + y * unit, radius * unit, radius * unit, null, ctx.strokeStyle, ctx.lineWidth);
        }
      } else if (pattern === 'checker') {
        ctx.fillStyle = rgba(palette.ink, 0.11);
        const cell = unit * 12;
        for (let row = -4; row < 5; row += 1) {
          for (let column = -4; column < 5; column += 1) {
            if ((row + column) % 2 === 0) ctx.fillRect(rect.cx + column * cell, rect.cy + row * cell, cell, cell);
          }
        }
      }
      ctx.restore();
    }

    drawFace(rect, pose, phase, mouthOpen) {
      if (pose.front < 0.002) return;
      const ctx = this.ctx;
      const palette = this.skin.palette;
      const unit = rect.w / 100;
      const faceX = rect.cx + rect.w * pose.faceOffsetX;
      const faceY = rect.y + rect.h * 0.425;
      const blinkClock = (phase + 1.1) % 5.7;
      const blink = blinkClock > 5.28 ? Math.sin(((blinkClock - 5.28) / 0.42) * Math.PI) : 0;
      const eyeType = this.skin.eyes;

      ctx.save();
      ctx.globalAlpha *= pose.front;
      ctx.translate(faceX, faceY);
      ctx.scale(pose.faceScaleX, 1);
      ctx.translate(-faceX, -faceY);
      ctx.strokeStyle = palette.ink;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const closedEye = (x, y, radius = 7, down = false) => {
        ctx.lineWidth = unit * 2.2;
        ctx.beginPath();
        ctx.arc(x, y, unit * radius, down ? Math.PI * 1.15 : Math.PI * 1.08, down ? Math.PI * 1.85 : Math.PI * 1.92, down);
        ctx.stroke();
      };
      const standardEye = (x, y, rx = 7.2, ry = 9.2, style = 'normal') => {
        const height = Math.max(1.2, ry * (1 - blink * .91));
        if (blink > .88) { closedEye(x, y, rx * .8); return; }
        ctx.shadowColor = rgba(palette.ink, .27);ctx.shadowBlur = unit * 1.3;
        this.ellipse(x, y, unit * (rx + 1.5), unit * (height + 1.5), palette.ink);
        ctx.shadowBlur = 0;
        this.ellipse(x, y, unit * rx, unit * height, '#FFFDF8');
        if (style === 'crescent') {
          this.ellipse(x + unit * 3.2, y - unit * .5, unit * rx * .75, unit * height * .9, palette.light);
          return;
        }
        const px = x + this.gaze.x * unit * Math.min(3.2, rx * .42);
        const py = y + this.gaze.y * unit * Math.min(2.4, ry * .3);
        if (style === 'star' || style === 'heart') {
          ctx.fillStyle = style === 'heart' ? palette.cheek : this.skin.eye;
          ctx.font = `900 ${unit * Math.min(12, rx * 1.55)}px sans-serif`;
          ctx.textAlign = 'center';ctx.textBaseline = 'middle';
          ctx.fillText(style === 'heart' ? '♥' : '★', px, py + unit * .4);
        } else if (style === 'spiral') {
          ctx.strokeStyle = this.skin.eye;ctx.lineWidth = unit * 1.5;ctx.beginPath();
          for(let i=0;i<24;i++){const a=i/23*TAU*2.1,r=unit*(.5+i/23*Math.min(4.7,rx*.62)),sx=px+Math.cos(a)*r,sy=py+Math.sin(a)*r;if(i===0)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy)}ctx.stroke();ctx.strokeStyle=palette.ink;
        } else {
          const iris = ctx.createRadialGradient(px-unit,py-unit,unit*.5,px,py,unit*Math.min(5.2,rx*.7));
          iris.addColorStop(0,this.skin.eye);iris.addColorStop(.66,palette.ink);iris.addColorStop(1,'#160805');
          this.ellipse(px,py,unit*Math.min(4.8,rx*.68),unit*Math.min(5.3,ry*.62),iris);
          this.ellipse(px-unit*1.3,py-unit*1.8,unit*1.05,unit*1.25,'#FFFFFF');
          if(style==='sparkle'){ctx.fillStyle='#fff';ctx.font=`900 ${unit*5}px sans-serif`;ctx.textAlign='center';ctx.fillText('✦',px+unit*2.4,py+unit*2.5)}
        }
        if (style === 'liquid') {
          ctx.fillStyle = this.skin.eye;ctx.beginPath();ctx.moveTo(x-unit*2,y+unit*6);ctx.quadraticCurveTo(x,y+unit*13,x+unit*2,y+unit*6);ctx.fill();
        }
        if (style === 'lash') {
          ctx.strokeStyle=palette.ink;ctx.lineWidth=unit*1.2;
          for(const side of[-1,1]){ctx.beginPath();ctx.moveTo(x+side*unit*(rx-1),y-unit*(height-1));ctx.lineTo(x+side*unit*(rx+4),y-unit*(height+4));ctx.stroke()}
        }
      };
      const brow = (x, y, tilt = 0) => {ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.lineWidth=unit*1.5;ctx.beginPath();ctx.moveTo(-unit*4,0);ctx.quadraticCurveTo(0,-unit*1.5,unit*4,0);ctx.stroke();ctx.restore()};
      const left = faceX - unit * 10.2, right = faceX + unit * 10.2;
      if (eyeType === 'cyclops') {
        standardEye(faceX, faceY, 14.7, 15.7);
        brow(faceX, faceY-unit*22-mouthOpen*unit*2);
      } else if (eyeType === 'dot') {
        this.ellipse(left,faceY,unit*2.5,unit*3.1,palette.ink);this.ellipse(right,faceY,unit*2.5,unit*3.1,palette.ink);brow(left,faceY-unit*9);brow(right,faceY-unit*9);
      } else if (eyeType === 'kawaii') {
        closedEye(left,faceY,6.5);closedEye(right,faceY,6.5);brow(left,faceY-unit*10);brow(right,faceY-unit*10);
      } else if (eyeType === 'wink') {
        standardEye(left,faceY,7,9);closedEye(right,faceY,7);brow(left,faceY-unit*13);brow(right,faceY-unit*11,-.15);
      } else if (eyeType === 'visor') {
        ctx.fillStyle=palette.ink;ctx.beginPath();ctx.roundRect(faceX-unit*24,faceY-unit*8,unit*48,unit*17,unit*8);ctx.fill();
        this.ellipse(faceX-unit*8+this.gaze.x*unit*2,faceY+this.gaze.y*unit,unit*2.4,unit*2.8,this.skin.eye);this.ellipse(faceX+unit*8+this.gaze.x*unit*2,faceY+this.gaze.y*unit,unit*2.4,unit*2.8,this.skin.eye);
      } else if (eyeType === 'squint') {
        closedEye(left,faceY,7,true);closedEye(right,faceY,7,true);
      } else if (eyeType === 'three') {
        standardEye(faceX,faceY-unit*10,5.5,7);standardEye(left,faceY+unit*4,6,7.5);standardEye(right,faceY+unit*4,6,7.5);
      } else if (eyeType === 'many') {
        for(let row=0;row<3;row++)for(let col=0;col<(row===1?4:3);col++){const count=row===1?4:3;standardEye(faceX+(col-(count-1)/2)*unit*7.2,faceY+(row-1)*unit*7,2.1,2.7)}
      } else {
        const style = eyeType==='star'?'star':eyeType==='heart'?'heart':eyeType==='spiral'?'spiral':eyeType==='sparkle'?'sparkle':eyeType==='liquid'?'liquid':eyeType==='crescent'?'crescent':eyeType==='velvet-lash'?'lash':'normal';
        const rx=eyeType==='wide'?8.4:eyeType==='sleepy'?7.8:7.2,ry=eyeType==='wide'?10.6:eyeType==='sleepy'?6.3:9.2;
        standardEye(left,faceY,rx,ry,style);standardEye(right,faceY,rx,ry,style);
        if(eyeType==='sleepy'){ctx.fillStyle=rgba(palette.ink,.62);ctx.fillRect(left-unit*8.5,faceY-unit*7.2,unit*17,unit*4.2);ctx.fillRect(right-unit*8.5,faceY-unit*7.2,unit*17,unit*4.2)}
        const tilt=eyeType==='angry'?.28:0;brow(left,faceY-unit*(ry+7),tilt);brow(right,faceY-unit*(ry+7),-tilt);
      }

      const mouthY = faceY + unit * 24;
      this.ellipse(faceX - unit * 15, mouthY - unit * 1.5, unit * 4.2, unit * 2.2, rgba(palette.cheek, 0.30));
      this.ellipse(faceX + unit * 15, mouthY - unit * 1.5, unit * 4.2, unit * 2.2, rgba(palette.cheek, 0.30));
      if (mouthOpen > 0.16) {
        this.ellipse(faceX, mouthY, unit * (7.2 + mouthOpen * 2.4), unit * (3.2 + mouthOpen * 6.2), palette.ink);
        this.ellipse(faceX, mouthY + unit * (2.6 + mouthOpen * 1.4), unit * 4.2, unit * 1.9, '#FF8AA5');
      } else {
        ctx.lineWidth = unit * 2.4;
        ctx.beginPath();
        ctx.moveTo(faceX - unit * 7.2, mouthY - unit * 1.8);
        ctx.quadraticCurveTo(faceX, mouthY + unit * 5.8, faceX + unit * 7.2, mouthY - unit * 1.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    draw(timestamp) {
      requestAnimationFrame(next => this.draw(next));
      if (!this.visible || document.hidden || this.width < 2 || this.height < 2) {
        this.lastFrameAt = timestamp;
        return;
      }
      const ctx = this.ctx;
      const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - this.lastFrameAt) / 1000));
      this.lastFrameAt = timestamp;
      const seconds = timestamp / 1000;
      const reduced = reduceMotion.matches;
      this.updateGaze(timestamp, seconds);

      if (this.mode === 'hero' && this.pointerId === null && !this.autoSpin && Math.abs(this.angularVelocity) > 0.002) {
        this.angle += this.angularVelocity * deltaSeconds;
        this.angularVelocity *= Math.exp(-deltaSeconds * 3.25);
      }
      const displayAngle = this.angle + this.updateAutoSpin(timestamp);
      const pose = depthPose(displayAngle);
      const elapsedReaction = (timestamp - this.reactionAt) / 820;
      const reaction = elapsedReaction >= 0 && elapsedReaction <= 1 ? Math.sin(elapsedReaction * Math.PI) * (1 - elapsedReaction * 0.22) : 0;
      const targetMouth = this.stage.dataset.mouth === 'open' ? 1 : 0;
      this.mouthAmount += (targetMouth - this.mouthAmount) * (reduced ? 0.3 : 0.11);
      const mouthOpen = Math.max(reaction, this.mouthAmount);
      const idle = reduced ? 0 : Math.sin(seconds * 1.52);
      const secondIdle = reduced ? 0 : Math.sin(seconds * 0.79 + 1.4);
      const squish = 1 + idle * 0.022 + reaction * 0.078;
      const stretch = 1 - idle * 0.016 - reaction * 0.057;
      const lean = reduced ? 0 : Math.sin(seconds * 0.68) * 0.12 + this.gaze.x * 0.035;
      const moveX = reduced ? 0 : (Math.sin(seconds * 0.57) + Math.sin(seconds * 1.13) * 0.35 + this.gaze.x * 0.4) * Math.min(this.width, this.height) * 0.018;
      const moveY = reduced ? 0 : (secondIdle * 0.7 - Math.abs(idle) * 0.2) * Math.min(this.width, this.height) * 0.014;
      const size = Math.min(this.width, this.height);
      const palette = this.skin.palette;
      const skinPulseAge = (timestamp - this.skinChangedAt) / 850;
      const skinPulse = skinPulseAge >= 0 && skinPulseAge <= 1 ? Math.sin(skinPulseAge * Math.PI) : 0;

      ctx.clearRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.translate(this.width / 2 + moveX, this.height / 2 + moveY);
      ctx.scale(squish * pose.bodyScaleX, stretch);
      ctx.translate(-this.width / 2, -this.height / 2);
      const rect = {
        x: this.width / 2 - size * 0.38,
        y: this.height / 2 - size * 0.38 - reaction * size * 0.02,
        w: size * 0.76,
        h: size * 0.79,
        cx: this.width / 2,
        cy: this.height / 2 + size * 0.012 - reaction * size * 0.02
      };

      ctx.save();
      ctx.filter = `blur(${size * 0.013}px)`;
      this.ellipse(rect.cx + pose.side * size * 0.025, rect.y + rect.h * 0.98, rect.w * (0.37 + reaction * 0.035), size * 0.046, 'rgba(0,0,0,.29)');
      ctx.restore();
      this.drawAura(rect, seconds);

      const body = makeBodyPath(rect, seconds / 6.4, 1, 0.12 + reaction * 0.23, lean);
      ctx.save();
      ctx.shadowColor = skinPulse > 0 ? rgba(palette.light, 0.72) : 'rgba(0,0,0,.48)';
      ctx.shadowBlur = size * (0.045 + skinPulse * 0.075);
      ctx.shadowOffsetY = skinPulse > 0 ? 0 : size * 0.025;
      ctx.fillStyle = palette.shade;
      ctx.fill(body);
      ctx.restore();

      const bodyGradient = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      bodyGradient.addColorStop(0, palette.glow);
      bodyGradient.addColorStop(0.24, palette.light);
      bodyGradient.addColorStop(0.52, palette.mid);
      bodyGradient.addColorStop(0.79, palette.deep);
      bodyGradient.addColorStop(1, palette.shade);
      ctx.fillStyle = bodyGradient;
      ctx.fill(body);

      ctx.save();
      ctx.clip(body);
      this.drawPattern(rect, pose, seconds);
      this.drawFinish(rect, body, seconds);
      const crown = ctx.createRadialGradient(rect.x + rect.w * (0.28 + pose.lightOffsetX * 0.08), rect.y + rect.h * 0.2, 0, rect.x + rect.w * (0.28 + pose.lightOffsetX * 0.08), rect.y + rect.h * 0.2, rect.w * 0.61);
      crown.addColorStop(0, rgba(palette.glow, 0.30));
      crown.addColorStop(0.54, rgba(palette.glow, 0.30));
      crown.addColorStop(0.57, rgba(palette.glow, 0.05));
      crown.addColorStop(0.60, rgba(palette.glow, 0));
      ctx.fillStyle = crown;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      const lowerBand = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      lowerBand.addColorStop(0, rgba(palette.ink, 0));
      lowerBand.addColorStop(0.58, rgba(palette.ink, 0));
      lowerBand.addColorStop(0.60, rgba(palette.ink, 0.10));
      lowerBand.addColorStop(0.74, rgba(palette.ink, 0.10));
      lowerBand.addColorStop(0.76, rgba(palette.ink, 0.20));
      lowerBand.addColorStop(0.90, rgba(palette.ink, 0.20));
      lowerBand.addColorStop(1, rgba(palette.ink, 0.28));
      ctx.fillStyle = lowerBand;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      const contourX = rect.cx + rect.w * (0.34 - pose.lightOffsetX * 0.7);
      const contour = ctx.createRadialGradient(contourX, rect.y + rect.h * 0.76, 0, contourX, rect.y + rect.h * 0.76, rect.w * 0.62);
      contour.addColorStop(0, rgba(palette.ink, 0.18 + pose.back * 0.08));
      contour.addColorStop(0.52, rgba(palette.ink, 0.18 + pose.back * 0.08));
      contour.addColorStop(0.56, rgba(palette.ink, 0.03));
      contour.addColorStop(0.59, rgba(palette.ink, 0));
      ctx.fillStyle = contour;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (pose.back > 0.01) {
        ctx.globalAlpha = pose.back * 0.72;
        ctx.strokeStyle = rgba(palette.glow, 0.28);
        ctx.lineWidth = size * 0.012;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(rect.cx - pose.side * rect.w * 0.11, rect.cy - rect.h * 0.06, rect.w * 0.22, 0.2 * Math.PI, 1.46 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = rgba(palette.ink, 0.86);
      ctx.lineWidth = size * 0.018;
      ctx.lineJoin = 'round';
      ctx.stroke(body);
      ctx.strokeStyle = rgba(palette.glow, 0.52);
      ctx.lineWidth = size * 0.006;
      ctx.stroke(body);
      ctx.save();
      ctx.clip(body);
      this.drawFace(rect, pose, seconds, mouthOpen);
      ctx.restore();
      this.drawHat(rect, pose, seconds);
      ctx.restore();

      if (this.mode === 'hero') {
        const degrees = Math.round(((normalizedAngle(displayAngle) * 180 / Math.PI) + 360) % 360);
        const direction = degrees < 45 || degrees >= 315 ? 'front' : degrees < 135 ? 'right side' : degrees < 225 ? 'back' : 'left side';
        this.stage.setAttribute('aria-valuenow', String(degrees));
        this.stage.setAttribute('aria-valuetext', `${direction} view, ${palette.name}, ${labelFor(this.skin.finish)}, ${labelFor(this.skin.aura)}, ${labelFor(this.skin.hat)}, ${labelFor(this.skin.pattern)}, ${labelFor(this.skin.eyes)} eyes`);
      }
    }
  }

  document.querySelectorAll('[data-slop-toon]').forEach(stage => new SlopToon(stage));
})();

(() => {
  'use strict';

  const canvas = document.getElementById('heroToonCanvas');
  const stage = document.getElementById('heroToonStage');
  if (!canvas || !stage || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const palette = {
    glow: '#FFE9BE',
    light: '#FFB13B',
    mid: '#FF8A22',
    deep: '#F4561D',
    shade: '#B8300F',
    ink: '#3B1206',
    cheek: '#FF7595'
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let angle = 0;
  let dragAngle = 0;
  let dragStartX = 0;
  let pointerId = null;
  let dragged = false;
  let reactionAt = -Infinity;
  let lastInteraction = performance.now();
  let visible = true;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smoothstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const normalizedAngle = value => {
    let wrapped = (value + Math.PI) % TAU;
    if (wrapped < 0) wrapped += TAU;
    return wrapped - Math.PI;
  };

  // This is the same front/side/back projection used by the Flutter app.
  const depthPose = value => {
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
      edge,
      front,
      back,
      bodyScaleX: 1 - edge * 0.16,
      faceOffsetX: surfaceOffset,
      faceScaleX: 0.14 + Math.max(0, facing) * 0.86,
      lightOffsetX: side * 0.16
    };
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function bodyPath(rect, phase, wobble, spread, lean) {
    const points = [];
    const samples = 128;
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    const spin = phase * TAU;

    for (let index = 0; index < samples; index += 1) {
      const a = index / samples * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let x = dx * hw;
      let y = dy * hh;

      // Broad crown swell, two living ripples, then the app's pooled gravity.
      const crownDelta = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
      const crown = 0.018 * Math.exp(-(crownDelta * crownDelta) / (2 * 0.94 * 0.94));
      const ripple = (Math.sin(a * 3 + spin) * 0.008 + Math.sin(a * 5 - spin * 1.4) * 0.004) * wobble;
      const surface = 1 + ripple + crown * wobble;
      x *= surface;
      y *= surface;

      const v = clamp(y / hh, -1, 1);
      const widen = 1 + wobble * (0.13 * v + 0.12 * v * v - 0.03) + spread * 0.3 * Math.max(0, v);
      const flatten = v > 0 ? 1 - wobble * 0.13 * v * v : 1;
      x *= widen;
      y *= flatten;
      x += lean * hw * (-y / hh) * 0.12;
      points.push({ x: rect.cx + x, y: rect.cy + y });
    }

    const path = new Path2D();
    const first = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    path.moveTo(first.x, first.y);
    for (let index = 1; index <= points.length; index += 1) {
      const current = points[index % points.length];
      const next = points[(index + 1) % points.length];
      path.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    path.closePath();
    return path;
  }

  function ellipse(x, y, rx, ry, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
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

  function drawFace(rect, pose, phase, reaction) {
    if (pose.front < 0.002) return;
    const unit = rect.w / 100;
    const cx = rect.cx + rect.w * pose.faceOffsetX;
    const cy = rect.y + rect.h * 0.445;
    const gazeX = Math.sin(phase * 0.7) * unit * 1.7;
    const gazeY = Math.cos(phase * 0.43) * unit * 0.7;
    const blinkClock = (phase + 1.1) % 5.7;
    const blink = blinkClock > 5.28 ? Math.sin(((blinkClock - 5.28) / 0.42) * Math.PI) : 0;
    const eyeW = unit * 29.5;
    const eyeH = unit * Math.max(2.1, 31.5 * (1 - blink * 0.92));

    ctx.save();
    ctx.globalAlpha *= pose.front;
    ctx.translate(cx, cy);
    ctx.scale(pose.faceScaleX, 1);
    ctx.translate(-cx, -cy);

    ctx.shadowColor = 'rgba(59,18,6,.28)';
    ctx.shadowBlur = unit * 2;
    ellipse(cx, cy, eyeW / 2 + unit * 2.1, eyeH / 2 + unit * 2.1, palette.ink);
    ctx.shadowBlur = 0;
    ellipse(cx, cy, eyeW / 2, eyeH / 2, '#FFFDF8');

    if (blink < 0.82) {
      const pupilX = cx + gazeX;
      const pupilY = cy + gazeY;
      const iris = ctx.createRadialGradient(pupilX - unit * 1.5, pupilY - unit * 2, unit, pupilX, pupilY, unit * 8.4);
      iris.addColorStop(0, '#8A481C');
      iris.addColorStop(0.62, '#56200B');
      iris.addColorStop(1, palette.ink);
      ellipse(pupilX, pupilY, unit * 8.6, unit * 9.2, iris);
      ellipse(pupilX, pupilY + unit * 0.4, unit * 4.6, unit * 5.1, '#130805');
      ellipse(pupilX - unit * 2.4, pupilY - unit * 3, unit * 1.85, unit * 2.2, '#FFFFFF');
      ellipse(pupilX + unit * 1.4, pupilY + unit * 1.3, unit * 0.85, unit * 1.05, 'rgba(255,255,255,.72)');
    }

    // A soft brow and smile keep the canonical cyclops expression alive.
    ctx.strokeStyle = palette.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = unit * 2.1;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 9, cy - unit * 20.5);
    ctx.quadraticCurveTo(cx, cy - unit * 24 - reaction * unit * 2, cx + unit * 9, cy - unit * 20.2);
    ctx.stroke();

    ellipse(cx - unit * 15, cy + unit * 18, unit * 4.2, unit * 2.2, 'rgba(255,117,149,.32)');
    ellipse(cx + unit * 15, cy + unit * 18, unit * 4.2, unit * 2.2, 'rgba(255,117,149,.32)');

    const mouthY = cy + unit * 19;
    if (reaction > 0.18) {
      ellipse(cx, mouthY, unit * (7.3 + reaction * 2), unit * (3.5 + reaction * 5.5), palette.ink);
      ellipse(cx, mouthY + unit * 3.1, unit * 4.1, unit * 1.8, '#FF8AA5');
    } else {
      ctx.lineWidth = unit * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx - unit * 7.2, mouthY - unit * 1.8);
      ctx.quadraticCurveTo(cx, mouthY + unit * 5.8, cx + unit * 7.2, mouthY - unit * 1.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(timestamp) {
    requestAnimationFrame(draw);
    if (!visible || document.hidden || width < 2 || height < 2) return;

    const seconds = timestamp / 1000;
    const reduced = reduceMotion.matches;
    const sinceInteraction = timestamp - lastInteraction;

    // The mobile character performs a rare, bounded 360-degree showcase.
    let autoAngle = 0;
    if (!reduced && pointerId === null && sinceInteraction > 8000) {
      const cycle = seconds % 36;
      if (cycle > 26 && cycle < 31) {
        const progress = smoothstep((cycle - 26) / 5);
        autoAngle = progress * TAU;
      }
    }
    const displayAngle = angle + autoAngle;
    const pose = depthPose(displayAngle);
    const elapsedReaction = (timestamp - reactionAt) / 780;
    const reaction = elapsedReaction >= 0 && elapsedReaction <= 1
      ? Math.sin(elapsedReaction * Math.PI) * (1 - elapsedReaction * 0.24)
      : 0;
    const idle = reduced ? 0 : Math.sin(seconds * 1.46);
    const squish = 1 + idle * 0.016 + reaction * 0.075;
    const stretch = 1 - idle * 0.012 - reaction * 0.055;
    const lean = reduced ? 0 : Math.sin(seconds * 0.72) * 0.075;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(squish * pose.bodyScaleX, stretch);
    ctx.translate(-width / 2, -height / 2);

    const size = Math.min(width, height);
    const rect = {
      x: width / 2 - size * 0.355,
      y: height / 2 - size * 0.35 - reaction * size * 0.018,
      w: size * 0.71,
      h: size * 0.73,
      cx: width / 2,
      cy: height / 2 + size * 0.015 - reaction * size * 0.018
    };

    ctx.save();
    ctx.filter = `blur(${size * 0.015}px)`;
    ellipse(rect.cx + pose.side * size * 0.025, rect.y + rect.h * 0.98, rect.w * (0.39 + reaction * 0.035), size * 0.055, `rgba(0,0,0,${0.46 - reaction * 0.12})`);
    ctx.restore();

    const body = bodyPath(rect, seconds / 6.4, 1, 0.12 + reaction * 0.23, lean);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.48)';
    ctx.shadowBlur = size * 0.05;
    ctx.shadowOffsetY = size * 0.025;
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

    // Four quantized cel planes ported from the app's toon-volume pass.
    const crown = ctx.createRadialGradient(
      rect.x + rect.w * (0.28 + pose.lightOffsetX * 0.08),
      rect.y + rect.h * 0.2,
      0,
      rect.x + rect.w * (0.28 + pose.lightOffsetX * 0.08),
      rect.y + rect.h * 0.2,
      rect.w * 0.61
    );
    crown.addColorStop(0, 'rgba(255,233,190,.30)');
    crown.addColorStop(0.54, 'rgba(255,233,190,.30)');
    crown.addColorStop(0.57, 'rgba(255,233,190,.05)');
    crown.addColorStop(0.6, 'rgba(255,233,190,0)');
    ctx.fillStyle = crown;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const lowerBand = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    lowerBand.addColorStop(0, 'rgba(59,18,6,0)');
    lowerBand.addColorStop(0.58, 'rgba(59,18,6,0)');
    lowerBand.addColorStop(0.60, 'rgba(59,18,6,.10)');
    lowerBand.addColorStop(0.74, 'rgba(59,18,6,.10)');
    lowerBand.addColorStop(0.76, 'rgba(59,18,6,.20)');
    lowerBand.addColorStop(0.90, 'rgba(59,18,6,.20)');
    lowerBand.addColorStop(1, 'rgba(59,18,6,.28)');
    ctx.fillStyle = lowerBand;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const contourX = rect.cx + rect.w * (0.34 - pose.lightOffsetX * 0.7);
    const contour = ctx.createRadialGradient(contourX, rect.y + rect.h * 0.76, 0, contourX, rect.y + rect.h * 0.76, rect.w * 0.62);
    contour.addColorStop(0, `rgba(59,18,6,${0.18 + pose.back * 0.08})`);
    contour.addColorStop(0.52, `rgba(59,18,6,${0.18 + pose.back * 0.08})`);
    contour.addColorStop(0.56, 'rgba(59,18,6,.03)');
    contour.addColorStop(0.59, 'rgba(59,18,6,0)');
    ctx.fillStyle = contour;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    if (pose.back > 0.01) {
      ctx.globalAlpha = pose.back * 0.72;
      ctx.strokeStyle = 'rgba(255,225,166,.28)';
      ctx.lineWidth = size * 0.012;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(rect.cx - pose.side * rect.w * 0.11, rect.cy - rect.h * 0.06, rect.w * 0.22, 0.2 * Math.PI, 1.46 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(59,18,6,.86)';
    ctx.lineWidth = size * 0.018;
    ctx.lineJoin = 'round';
    ctx.stroke(body);
    ctx.strokeStyle = 'rgba(255,233,190,.50)';
    ctx.lineWidth = size * 0.006;
    ctx.stroke(body);

    ctx.save();
    ctx.clip(body);
    drawFace(rect, pose, seconds, reaction);
    ctx.restore();
    ctx.restore();

    const degrees = Math.round(((normalizedAngle(displayAngle) * 180 / Math.PI) + 360) % 360);
    const direction = degrees < 45 || degrees >= 315 ? 'front' : degrees < 135 ? 'right side' : degrees < 225 ? 'back' : 'left side';
    stage.setAttribute('aria-valuenow', String(degrees));
    stage.setAttribute('aria-valuetext', `${direction} view`);
  }

  function startDrag(event) {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    dragStartX = event.clientX;
    dragAngle = angle;
    dragged = false;
    lastInteraction = performance.now();
    stage.classList.add('is-dragging');
    stage.setPointerCapture?.(pointerId);
  }

  function moveDrag(event) {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 5) dragged = true;
    angle = dragAngle + delta / (Math.max(1, stage.clientWidth) * 0.62) * TAU;
    lastInteraction = performance.now();
  }

  function endDrag(event) {
    if (event.pointerId !== pointerId) return;
    stage.releasePointerCapture?.(pointerId);
    pointerId = null;
    stage.classList.remove('is-dragging');
    if (!dragged) reactionAt = performance.now();
    lastInteraction = performance.now();
  }

  stage.addEventListener('pointerdown', startDrag);
  stage.addEventListener('pointermove', moveDrag);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      angle += event.key === 'ArrowLeft' ? -Math.PI / 4 : Math.PI / 4;
      lastInteraction = performance.now();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      reactionAt = performance.now();
      lastInteraction = performance.now();
    }
  });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
    }, { rootMargin: '120px' }).observe(stage);
  }
  resize();
  requestAnimationFrame(draw);
})();

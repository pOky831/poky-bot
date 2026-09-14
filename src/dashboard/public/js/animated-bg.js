/**
 * pOky Background – scenery behind dark smoked glass
 *
 * What the panes are sitting in front of: an out-of-focus mass of trees
 * and rain haze, rendered in smoky blue-grays so the UI still reads as
 * dark translucent glass. Soft masses, faint rain streaks, no green.
 *
 * Everything organic is painted at 1/4 resolution and blurred, then
 * scaled up – that is what makes it read as "super unscharf" without
 * costing anything at runtime. Painted once, no rAF loop.
 */

(function () {
  const canvas = document.getElementById('bg');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let grain = null;
  let scene = null;

  // The nature layer is rendered tiny and blurred, then upscaled.
  const SCENE_SCALE = 4;
  const SCENE_BLUR = 10;

  // Smoky blue-gray masses (with one whisper of moss) instead of green
  // foliage – the tint has to stay cool and low-saturation so the glass
  // above it reads as dark smoked glass, not as a green forest.
  const CANOPY = ['#182230', '#1D2937', '#222F3E', '#16202C', '#243141', '#1B2A2A'];
  const LEAF_LIGHT = [
    'rgba(198,214,232,0.055)',
    'rgba(176,196,216,0.045)',
    'rgba(214,228,242,0.035)',
  ];
  const TRUNKS = [0.09, 0.3, 0.69, 0.89];

  function pick(list) {
    return list[(Math.random() * list.length) | 0];
  }

  // ── Base: storm sky → mist → dark ground ──
  function paintBase() {
    const grad = ctx.createLinearGradient(0, 0, W * 0.2, H);
    grad.addColorStop(0, '#17202B');
    grad.addColorStop(0.42, '#1E2A36');
    grad.addColorStop(0.72, '#161F29');
    grad.addColorStop(1, '#0A0F15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── The blurred forest ──
  function buildScene() {
    const sw = Math.max(64, Math.ceil(W / SCENE_SCALE));
    const sh = Math.max(48, Math.ceil(H / SCENE_SCALE));

    const tile = document.createElement('canvas');
    tile.width = sw;
    tile.height = sh;

    const s = tile.getContext('2d');
    if (!s) return null;

    // opaque base so nothing bleeds through the blur
    const sky = s.createLinearGradient(0, 0, sw * 0.2, sh);
    sky.addColorStop(0, '#17202B');
    sky.addColorStop(0.42, '#1E2A36');
    sky.addColorStop(0.72, '#161F29');
    sky.addColorStop(1, '#0A0F15');
    s.fillStyle = sky;
    s.fillRect(0, 0, sw, sh);

    const reach = Math.max(sw, sh);
    if ('filter' in s) s.filter = 'blur(' + SCENE_BLUR + 'px)';

    // canopy mass – denser along the top and edges
    for (let i = 0; i < 30; i++) {
      const upper = Math.random() < 0.75;
      const cx = Math.random() * sw;
      const cy = upper ? Math.random() * sh * 0.55 : Math.random() * sh;
      const r = reach * (0.12 + Math.random() * 0.22);
      s.globalAlpha = 0.18 + Math.random() * 0.24;
      s.fillStyle = pick(CANOPY);
      s.beginPath();
      s.ellipse(cx, cy, r, r * (0.7 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
      s.fill();
    }

    // pale spots where light gets through wet leaves
    s.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * sw;
      const cy = Math.random() * sh * 0.62;
      const r = reach * (0.05 + Math.random() * 0.12);
      s.fillStyle = pick(LEAF_LIGHT);
      s.beginPath();
      s.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2);
      s.fill();
    }

    // trunk masses – soft vertical columns
    s.fillStyle = 'rgba(12,18,26,0.34)';
    for (let i = 0; i < TRUNKS.length; i++) {
      const w = reach * (0.045 + Math.random() * 0.035);
      const x = sw * (TRUNKS[i] + (Math.random() - 0.5) * 0.05);
      s.beginPath();
      s.ellipse(x, sh * 0.84, w, sh * 0.52, 0, 0, Math.PI * 2);
      s.fill();
    }

    // mist band – the rain that is already hanging in the air
    s.fillStyle = 'rgba(178,196,216,0.10)';
    s.beginPath();
    s.ellipse(sw * 0.5, sh * 0.5, sw * 0.64, sh * 0.115, 0, 0, Math.PI * 2);
    s.fill();

    // dark undergrowth
    s.fillStyle = 'rgba(10,14,20,0.44)';
    s.beginPath();
    s.ellipse(sw * 0.5, sh * 1.02, sw * 0.85, sh * 0.32, 0, 0, Math.PI * 2);
    s.fill();

    if ('filter' in s) s.filter = 'none';
    s.globalAlpha = 1;
    return tile;
  }

  function paintScene() {
    if (!scene) scene = buildScene();
    if (!scene) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // upscaling the tiny blurred tile is what produces the heavy blur
    ctx.drawImage(scene, 0, 0, W, H);
  }

  // ── Cool smoked tint – keeps everything behind the panes blue-gray ──
  function paintVeil() {
    ctx.fillStyle = 'rgba(96,118,142,0.10)';
    ctx.fillRect(0, 0, W, H);
  }

  // ── A few faint streaks – the rain is just about to start ──
  function paintRain() {
    const count = Math.round((W + H) / 16);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#cfdcea';

    for (let i = 0; i < count; i++) {
      const x = Math.random() * W * 1.12 - W * 0.06;
      const y = Math.random() * H;
      const len = H * (0.04 + Math.random() * 0.15);
      const lean = len * 0.24;

      ctx.globalAlpha = 0.015 + Math.random() * 0.04;
      ctx.lineWidth = Math.random() < 0.85 ? 1 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y + len);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Frost grain: the texture that makes surfaces read as glass ──
  function buildGrain() {
    const tile = document.createElement('canvas');
    tile.width = 160;
    tile.height = 160;

    const tctx = tile.getContext('2d');
    if (!tctx) return null;

    const img = tctx.createImageData(tile.width, tile.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 200 + Math.random() * 55;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 24;
    }
    tctx.putImageData(img, 0, 0);
    return tctx.createPattern(tile, 'repeat');
  }

  function paintGrain() {
    if (!grain) grain = buildGrain();
    if (!grain) return;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ── Soft vignette pulls focus to the center ──
  function paintVignette() {
    const cx = W / 2;
    const cy = H * 0.45;
    const grad = ctx.createRadialGradient(
      cx, cy, Math.min(W, H) * 0.25,
      cx, cy, Math.max(W, H) * 0.88
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    paintBase();
    paintScene();
    paintVeil();
    paintRain();
    paintGrain();
    paintVignette();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene = null; // rebuild at the new size
    draw();
  }

  resize();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
})();

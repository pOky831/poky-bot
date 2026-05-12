/**
 * Abstract flowing lines background animation
 * Uses bezier curves, flow fields, and connected particle networks
 */
(function () {
  const canvas = document.getElementById('animated-bg');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width, height;
  let animationId;
  let time = 0;

  // ── Color palette (matching the pOky pink theme) ──
  const palette = [
    'rgba(247, 153, 185, 0.12)',
    'rgba(224, 115, 157, 0.10)',
    'rgba(255, 180, 200, 0.09)',
    'rgba(210, 140, 170, 0.11)',
    'rgba(240, 130, 165, 0.08)',
  ];

  // ── Bezier curve paths ──
  class CurvePath {
    constructor() {
      this.reset();
    }

    reset() {
      // Start at a random edge
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0: // top
          this.x1 = Math.random() * width;
          this.y1 = -50;
          break;
        case 1: // right
          this.x1 = width + 50;
          this.y1 = Math.random() * height;
          break;
        case 2: // bottom
          this.x1 = Math.random() * width;
          this.y1 = height + 50;
          break;
        case 3: // left
          this.x1 = -50;
          this.y1 = Math.random() * height;
          break;
      }

      // End at opposite side-ish
      const endEdge = (edge + 2 + Math.floor(Math.random() * 2)) % 4;
      switch (endEdge) {
        case 0:
          this.x4 = Math.random() * width;
          this.y4 = -50;
          break;
        case 1:
          this.x4 = width + 50;
          this.y4 = Math.random() * height;
          break;
        case 2:
          this.x4 = Math.random() * width;
          this.y4 = height + 50;
          break;
        case 3:
          this.x4 = -50;
          this.y4 = Math.random() * height;
          break;
      }

      // Control points somewhere in the middle
      this.x2 = Math.random() * width;
      this.y2 = Math.random() * height;
      this.x3 = Math.random() * width;
      this.y3 = Math.random() * height;

      this.color = palette[Math.floor(Math.random() * palette.length)];
      this.lineWidth = 0.5 + Math.random() * 1.5;
      this.speed = 0.0002 + Math.random() * 0.0008;
      this.amplitude = 30 + Math.random() * 100;
      this.freqOffset = Math.random() * Math.PI * 2;
      this.opacity = 0.3 + Math.random() * 0.5;
      this.maxAge = 300 + Math.random() * 400;
      this.age = 0;
    }

    update(dt) {
      this.age += dt;
      if (this.age > this.maxAge) {
        this.reset();
        this.age = 0;
      }

      // Move control points with perlin-like sine waves for organic motion
      const t = time * this.speed;
      this.x2 += Math.sin(t + this.freqOffset) * 0.3;
      this.y2 += Math.cos(t * 1.3 + this.freqOffset) * 0.3;
      this.x3 += Math.cos(t * 0.8 + this.freqOffset + 1) * 0.3;
      this.y3 += Math.sin(t * 1.1 + this.freqOffset + 1) * 0.3;

      // Keep control points in bounds
      this.x2 = Math.max(-100, Math.min(width + 100, this.x2));
      this.y2 = Math.max(-100, Math.min(height + 100, this.y2));
      this.x3 = Math.max(-100, Math.min(width + 100, this.x3));
      this.y3 = Math.max(-100, Math.min(height + 100, this.y3));
    }

    draw(ctx) {
      // Fade in/out at edges of lifespan
      let alpha = this.opacity;
      const fadeIn = 60;
      const fadeOut = 100;
      if (this.age < fadeIn) {
        alpha *= this.age / fadeIn;
      } else if (this.age > this.maxAge - fadeOut) {
        alpha *= (this.maxAge - this.age) / fadeOut;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(this.x1, this.y1);
      ctx.bezierCurveTo(this.x2, this.y2, this.x3, this.y3, this.x4, this.y4);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.lineWidth;
      ctx.stroke();

      // Draw a subtle glow copy
      ctx.beginPath();
      ctx.moveTo(this.x1, this.y1);
      ctx.bezierCurveTo(this.x2, this.y2, this.x3, this.y3, this.x4, this.y4);
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.lineWidth * 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Particle network (constellation style) ──
  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.radius = 1 + Math.random() * 1.5;
    }

    update() {
      // Gentle flow-field like movement
      const t = time * 0.0005;
      this.vx += Math.sin(this.y * 0.01 + t) * 0.02;
      this.vy += Math.cos(this.x * 0.01 + t) * 0.02;

      // Damping
      this.vx *= 0.998;
      this.vy *= 0.998;

      this.x += this.vx;
      this.y += this.vy;

      // Wrap around
      if (this.x < -20) this.x = width + 20;
      if (this.x > width + 20) this.x = -20;
      if (this.y < -20) this.y = height + 20;
      if (this.y > height + 20) this.y = -20;
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(247, 153, 185, 0.35)';
      ctx.fill();
    }
  }

  // ── Initialize ──
  const curves = [];
  const CURVE_COUNT = 8;
  const particles = [];
  const PARTICLE_COUNT = 50;
  const MAX_CONNECT_DIST = 130;

  function init() {
    resize();
    curves.length = 0;
    for (let i = 0; i < CURVE_COUNT; i++) {
      curves.push(new CurvePath());
    }
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    // Reset all curves so their anchor points match the new dimensions
    curves.forEach(function (c) { c.reset(); });
  }

  // ── Render loop ──
  let lastTime = performance.now();

  function render(now) {
    const dt = now - lastTime;
    lastTime = now;
    time += dt;

    ctx.clearRect(0, 0, width, height);

    // Draw bezier curves
    for (const curve of curves) {
      curve.update(dt);
      curve.draw(ctx);
    }

    // Update and draw particles
    for (const p of particles) {
      p.update();
      p.draw(ctx);
    }

    // Draw connections between nearby particles (constellation lines)
    ctx.lineWidth = 0.4;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAX_CONNECT_DIST) {
          const alpha = (1 - dist / MAX_CONNECT_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(247, 153, 185, ${alpha})`;
          ctx.stroke();
        }
      }
    }

    animationId = requestAnimationFrame(render);
  }

  // ── Start ──
  window.addEventListener('resize', resize);
  init();
  animationId = requestAnimationFrame(render);
})();

/**
 * pOky Dark Theme Canvas Animation
 * Connected particle network with pulsing pink nodes and constellation lines
 */
(function () {
  const canvas = document.getElementById('bg');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  const N = 40;

  class Particle {
    constructor() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = 0.3 + Math.random() * 1.8;
      this.v = 0.3 + Math.random() * 1;
      const a = Math.random() * Math.PI * 2;
      this.dx = Math.cos(a) * this.v * 0.12;
      this.dy = Math.sin(a) * this.v * 0.12;
      this.alpha = 0.02 + Math.random() * 0.06;
      this.pk = Math.random() < 0.2;
      this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update() {
      this.x += this.dx;
      this.y += this.dy;
      this.pulsePhase += 0.02;
      if (this.x < 0 || this.x > W) this.dx *= -1;
      if (this.y < 0 || this.y > H) this.dy *= -1;
    }

    draw() {
      const pulse = 0.6 + 0.4 * Math.sin(this.pulsePhase);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * pulse, 0, Math.PI * 2);
      if (this.pk) {
        ctx.fillStyle = 'rgba(255,94,138,' + (this.alpha * pulse) + ')';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + (this.alpha * 0.5 * pulse) + ')';
      }
      ctx.fill();
    }
  }

  for (let i = 0; i < N; i++) particles.push(new Particle());

  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          const alpha = 0.035 * (1 - dist / 140) * ((particles[i].pk || particles[j].pk) ? 1.5 : 1);
          ctx.strokeStyle = 'rgba(255,94,138,' + alpha + ')';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    drawLines();
    requestAnimationFrame(animate);
  }
  animate();
})();

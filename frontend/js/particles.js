/**
 * Particle Network Animation
 * Creates a medical/tech-themed particle network effect
 */

document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];

    // Configuration
    const config = {
        particleCount: 180, // Increased density
        connectionDistance: 120, // Slightly reduced distance to keep connections clean with more particles
        mouseDistance: 250,
        baseSpeed: 0.3, // Slower movement
        color: 'rgba(255, 255, 255, 0.5)', // White particles for contrast against purple
        lineColor: 'rgba(255, 255, 255, 0.15)' // White lines
    };

    // Resize handler
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }

    // Particle class
    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * config.baseSpeed;
            this.vy = (Math.random() - 0.5) * config.baseSpeed;
            this.size = Math.random() * 2 + 1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Bounce off edges
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            // Mouse interaction
            if (mouse.x != null) {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < config.mouseDistance) {
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (config.mouseDistance - distance) / config.mouseDistance;
                    const directionX = forceDirectionX * force * config.baseSpeed; // Gentle push
                    const directionY = forceDirectionY * force * config.baseSpeed;
                    this.vx -= directionX;
                    this.vy -= directionY;
                }
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = config.color;
            ctx.fill();
        }
    }

    // Initialize
    function init() {
        resize();
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(new Particle());
        }
        animate();
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Update and draw particles
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < config.connectionDistance) {
                    ctx.beginPath();
                    ctx.strokeStyle = config.lineColor;
                    ctx.lineWidth = 1 - distance / config.connectionDistance;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(animate);
    }

    // Event listeners
    window.addEventListener('resize', resize);

    // Mouse interaction
    let mouse = { x: null, y: null };
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.x;
        mouse.y = e.y;
    });

    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });

    init();
});

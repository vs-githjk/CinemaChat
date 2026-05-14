import { useEffect, useRef } from 'react';

export default function Ballpit({ 
  count = 100, 
  gravity = 0.5, 
  friction = 0.9975, 
  wallBounce = 0.95,
  followCursor = true,
  colors = ["#7c3aed", "#fbbf24", "#ec4899"]
}) {
  const canvasRef = useRef(null);
  const ballsRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Initialize balls
    ballsRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    // Mouse tracking
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ballsRef.current.forEach((ball) => {
        // Gravity
        ball.vy += gravity;

        // Friction
        ball.vx *= friction;
        ball.vy *= friction;

        // Update position
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Wall bouncing
        if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
          ball.vx *= -wallBounce;
          ball.x = Math.max(ball.radius, Math.min(canvas.width - ball.radius, ball.x));
        }

        if (ball.y - ball.radius < 0 || ball.y + ball.radius > canvas.height) {
          ball.vy *= -wallBounce;
          ball.y = Math.max(ball.radius, Math.min(canvas.height - ball.radius, ball.y));
        }

        // Mouse interaction
        if (followCursor) {
          const dx = mouseRef.current.x - ball.x;
          const dy = mouseRef.current.y - ball.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 150) {
            const force = (150 - distance) / 150;
            ball.vx -= (dx / distance) * force * 1.5;
            ball.vy -= (dy / distance) * force * 1.5;
          }
        }

        // Draw ball
        ctx.fillStyle = ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Ball-to-ball collision
      for (let i = 0; i < ballsRef.current.length; i++) {
        for (let j = i + 1; j < ballsRef.current.length; j++) {
          const ball1 = ballsRef.current[i];
          const ball2 = ballsRef.current[j];
          
          const dx = ball2.x - ball1.x;
          const dy = ball2.y - ball1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDist = ball1.radius + ball2.radius;

          if (distance < minDist) {
            const angle = Math.atan2(dy, dx);
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);

            // Swap velocities along collision axis
            const vx1 = ball1.vx * cos + ball1.vy * sin;
            const vy1 = ball1.vy * cos - ball1.vx * sin;
            const vx2 = ball2.vx * cos + ball2.vy * sin;
            const vy2 = ball2.vy * cos - ball2.vx * sin;

            ball1.vx = vx2 * cos - vy1 * sin;
            ball1.vy = vy1 * cos + vx2 * sin;
            ball2.vx = vx1 * cos - vy2 * sin;
            ball2.vy = vy2 * cos + vx1 * sin;

            // Separate balls
            const overlap = (minDist - distance) / 2;
            ball1.x -= overlap * cos;
            ball1.y -= overlap * sin;
            ball2.x += overlap * cos;
            ball2.y += overlap * sin;
          }
        }
      }

      requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [count, gravity, friction, wallBounce, followCursor, colors]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      }}
    />
  );
}

"use client";

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Magnetic({ children }: { children: React.ReactElement }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} className="inline-block">{children}</div>;
}

export function TextReveal({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return <h2 className={className}>{children}</h2>;
}

interface Particle {
  id: number;
  x: string;
  y: string;
  opacity: number;
  duration: number;
  delay: number;
}

export function BackgroundParticles({ color = "bg-bsoft-primary/30", count = 20 }: { color?: string, count?: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: (Math.random() * 100) + "%",
      y: (Math.random() * 100) + "%",
      opacity: Math.random(),
      duration: Math.random() * 10 + 10,
      delay: Math.random() * 10
    }));
    const timer = setTimeout(() => setParticles(generated), 0);
    return () => clearTimeout(timer);
  }, [count]);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute w-1 h-1 ${color} rounded-full`}
          initial={{ x: p.x, y: p.y, opacity: p.opacity }}
          animate={{ y: ["0%", "100%"], opacity: [0, 1, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: "linear", delay: p.delay }}
        />
      ))}
    </div>
  );
}

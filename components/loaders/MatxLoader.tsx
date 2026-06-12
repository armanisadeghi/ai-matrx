import React, { useEffect, useState } from 'react';

export default function MatrxLoader() {
  const [dots, setDots] = useState([]);

  useEffect(() => {
    // Generate random grid dots
    const newDots = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2
    }));
    setDots(newDots);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-dvh bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }} />
      </div>

      {/* Floating particles */}
      {dots.map(dot => (
        <div
          key={dot.id}
          className="absolute w-1 h-1 bg-cyan-400 rounded-full"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            animation: `float ${dot.duration}s ease-in-out infinite`,
            animationDelay: `${dot.delay}s`,
            opacity: 0.6
          }}
        />
      ))}

      {/* Main loader container */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Central geometric shape */}
        <div className="relative w-32 h-32">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 border-2 border-cyan-500/30 rounded-full animate-spin-slow" />
          
          {/* Middle ring */}
          <div className="absolute inset-3 border-2 border-cyan-400/40 rounded-full animate-spin-reverse" />
          
          {/* Inner core with pulse */}
          <div className="absolute inset-6 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full animate-pulse-glow shadow-2xl shadow-cyan-500/50" />
          
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-white rounded-full animate-ping opacity-75" />
            <div className="absolute w-4 h-4 bg-white rounded-full" />
          </div>

          {/* Orbiting particles */}
          <div className="absolute inset-0 animate-spin-slow">
            <div className="absolute top-0 left-1/2 w-2 h-2 bg-cyan-400 rounded-full -ml-1" />
          </div>
          <div className="absolute inset-0 animate-spin-reverse">
            <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-blue-400 rounded-full -ml-1" />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-2xl font-light text-cyan-300 tracking-wider animate-fade-in">
            Initializing Matrx<span className="animate-pulse">...</span>
          </h2>
          
          {/* Progress bar */}
          <div className="w-64 h-0.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-progress shadow-lg shadow-cyan-500/50" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.8;
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spin-reverse {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
          }
          50% {
            opacity: 0.8;
            box-shadow: 0 0 40px rgba(6, 182, 212, 0.8);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes progress {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }

        .animate-spin-reverse {
          animation: spin-reverse 4s linear infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-progress {
          animation: progress 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
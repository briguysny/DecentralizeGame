import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useGameEngine, VIEW, NODE_R, W, rand, NODE_COST, TickerMessage } from "../hooks/useGameEngine";

// Helper function to convert any color format to rgba with opacity
const toRGBA = (color: string, opacity: number): string => {
  // For named colors and rgba/rgb strings, use a canvas element to convert
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return `rgba(0, 0, 0, ${opacity})`;
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const DecentralizationGame: React.FC = () => {
  const { state: s, dispatch: d } = useGameEngine();
  const [drag, setDrag] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: VIEW, height: VIEW });
  const [scale, setScale] = useState(1);
  const [dpr, setDpr] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickerContainerRef = useRef<HTMLDivElement>(null);

  // Set up device pixel ratio for high-DPI screens
  useEffect(() => {
    setDpr(window.devicePixelRatio || 1);
  }, []);

  // Resize canvas and update container width for ticker animations
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      setContainerWidth(containerWidth);
      const newSize = Math.min(containerWidth, VIEW);
      setCanvasSize({ width: newSize, height: newSize });
      setScale(newSize / VIEW);
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    
    // Set canvas dimensions for high-DPI display
    c.width = VIEW * dpr;
    c.height = VIEW * dpr;
    
    // Scale drawing operations based on DPR
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, VIEW, VIEW);
    
    if (s.spl && Date.now() - s.spl.t < 1000) {
      // Convert color to rgba with 25% opacity
      ctx.fillStyle = toRGBA(s.tcol, 0.25);
      ctx.beginPath();
      ctx.arc(s.spl.cx, s.spl.cy, s.spl.r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.strokeStyle = "#d1d5db";
    s.nodes.forEach((a, i) =>
      a.alive &&
      s.nodes.slice(i + 1).forEach((b) => {
        if (!b.alive) return;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      })
    );
    
    s.nodes.forEach((n) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);
      const clicked = s.clicked.has(n.id);
      ctx.fillStyle = n.alive ? (clicked ? "#ef4444" : "#fb923c") : "#9ca3af";
      ctx.fill();
      ctx.strokeStyle = "#374151";
      ctx.stroke();
    });
  }, [s.nodes, s.spl, s.clicked, s.tcol, dpr]);

  const toCanvas = useCallback((e: React.PointerEvent) => {
    const r = cv.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    
    // Convert from screen to canvas coordinates
    const x = ((e.clientX - r.left) / r.width) * VIEW;
    const y = ((e.clientY - r.top) / r.height) * VIEW;
    return { x, y };
  }, []);

  const down = useCallback((e: React.PointerEvent) => {
    const { x, y } = toCanvas(e);
    const n = s.nodes.find((v) => v.alive && Math.hypot(v.x - x, v.y - y) < NODE_R);
    if (!n) return;
    if (s.phase === "challenge") d({ t: "CLICK", id: n.id });
    else setDrag(n.id);
  }, [s.nodes, s.phase, d, toCanvas]);

  const move = useCallback((e: React.PointerEvent) => {
    if (drag == null) return;
    const { x, y } = toCanvas(e);
    d({ t: "DRAG", id: drag, x, y });
  }, [drag, d, toCanvas]);

  // Calculate ticker animation delay based on index to prevent overlap
  const getTickerDelay = (index: number) => {
    return index * 2; // 2 second spacing between messages
  };

  // Calculate animation duration based on container width
  const getAnimationDuration = useMemo(() => {
    // Base duration plus some extra time proportional to container width
    return 6 + (containerWidth / 200);
  }, [containerWidth]);

  // Create animation variants based on container width
  const tickerVariants = useMemo(() => ({
    offLeft: {
      x: -300 // Start off-screen left
    },
    offRight: {
      x: containerWidth + 300 // Ensure it exits completely off-screen right
    }
  }), [containerWidth]);

  return (
    <div className="flex flex-col items-center w-full max-w-2xl px-4 sm:px-6">
      <style>{`
        .responsive-canvas {
          width: 100%;
          height: auto;
          max-width: ${VIEW}px;
          aspect-ratio: 1/1;
          touch-action: none;
        }
      `}</style>

      <h1 className="text-xl sm:text-2xl font-bold my-3 sm:my-6">Decentralize</h1>

      <div ref={containerRef} className="relative w-full max-w-[640px]">
        <motion.canvas
          ref={cv}
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
          }}
          className="responsive-canvas border rounded-lg shadow-md touch-action-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        />

        {/* Challenge instruction overlay */}
        {s.phase === "challenge" && (
          <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="text-center text-base sm:text-lg text-gray-700 bg-white/80 px-4 py-2 rounded shadow">
              Click as many nodes as you can within 5 seconds!
            </div>
          </div>
        )}

        {s.tickers.length > 0 && (
          <div 
            ref={tickerContainerRef}
            className="absolute bottom-0 left-0 right-0 h-6 bg-white/80 border-t border-gray-200 overflow-hidden"
          >
            {s.tickers.map((ticker, index) => (
              <motion.div
                key={ticker.id}
                className="absolute top-0 left-0 h-full flex items-center px-2 font-medium text-sm whitespace-nowrap"
                style={{ color: ticker.color }}
                variants={tickerVariants}
                initial="offLeft"
                animate="offRight"
                transition={{
                  duration: getAnimationDuration,
                  delay: getTickerDelay(index),
                  ease: "linear"
                }}
                onAnimationComplete={() => {
                  console.log(`Animation completed for ticker: ${ticker.text}`);
                }}
              >
                {ticker.text}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full max-w-[640px] mt-3 sm:mt-4 p-3 sm:p-4 bg-white rounded-lg shadow-sm gap-3 sm:gap-0">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
          <span className="text-sm sm:text-base font-medium">Blocks: {s.sec}</span>
          <span className="text-sm sm:text-base font-medium">Satoshis: {s.sats}</span>
        </div>
        
        {s.phase !== "idle" && s.phase !== "result" ? (
          <button
            disabled={s.sats < NODE_COST || s.phase === "challenge" || s.phase === "confirm"}
            onClick={() => d({ t: "BUY", x: rand(W), y: rand(W) })}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 sm:py-1.5 rounded text-sm sm:text-base disabled:bg-gray-400 transition-colors"
            title={s.phase === "challenge" || s.phase === "confirm" ? "Cannot buy during this phase" : ""}
          >
            Buy Node (10 sats)
          </button>
        ) : (
          <button
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 sm:py-1.5 rounded text-sm sm:text-base transition-colors"
            onClick={() => d({ t: "START" })}
          >
            {s.sec ? "Restart" : "Start"}
          </button>
        )}
      </div>

      {s.overlay && s.phase !== "challenge" && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl max-w-md w-full space-y-4 text-center mx-4">
            <p className="text-base sm:text-lg font-medium">{s.overlay}</p>
            {s.phase === "idle" && (
              <>
                <p className="text-center text-base sm:text-lg text-gray-700 px-4">
                  Disasters will strike. Drag nodes to maintain a decentralized, robust network.
                </p>
                <button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded text-sm sm:text-base transition-colors"
                  onClick={() => d({ t: "START" })}
                >
                  Start
                </button>
              </>
            )}
            {s.phase === "confirm" && (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  className="w-full bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded text-sm sm:text-base transition-colors"
                  onClick={() => d({ t: "BEGIN_CHAL" })}
                >
                  Approve
                </button>
                <button
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded text-sm sm:text-base transition-colors"
                  onClick={() => d({ t: "REJECT" })}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DecentralizationGame;

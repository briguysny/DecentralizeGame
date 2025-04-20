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

// Constants for game layout
const TICKER_HEIGHT = 36; // Height in pixels for the ticker area
const TICKER_HEIGHT_RATIO = TICKER_HEIGHT / VIEW; // As a ratio of the canvas height

const DecentralizationGame: React.FC = () => {
  const { state: s, dispatch: d } = useGameEngine();
  const [drag, setDrag] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: VIEW, height: VIEW });
  const [scale, setScale] = useState(1);
  const [dpr, setDpr] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [highestBlockHeight, setHighestBlockHeight] = useState(0);
  const [highestNodeCount, setHighestNodeCount] = useState(0);
  const [touchFeedback, setTouchFeedback] = useState<{x: number, y: number, active: boolean} | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const [countdownTime, setCountdownTime] = useState<number | null>(null);

  // Reset high scores function
  const resetHighScores = useCallback(() => {
    setHighestBlockHeight(0);
    setHighestNodeCount(0);
    localStorage.removeItem('highestBlockHeight');
    localStorage.removeItem('highestNodeCount');
  }, []);

  // Set up device pixel ratio for high-DPI screens
  useEffect(() => {
    setDpr(window.devicePixelRatio || 1);
  }, []);

  // Track highest block height
  useEffect(() => {
    if (s.sec > highestBlockHeight) {
      setHighestBlockHeight(s.sec);
    }
  }, [s.sec, highestBlockHeight]);

  // Track highest number of alive nodes
  useEffect(() => {
    const aliveNodesCount = s.nodes.filter(n => n.alive).length;
    if (aliveNodesCount > highestNodeCount) {
      setHighestNodeCount(aliveNodesCount);
    }
  }, [s.nodes, highestNodeCount]);

  // Reset high scores when the page is loaded
  useEffect(() => {
    const storedHighestBlockHeight = localStorage.getItem('highestBlockHeight');
    const storedHighestNodeCount = localStorage.getItem('highestNodeCount');
    
    if (storedHighestBlockHeight) {
      setHighestBlockHeight(parseInt(storedHighestBlockHeight, 10));
    }
    
    if (storedHighestNodeCount) {
      setHighestNodeCount(parseInt(storedHighestNodeCount, 10));
    }
  }, []);

  // Update localStorage when high scores change
  useEffect(() => {
    localStorage.setItem('highestBlockHeight', highestBlockHeight.toString());
    localStorage.setItem('highestNodeCount', highestNodeCount.toString());
  }, [highestBlockHeight, highestNodeCount]);

  // Update countdown timer for confirmation phase
  useEffect(() => {
    if (s.phase !== "confirm" || !s.confirmStart) {
      setCountdownTime(null);
      return;
    }
    
    // Initialize countdown to 9 seconds
    setCountdownTime(9);
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
      setCountdownTime(prev => {
        if (prev === null) return null;
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    
    // Ensure we reach exactly 0 when timer ends
    const totalDuration = 9000; // 9 seconds in ms
    const endTimer = setTimeout(() => {
      setCountdownTime(0);
    }, totalDuration);
    
    return () => {
      clearInterval(countdownInterval);
      clearTimeout(endTimer);
    };
  }, [s.phase, s.confirmStart]);

  // Resize canvas, update container width for ticker animations, and detect mobile
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const windowWidth = window.innerWidth;
      
      // Set mobile state based on screen width
      setIsMobile(windowWidth < 768);
      
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
    
    // Draw a subtle line to indicate the non-playable zone
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(0, VIEW - TICKER_HEIGHT);
    ctx.lineTo(VIEW, VIEW - TICKER_HEIGHT);
    ctx.stroke();
    
    // Optional: shade the non-playable area slightly
    ctx.fillStyle = "rgba(229, 231, 235, 0.2)";
    ctx.fillRect(0, VIEW - TICKER_HEIGHT, VIEW, TICKER_HEIGHT);
    
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
    
    // Draw touch feedback indicator if active (only on mobile)
    if (isMobile && touchFeedback && touchFeedback.active) {
      ctx.beginPath();
      ctx.arc(touchFeedback.x, touchFeedback.y, NODE_R * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59, 130, 246, 0.3)"; // Light blue feedback
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(touchFeedback.x, touchFeedback.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59, 130, 246, 0.8)"; // Darker blue center
      ctx.fill();
    }
    
    s.nodes.forEach((n) => {
      ctx.beginPath();
      
      // Draw a slightly larger highlight for the node currently being dragged
      if (drag === n.id) {
        ctx.arc(n.x, n.y, NODE_R * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(251, 146, 60, 0.3)"; // Light orange glow
        ctx.fill();
      }
      
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);
      const clicked = s.clicked.has(n.id);
      
      // Use a brighter color for the dragged node
      if (n.alive && drag === n.id) {
        ctx.fillStyle = "#f97316"; // Brighter orange for dragged node
      } else {
        ctx.fillStyle = n.alive ? (clicked ? "#ef4444" : "#fb923c") : "#9ca3af";
      }
      
      ctx.fill();
      ctx.strokeStyle = "#374151";
      ctx.stroke();
    });
  }, [s.nodes, s.spl, s.clicked, s.tcol, dpr, drag, isMobile, touchFeedback]);

  const toCanvas = useCallback((e: React.PointerEvent) => {
    const r = cv.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    
    // Convert from screen to canvas coordinates
    const x = ((e.clientX - r.left) / r.width) * VIEW;
    const y = ((e.clientY - r.top) / r.height) * VIEW;
    return { x, y };
  }, []);

  // Helper function to find the closest node to a point
  const findClosestNode = useCallback((x: number, y: number, radius: number) => {
    // Find all nodes within hit radius
    const nearbyNodes = s.nodes.filter(v => v.alive && Math.hypot(v.x - x, v.y - y) < radius);
    
    if (nearbyNodes.length === 0) return null;
    
    // If multiple nodes are within hit radius, select the closest one
    if (nearbyNodes.length > 1) {
      return nearbyNodes.reduce((closest, current) => {
        const closestDist = Math.hypot(closest.x - x, closest.y - y);
        const currentDist = Math.hypot(current.x - x, current.y - y);
        return currentDist < closestDist ? current : closest;
      });
    }
    
    // If only one node is nearby, return it
    return nearbyNodes[0];
  }, [s.nodes]);

  const down = useCallback((e: React.PointerEvent) => {
    const { x, y } = toCanvas(e);
    
    // Don't allow interaction in game over state
    if (s.phase === "gameover") return;
    
    // Use larger hit detection radius on mobile devices - further increased
    const hitRadius = isMobile ? NODE_R * 2.0 : NODE_R; // 100% increase for mobile
    
    // Find the closest node within hit radius
    const closestNode = findClosestNode(x, y, hitRadius);
    if (!closestNode) return;
    
    if (s.phase === "challenge") d({ t: "CLICK", id: closestNode.id });
    else setDrag(closestNode.id);
  }, [s.phase, d, toCanvas, isMobile, findClosestNode]);

  const move = useCallback((e: React.PointerEvent) => {
    // Skip if we're not dragging or in game over state
    if (drag == null || s.phase === "gameover") return;
    
    const { x: rawX, y: rawY } = toCanvas(e);
    
    // Constrain coordinates to valid canvas boundaries
    const x = Math.min(Math.max(rawX, NODE_R), VIEW - NODE_R);
    const y = Math.min(Math.max(rawY, NODE_R), VIEW - TICKER_HEIGHT - NODE_R);
    
    // Find the current node being dragged
    const draggedNode = s.nodes.find(n => n.id === drag);
    if (!draggedNode) return;
    
    // Apply magnetism effect for smoother control
    const magnetism = isMobile ? 0.85 : 0.95; // More smoothing on mobile
    
    const smoothX = draggedNode.x + (x - draggedNode.x) * magnetism;
    const smoothY = draggedNode.y + (y - draggedNode.y) * magnetism;
    
    // Update node position
    d({ t: "DRAG", id: drag, x: smoothX, y: smoothY });
  }, [drag, d, toCanvas, s.phase, VIEW, isMobile, s.nodes]);

  // Add a touch-friendly function for handling touch events on mobile
  useEffect(() => {
    // Only apply special touch handling on mobile devices
    if (!isMobile) return;
    
    const canvas = cv.current;
    if (!canvas) return;
    
    // Enhanced touch start handler with improved node selection
    const handleTouchStart = (e: TouchEvent) => {
      // Prevent scrolling/zooming while interacting with the canvas
      if (e.touches.length === 1) {
        e.preventDefault();
        
        // Only process touch events in non-gameover state
        if (s.phase === "gameover") return;
        
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        
        // Convert touch coordinates to canvas coordinates
        const x = ((touch.clientX - rect.left) / rect.width) * VIEW;
        const y = ((touch.clientY - rect.top) / rect.height) * VIEW;
        
        // Use enhanced hit radius for mobile - further increased
        const hitRadius = NODE_R * 2.0; // 100% increase for mobile touch
        
        // Show touch feedback at this location
        setTouchFeedback({x, y, active: true});
        
        // Clear the feedback after a short delay
        setTimeout(() => {
          setTouchFeedback(null);
        }, 300);
        
        // Find the closest node within hit radius
        const closestNode = findClosestNode(x, y, hitRadius);
        if (!closestNode) return;
        
        if (s.phase === "challenge") {
          d({ t: "CLICK", id: closestNode.id });
        } else {
          setDrag(closestNode.id);
        }
      }
    };
    
    // Handle touch events to prevent dragging issues
    const handleTouchMove = (e: TouchEvent) => {
      if (drag !== null) {
        e.preventDefault(); // Prevent scrolling while dragging
      }
    };
    
    // Global touch move handler for continuous dragging with constraints
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (drag === null || !canvas) return;
      
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      
      // Get canvas boundaries
      const rect = canvas.getBoundingClientRect();
      
      // Convert touch coordinates to canvas coordinates
      let x = ((touch.clientX - rect.left) / rect.width) * VIEW;
      let y = ((touch.clientY - rect.top) / rect.height) * VIEW;
      
      // Constrain coordinates to valid canvas boundaries
      x = Math.min(Math.max(x, NODE_R), VIEW - NODE_R);
      y = Math.min(Math.max(y, NODE_R), VIEW - TICKER_HEIGHT - NODE_R);
      
      // Find the current node being dragged
      const draggedNode = s.nodes.find(n => n.id === drag);
      if (!draggedNode) return;
      
      // Update node position with a slight smoothing/magnetism effect
      // This makes it easier to control on mobile by slightly magnetizing to the touch point
      const magnetism = 0.85; // Higher = more responsive, Lower = more smoothing
      
      const smoothX = draggedNode.x + (x - draggedNode.x) * magnetism;
      const smoothY = draggedNode.y + (y - draggedNode.y) * magnetism;
      
      d({ t: "DRAG", id: drag, x: smoothX, y: smoothY });
    };
    
    // Make sure touch events have proper handling for better mobile experience
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    // Add global touch handlers
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    
    // Add global touch end listener
    const handleGlobalTouchEnd = () => {
      if (drag !== null) {
        setDrag(null);
      }
    };
    
    window.addEventListener('touchend', handleGlobalTouchEnd);
    
    return () => {
      // Clean up event listeners on unmount
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isMobile, drag, d, VIEW, findClosestNode, s.phase]);

  // Handle global pointer events for continuous dragging
  useEffect(() => {
    // Only set up global handlers if we're actively dragging
    if (drag === null) return;
    
    // Create handler for global pointer movement
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (drag === null || !cv.current) return;
      
      // Get canvas boundaries
      const rect = cv.current.getBoundingClientRect();
      
      // Convert global coordinates to canvas coordinates
      let x = ((e.clientX - rect.left) / rect.width) * VIEW;
      let y = ((e.clientY - rect.top) / rect.height) * VIEW;
      
      // Constrain coordinates to valid canvas boundaries
      x = Math.min(Math.max(x, NODE_R), VIEW - NODE_R);
      y = Math.min(Math.max(y, NODE_R), VIEW - TICKER_HEIGHT - NODE_R);
      
      // Find the current node being dragged
      const draggedNode = s.nodes.find(n => n.id === drag);
      if (!draggedNode) return;
      
      // Update node position with a slight smoothing/magnetism effect on mobile
      // This makes it easier to control by slightly magnetizing to the pointer
      const magnetism = isMobile ? 0.85 : 0.95; // More smoothing on mobile
      
      const smoothX = draggedNode.x + (x - draggedNode.x) * magnetism;
      const smoothY = draggedNode.y + (y - draggedNode.y) * magnetism;
      
      // Always update position with constraints
      d({ t: "DRAG", id: drag, x: smoothX, y: smoothY });
    };
    
    // Handle global pointer release to end dragging
    const handleGlobalPointerUp = () => {
      setDrag(null);
    };
    
    // Add global event listeners
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    
    // Clean up on unmount or when drag state changes
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [drag, d, VIEW]);

  // Calculate ticker animation delay based on index to prevent overlap
  const getTickerDelay = (index: number) => {
    return index * 2; // 2 second spacing between messages
  };

  // Calculate animation duration based on container width
  const getAnimationDuration = useMemo(() => {
    // Base duration plus some extra time proportional to container width
    // Ensure it's long enough for the ticker to be readable
    return 8 + (containerWidth / 150); // Longer duration for better readability
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

  // Function to calculate a small random offset for ticker starting positions
  const getRandomOffset = useCallback(() => {
    return Math.floor(Math.random() * 200) - 100; // Random value between -100 and 100 for more spacing
  }, []);

  // Create a safe random Y position for new nodes (above ticker zone)
  const getRandomSafeY = useCallback(() => {
    // Add extra margin to ensure nodes are never placed in or too close to the ticker area
    const safeMargin = NODE_R * 2; // Ensure minimum margin of twice the node radius
    const maxY = VIEW - TICKER_HEIGHT - safeMargin;
    return Math.min(rand(maxY - NODE_R) + NODE_R, maxY);
  }, []);

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
        
        @keyframes deplete {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>

      <div className="w-full max-w-[640px] flex flex-col sm:flex-row sm:justify-between sm:items-start my-3 sm:my-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-0">Decentralize the Network!</h1>
        
        <div className="flex flex-col sm:flex-col text-gray-600 text-sm sm:text-base">
          <div className="flex items-center mb-1">
            <span className="text-yellow-500 mr-1">🏆</span>
            <span>Max Block Height: <span className="font-medium">{highestBlockHeight}</span></span>
          </div>
          <div className="flex items-center">
            <span className="text-yellow-500 mr-1">🏆</span>
            <span>Max Active Nodes: <span className="font-medium">{highestNodeCount}</span></span>
          </div>
        </div>
      </div>

      {/* Challenge instruction banner above canvas */}
      {s.phase === "challenge" && (
        <div className="w-full max-w-[640px] mb-2 bg-yellow-50 border border-yellow-200 rounded-md p-2.5 shadow-sm">
          <div className="text-center text-base font-medium text-yellow-800">
            Click on the majority of orange nodes within 5 seconds!
          </div>
        </div>
      )}

      <div ref={containerRef} className="relative w-full max-w-[640px]">
        <motion.canvas
          ref={cv}
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
          }}
          className="responsive-canvas border rounded-lg shadow-md"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => setDrag(null)}
        />

        {s.tickers.length > 0 && (
          <div 
            ref={tickerContainerRef}
            className="absolute bottom-0 left-0 right-0 h-9 bg-white/80 border-t border-gray-200 overflow-hidden"
          >
            {s.tickers.map((ticker, index) => (
              <motion.div
                key={ticker.id}
                className="absolute h-full flex items-center px-2 font-medium text-sm whitespace-nowrap"
                style={{ 
                  color: ticker.color,
                  top: 0, // Position at the top of the container
                  bottom: 0, // Stretch to bottom
                  height: '100%' // Full height of the container
                }}
                initial={{ x: -300 + getRandomOffset() }} // Slight randomization to starting position
                animate={{ x: containerWidth + 300 }} // Animate to off-screen right
                transition={{
                  duration: getAnimationDuration,
                  ease: "linear",
                  delay: 0 // No delay for immediate appearance
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
          <span className="text-sm sm:text-base font-medium">Block Height: {s.sec}</span>
          <span className="text-sm sm:text-base font-medium">Satoshis: {s.sats}</span>
        </div>
        
        {s.phase !== "idle" && s.phase !== "result" && s.phase !== "gameover" ? (
          <button
            disabled={s.sats < s.nodeCost || s.phase === "challenge" || s.phase === "confirm"}
            onClick={() => d({ t: "BUY", x: rand(W), y: getRandomSafeY() })}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 sm:py-1.5 rounded text-sm sm:text-base disabled:bg-gray-400 transition-colors"
            title={s.phase === "challenge" || s.phase === "confirm" ? "Cannot buy during this phase" : ""}
          >
            Buy Node ({s.nodeCost} sats)
          </button>
        ) : (
          <button
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 sm:py-1.5 rounded text-sm sm:text-base transition-colors"
            onClick={() => d({ t: "START" })}
          >
            {s.sec || s.phase === "gameover" ? "Restart" : "Start"}
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
            {s.phase === "gameover" && (
              <>
                <p className="text-center text-base sm:text-lg text-red-700 px-4 mb-3">
                  Your network reached block height {s.sec} before collapsing.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-4 border border-gray-200">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">High Scores</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                      <div className="text-xs sm:text-sm text-gray-500">Max Block Height</div>
                      <div className="text-lg sm:text-xl font-bold text-indigo-600 flex items-center">
                        {highestBlockHeight}
                        {s.sec === highestBlockHeight && s.sec > 0 && (
                          <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">New!</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                      <div className="text-xs sm:text-sm text-gray-500">Max Active Nodes</div>
                      <div className="text-lg sm:text-xl font-bold text-orange-600 flex items-center">
                        {highestNodeCount}
                        {highestNodeCount > 0 && 
                         // Check if the current game's max node count matched the all-time high
                         // and that this happened in the current game (not a previous one)
                         highestNodeCount === s.nodes.length && 
                         s.nodes.some(n => !n.alive) && // Only show if some nodes have died (game has progressed)
                         (
                          <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">New!</span>
                         )
                        }
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 text-center flex items-center justify-center">
                    <span>High scores are saved in your browser</span>
                    <button 
                      onClick={resetHighScores}
                      className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                      title="Reset high scores"
                    >
                      (Reset)
                    </button>
                  </div>
                </div>
                
                <button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded text-sm sm:text-base transition-colors"
                  onClick={() => d({ t: "START" })}
                >
                  Restart
                </button>
              </>
            )}
            {s.phase === "confirm" && (
              <>
                <p className="text-center text-base sm:text-lg text-gray-700 px-4 mb-2">
                  Select the majority of nodes to pass this proposal. Failure may lead to a hard fork, and all non-participating nodes will be lost.
                </p>
                
                {/* Countdown timer */}
                <div className="mb-4 flex flex-col items-center">
                  <div className="text-sm text-gray-500 mb-1">Time remaining to decide:</div>
                  <div className="relative w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      key={s.confirmStart || 'no-confirm'}
                      className="absolute top-0 left-0 h-full bg-blue-500"
                      style={{ 
                        animation: s.phase === "confirm" ? "deplete 9s linear forwards" : "none",
                        width: s.phase !== "confirm" ? "0%" : undefined
                      }}
                    ></div>
                  </div>
                  <div className="text-lg font-semibold mt-1">{countdownTime || 0} seconds</div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg text-base font-medium transition-colors flex items-center justify-center"
                    onClick={() => d({ t: "BEGIN_CHAL" })}
                  >
                    Yes <span className="ml-2 text-white">✓</span>
                  </button>
                  <button
                    className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg text-base font-medium transition-colors flex items-center justify-center"
                    onClick={() => d({ t: "REJECT" })}
                  >
                    No <span className="ml-2 text-white">✗</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DecentralizationGame;

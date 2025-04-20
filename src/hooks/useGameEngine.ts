import { useReducer, useEffect } from "react";

export const VIEW = 640;
export const W = VIEW; // Alias for backward compatibility
export const NODE_R = 12;

export const NODE_COST = 10;
const DISASTER_MS = 5000;
const UPGRADE_MS = 30000;
const CHALLENGE_MS = 5000;
const RESUME_MS = 3000;
const CONFIRM_MS = 9000;
const TICKER_HEIGHT = 36; // Height reserved for ticker area - match component's value

export const DISASTERS = [
  { name: "Power Outage", radius: 100, color: "#f97316" },
  { name: "Solar Flare", radius: 140, color: "#a855f7" },
  { name: "Government Censorship", radius: 120, color: "#dc2626" },
  { name: "Cable Cut", radius: 110, color: "#3b82f6" },
  { name: "DNS Poisoning", radius: 130, color: "#16a34a" },
  { name: "Quantum Attack", radius: 125, color: "#facc15" },
  { name: "Malware Outbreak", radius: 135, color: "#e11d48" },
  { name: "Border Gateway Hijack", radius: 115, color: "#06b6d4" },
  { name: "Internet Blackout", radius: 145, color: "#475569" },
  { name: "Legal Ban", radius: 105, color: "#f59e0b" },
] as const;

export type GamePhase = "idle" | "main" | "confirm" | "challenge" | "result" | "gameover";

export interface Node {
  id: number;
  x: number;
  y: number;
  alive: boolean;
}

// Define the TickerMessage interface
export interface TickerMessage {
  id: string;
  text: string;
  color: string;
  createdAt: number;
}

export interface GameState {
  nodes: Node[];
  sats: number;
  sec: number;
  run: boolean;
  overlay: string | null;
  spl: { cx: number; cy: number; r: number; t: number } | null;
  tick: string;
  tcol: string;
  phase: GamePhase;
  clicked: Set<number>;
  confirmStart: number | null;
  tickers: TickerMessage[];
  nodeCost: number;
  bipNumber: number | null; // BIP number for upgrade proposals
}

export type GameAction =
  | { t: "START" }
  | { t: "TICK" }
  | { t: "DIS"; sp: { cx: number; cy: number; r: number; t: number }; txt: string; col: string }
  | { t: "BUY"; x: number; y: number }
  | { t: "DRAG"; id: number; x: number; y: number }
  | { t: "UPGRADE_POP" }
  | { t: "BEGIN_CHAL" }
  | { t: "REJECT" }
  | { t: "CLICK"; id: number }
  | { t: "END_CHAL" }
  | { t: "RESUME" }
  | { t: "CLEANUP_TICKERS"; tickers: TickerMessage[] };

export const rand = (m: number) => Math.random() * m;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// Create a node at a random position, ensuring it's above the ticker area
const node = (i: number): Node => {
  // Calculate a safe Y position that's comfortably above the ticker area
  // Add extra margin to ensure nodes are never placed in or too close to the ticker area
  const safeMargin = NODE_R * 2; // Ensure minimum margin of twice the node radius
  const maxY = VIEW - TICKER_HEIGHT - safeMargin;
  const safeY = Math.min(rand(maxY - NODE_R) + NODE_R, maxY);
  
  return { 
    id: i, 
    x: rand(VIEW - NODE_R * 2) + NODE_R, // Also keep nodes away from horizontal edges
    y: safeY, 
    alive: true 
  };
};

export const initialState: GameState = {
  nodes: Array.from({ length: 12 }, (_, i) => node(i)),
  sats: 0,
  sec: 0,
  run: false,
  overlay: "Click Start",
  spl: null,
  tick: "",
  tcol: "#000",
  phase: "idle",
  clicked: new Set(),
  confirmStart: null,
  tickers: [],
  nodeCost: NODE_COST,
  bipNumber: null
};

export function reducer(s: GameState, a: GameAction): GameState {
  // First check if we need to enter game over state (except during initialization or restart)
  if (a.t !== "START" && s.phase !== "idle" && s.phase !== "gameover") {
    const aliveNodesCount = s.nodes.filter(n => n.alive).length;
    if (aliveNodesCount < 2) {
      return {
        ...s,
        run: false,
        overlay: "Network Failure. Too few nodes remain to sustain decentralization.",
        phase: "gameover"
      };
    }
  }

  switch (a.t) {
    case "START":
      return { 
        ...initialState, 
        nodes: Array.from({ length: 12 }, (_, i) => node(i)),
        run: true, 
        overlay: null, 
        phase: "main", 
        nodeCost: NODE_COST,
        bipNumber: null
      };
    case "TICK":
      return s.run ? { ...s, sec: s.sec + 1, sats: s.sats + 1 } : s;
    case "DIS": {
      if (s.phase !== "main") return s;
      const nodes = s.nodes.map((n) =>
        n.alive && dist(n.x, n.y, a.sp.cx, a.sp.cy) < a.sp.r ? { ...n, alive: false } : n
      );
      
      // Create a unique ticker message for each disaster, don't check for duplicates
      // This ensures each disaster gets its own ticker message
      const tickerId = `ticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTicker = {
        id: tickerId,
        text: a.txt,
        color: a.col,
        createdAt: Date.now()
      };
      
      // Append the new ticker to the existing tickers
      const tickers = [...s.tickers, newTicker];

      const newState = { 
        ...s, 
        nodes, 
        sats: s.sats + 2, 
        spl: a.sp, 
        tick: a.txt, 
        tcol: a.col,
        tickers 
      };
      
      // Check if game over after disaster
      const aliveNodesCount = nodes.filter(n => n.alive).length;
      if (aliveNodesCount < 2) {
        return {
          ...newState,
          run: false,
          overlay: "Network Failure. Too few nodes remain to sustain decentralization.",
          phase: "gameover"
        };
      }
      
      return newState;
    }
    case "BUY":
      if (!s.run || s.sats < s.nodeCost) return s;
      return {
        ...s,
        sats: s.sats - s.nodeCost,
        nodes: [...s.nodes, { id: s.nodes.length, x: a.x, y: a.y, alive: true }],
        nodeCost: s.nodeCost + 1,
      };
    case "DRAG":
      return {
        ...s,
        nodes: s.nodes.map((n) => (n.id === a.id ? { ...n, x: a.x, y: a.y } : n)),
      };
    case "UPGRADE_POP":
      // Generate a random BIP number between 300-399
      const bipNumber = Math.floor(Math.random() * 100) + 300;
      return {
        ...s,
        run: false,
        overlay: `Attempt BIP ${bipNumber}`,
        phase: "confirm",
        confirmStart: Date.now(),
        bipNumber
      };
    case "BEGIN_CHAL":
      return { 
        ...s, 
        overlay: null,
        phase: "challenge", 
        clicked: new Set() 
      };
    case "REJECT":
      return { 
        ...s, 
        overlay: null, 
        run: true, 
        phase: "main",
        bipNumber: null
      };
    case "CLICK": {
      if (s.phase !== "challenge") return s;
      const set = new Set(s.clicked);
      set.add(a.id);
      return { ...s, clicked: set };
    }
    case "END_CHAL": {
      const aliveNodes = s.nodes.filter((n) => n.alive);
      const total = aliveNodes.length;
      // Change to 50% threshold (just over half)
      const needed = Math.ceil(total * 0.5);
      const win = s.clicked.size >= needed;
      
      let nodes = [...s.nodes];
      
      if (!win) {
        // Only make the unclicked alive nodes turn gray
        nodes = nodes.map(node => {
          if (node.alive && !s.clicked.has(node.id)) {
            return { ...node, alive: false };
          }
          return node;
        });
        
        // Check if this caused game over
        const remainingAliveNodes = nodes.filter(n => n.alive).length;
        if (remainingAliveNodes < 2) {
          // Create a game over result ticker
          const gameOverTicker = {
            id: `ticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: s.bipNumber ? `Network collapse after failed BIP ${s.bipNumber}` : "Network collapse after failed upgrade",
            color: "#ef4444",
            createdAt: Date.now()
          };
          
          return {
            ...s,
            nodes,
            overlay: "Network Failure. Too few nodes remain to sustain decentralization.",
            tickers: [...s.tickers, gameOverTicker],
            tick: "Network collapse after failed upgrade",
            tcol: "#ef4444",
            run: false,
            phase: "gameover"
          };
        }
      }
      
      // Create ticker for challenge result
      const bipReference = s.bipNumber ? `BIP ${s.bipNumber}` : "Upgrade";
      const text = win ? `${bipReference} accepted` : `${bipReference} rejected - partial hard fork`;
      const color = win ? "#10b981" : "#ef4444";
      
      // Create a unique ticker for the challenge result
      const newTicker = {
        id: `ticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text,
        color,
        createdAt: Date.now()
      };
      
      // Add the new ticker to the existing tickers
      const tickers = [...s.tickers, newTicker];
      
      return {
        ...s,
        overlay: win ? `${bipReference} accepted +50 sats` : `${bipReference} rejected - nodes lost in hard fork`,
        sats: win ? s.sats + 50 : s.sats,
        nodes,
        tick: text,
        tcol: color,
        tickers,
        phase: "result",
        bipNumber: null
      };
    }
    case "RESUME":
      return { 
        ...s, 
        overlay: null, 
        run: true, 
        phase: "main",
        clicked: new Set(), // Clear clicked state on resume
        bipNumber: null // Clear BIP number on resume
      };
    case "CLEANUP_TICKERS":
      return { ...s, tickers: a.tickers };
    default:
      return s;
  }
}

export function useGameEngine() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Cleanup old ticker messages
  useEffect(() => {
    const TICKER_LIFESPAN = 15000; // 15 seconds (longer than the animation duration)
    
    // Only run cleanup when we have tickers
    if (state.tickers.length === 0) return;
    
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      // Filter out tickers that have exceeded their lifespan
      const updatedTickers = state.tickers.filter(ticker => {
        return now - ticker.createdAt < TICKER_LIFESPAN;
      });
      
      // Only dispatch if we're actually removing tickers
      if (updatedTickers.length < state.tickers.length) {
        dispatch({
          t: "CLEANUP_TICKERS",
          tickers: updatedTickers
        });
      }
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(cleanupInterval);
  }, [state.tickers]);

  useEffect(() => {
    if (state.phase !== "main") return;
    const tick = setInterval(() => dispatch({ t: "TICK" }), 1000);
    const disaster = setInterval(() => {
      const d = DISASTERS[Math.floor(Math.random() * DISASTERS.length)];
      
      // Calculate disaster position with a safe margin from the ticker area
      const safeMaxY = VIEW - TICKER_HEIGHT - d.radius;
      const disasterY = rand(safeMaxY);
      
      dispatch({
        t: "DIS",
        sp: { cx: rand(VIEW), cy: disasterY, r: d.radius, t: Date.now() },
        txt: d.name,
        col: d.color,
      });
    }, DISASTER_MS);
    const upgrade = setInterval(() => dispatch({ t: "UPGRADE_POP" }), UPGRADE_MS);
    return () => {
      clearInterval(tick);
      clearInterval(disaster);
      clearInterval(upgrade);
    };
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "challenge") return;
    const id = setTimeout(() => dispatch({ t: "END_CHAL" }), CHALLENGE_MS);
    return () => clearTimeout(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "result") return;
    const id = setTimeout(() => dispatch({ t: "RESUME" }), RESUME_MS);
    return () => clearTimeout(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "confirm" || !state.confirmStart) return;
    const id = setTimeout(() => dispatch({ t: "REJECT" }), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [state.phase, state.confirmStart]);

  return { state, dispatch };
}

import { useReducer, useEffect } from "react";

export const VIEW = 640;
export const W = VIEW; // Alias for backward compatibility
export const NODE_R = 12;

export const NODE_COST = 10;
const DISASTER_MS = 5000;
const UPGRADE_MS = 30000;
const CHALLENGE_MS = 5000;
const RESUME_MS = 3000;
const CONFIRM_MS = 5000;

export const DISASTERS = [
  { name: "Power Outage", radius: 100, color: "#fbbf24" },
  { name: "Government Censorship", radius: 120, color: "#ef4444" },
  { name: "Solar Flare", radius: 140, color: "#7c3aed" },
] as const;

export type GamePhase = "idle" | "main" | "confirm" | "challenge" | "result";

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
  tickers: TickerMessage[]; // New array to hold ticker messages
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
const node = (i: number): Node => ({ id: i, x: rand(VIEW), y: rand(VIEW), alive: true });

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
  tickers: [], // Initialize empty tickers array
};

export function reducer(s: GameState, a: GameAction): GameState {
  switch (a.t) {
    case "START":
      return { ...s, run: true, overlay: null, phase: "main" };
    case "TICK":
      return s.run ? { ...s, sec: s.sec + 1, sats: s.sats + 1 } : s;
    case "DIS": {
      if (s.phase !== "main") return s;
      const nodes = s.nodes.map((n) =>
        n.alive && dist(n.x, n.y, a.sp.cx, a.sp.cy) < a.sp.r ? { ...n, alive: false } : n
      );
      
      // Check if we already have a ticker with this text
      const existingTickerIndex = s.tickers.findIndex(ticker => ticker.text === a.txt);
      
      // Create new tickers array
      let tickers = [...s.tickers];
      
      // Only add new ticker if text doesn't already exist
      if (existingTickerIndex === -1) {
        tickers.push({
          id: `ticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: a.txt,
          color: a.col,
          createdAt: Date.now()
        });
      }
      
      return { 
        ...s, 
        nodes, 
        sats: s.sats + 2, 
        spl: a.sp, 
        tick: a.txt, 
        tcol: a.col,
        tickers 
      };
    }
    case "BUY":
      if (!s.run || s.sats < NODE_COST) return s;
      return {
        ...s,
        sats: s.sats - NODE_COST,
        nodes: [...s.nodes, { id: s.nodes.length, x: a.x, y: a.y, alive: true }],
      };
    case "DRAG":
      return {
        ...s,
        nodes: s.nodes.map((n) => (n.id === a.id ? { ...n, x: a.x, y: a.y } : n)),
      };
    case "UPGRADE_POP":
      return {
        ...s,
        run: false,
        overlay: "Approve upgrade?",
        phase: "confirm",
        confirmStart: Date.now(),
      };
    case "BEGIN_CHAL":
      return { ...s, overlay: null, phase: "challenge", clicked: new Set() };
    case "REJECT":
      return { ...s, overlay: null, run: true, phase: "main" };
    case "CLICK": {
      if (s.phase !== "challenge") return s;
      const set = new Set(s.clicked);
      set.add(a.id);
      return { ...s, clicked: set };
    }
    case "END_CHAL": {
      const total = s.nodes.filter((n) => n.alive).length;
      const needed = Math.ceil(total * 0.66);
      const win = s.clicked.size >= needed;
      let nodes = s.nodes;
      if (!win) {
        const alive = s.nodes.filter((n) => n.alive);
        const lose = Math.floor(alive.length * 0.33);
        for (let i = 0; i < lose; i++) alive[i].alive = false;
        nodes = [...alive, ...s.nodes.filter((n) => !n.alive)];
      }
      
      // Create ticker for challenge result
      const text = win ? "Upgrade success" : "Upgrade failed";
      const color = win ? "#10b981" : "#ef4444";
      
      // Check if we already have a ticker with this text
      const existingTickerIndex = s.tickers.findIndex(ticker => ticker.text === text);
      
      // Create new tickers array
      let tickers = [...s.tickers];
      
      // Only add new ticker if text doesn't already exist
      if (existingTickerIndex === -1) {
        tickers.push({
          id: `ticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text,
          color,
          createdAt: Date.now()
        });
      }
      
      return {
        ...s,
        overlay: win ? "Upgrade success +50 sats" : "Upgrade failed -33% nodes",
        sats: win ? s.sats + 50 : s.sats,
        nodes,
        tick: text,
        tcol: color,
        tickers,
        phase: "result",
      };
    }
    case "RESUME":
      return { ...s, overlay: null, run: true, phase: "main" };
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
    const TICKER_LIFESPAN = 10000; // 10 seconds (longer than the animation duration)
    
    // Only run cleanup when we have tickers
    if (state.tickers.length === 0) return;
    
    const now = Date.now();
    const cleanupInterval = setInterval(() => {
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
      dispatch({
        t: "DIS",
        sp: { cx: rand(VIEW), cy: rand(VIEW), r: d.radius, t: Date.now() },
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
  }, [state.phase, state.clicked]);

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

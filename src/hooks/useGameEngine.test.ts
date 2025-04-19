import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  reducer, 
  initialState, 
  NODE_COST, 
  GameState, 
  Node,
  VIEW
} from './useGameEngine';

// Helper for creating a determinstic node position
const createTestNode = (id: number, x: number, y: number, alive = true): Node => ({
  id,
  x,
  y,
  alive
});

describe('Game Engine Reducer', () => {
  let state: GameState;

  beforeEach(() => {
    // Create a fresh state before each test with deterministic node positions
    state = {
      ...initialState,
      nodes: [
        createTestNode(0, 100, 100),
        createTestNode(1, 200, 200),
        createTestNode(2, 300, 300),
        createTestNode(3, 400, 400),
      ]
    };
  });

  describe('Game Initialization', () => {
    it('should start the game on START action', () => {
      const action = { t: 'START' as const };
      const newState = reducer(state, action);
      
      expect(newState.run).toBe(true);
      expect(newState.overlay).toBe(null);
      expect(newState.phase).toBe('main');
    });
  });

  describe('Game Resource Management', () => {
    it('should earn satoshis on each TICK action when game is running', () => {
      // First start the game
      state = reducer(state, { t: 'START' });
      expect(state.run).toBe(true);
      
      // Then simulate a tick
      const newState = reducer(state, { t: 'TICK' });
      
      expect(newState.sats).toBe(state.sats + 1);
      expect(newState.sec).toBe(state.sec + 1);
    });

    it('should not earn satoshis on TICK action when game is not running', () => {
      // Ensure game is not running
      expect(state.run).toBe(false);
      
      // Simulate a tick
      const newState = reducer(state, { t: 'TICK' });
      
      // State should remain unchanged
      expect(newState).toEqual(state);
    });

    it('should buy a node when enough satoshis are available', () => {
      // Start the game
      state = reducer(state, { t: 'START' });
      
      // Give player enough satoshis
      state = { ...state, sats: NODE_COST };
      
      // Try to buy a node
      const newNode = { x: 500, y: 500 };
      const newState = reducer(state, { t: 'BUY', ...newNode });
      
      // Check that node was added and satoshis were deducted
      expect(newState.nodes.length).toBe(state.nodes.length + 1);
      expect(newState.nodes[newState.nodes.length - 1].x).toBe(newNode.x);
      expect(newState.nodes[newState.nodes.length - 1].y).toBe(newNode.y);
      expect(newState.sats).toBe(state.sats - NODE_COST);
    });

    it('should not buy a node when not enough satoshis', () => {
      // Start the game
      state = reducer(state, { t: 'START' });
      
      // Give player less than required satoshis
      state = { ...state, sats: NODE_COST - 1 };
      
      // Try to buy a node
      const newState = reducer(state, { t: 'BUY', x: 500, y: 500 });
      
      // Check that state remains unchanged
      expect(newState.nodes.length).toBe(state.nodes.length);
      expect(newState.sats).toBe(NODE_COST - 1);
    });
  });

  describe('Disaster Management', () => {
    it('should kill nodes within disaster radius', () => {
      // Start the game
      state = reducer(state, { t: 'START' });
      
      // Create a disaster at position that should affect the first node
      const disaster = { 
        t: 'DIS' as const, 
        sp: { cx: 120, cy: 120, r: 50, t: Date.now() }, 
        txt: 'Test Disaster', 
        col: '#ff0000' 
      };
      
      const newState = reducer(state, disaster);
      
      // Check that first node is dead, but others are alive
      expect(newState.nodes[0].alive).toBe(false);
      expect(newState.nodes[1].alive).toBe(true);
      expect(newState.nodes[2].alive).toBe(true);
      expect(newState.nodes[3].alive).toBe(true);
      
      // Check that disaster details were recorded
      expect(newState.spl).toEqual(disaster.sp);
      expect(newState.tick).toBe(disaster.txt);
      expect(newState.tcol).toBe(disaster.col);
      
      // Check that player earned the disaster bonus
      expect(newState.sats).toBe(state.sats + 2);
    });

    it('should not affect nodes outside disaster radius', () => {
      // Start the game
      state = reducer(state, { t: 'START' });
      
      // Create a disaster at position that shouldn't affect any nodes
      const disaster = { 
        t: 'DIS' as const, 
        sp: { cx: 50, cy: 50, r: 10, t: Date.now() }, 
        txt: 'Test Disaster', 
        col: '#ff0000' 
      };
      
      const newState = reducer(state, disaster);
      
      // Check all nodes are still alive
      expect(newState.nodes.every(n => n.alive)).toBe(true);
    });

    it('should not process disasters when not in main phase', () => {
      // Change the game phase
      state = { ...state, phase: 'confirm' };
      
      // Create a disaster
      const disaster = { 
        t: 'DIS' as const, 
        sp: { cx: 120, cy: 120, r: 50, t: Date.now() }, 
        txt: 'Test Disaster', 
        col: '#ff0000' 
      };
      
      const newState = reducer(state, disaster);
      
      // State should remain unchanged
      expect(newState).toEqual(state);
    });
  });

  describe('Upgrade Challenge Management', () => {
    it('should start the upgrade confirmation process', () => {
      // Start the game
      state = reducer(state, { t: 'START' });
      
      // Trigger upgrade
      const newState = reducer(state, { t: 'UPGRADE_POP' });
      
      expect(newState.phase).toBe('confirm');
      expect(newState.run).toBe(false);
      expect(newState.overlay).toBe('Approve upgrade?');
      expect(newState.confirmStart).toBeDefined();
    });

    it('should begin a challenge when user approves', () => {
      // Set up confirmation state
      state = {
        ...state,
        phase: 'confirm',
        run: false,
        overlay: 'Approve upgrade?',
        confirmStart: Date.now()
      };
      
      // Begin challenge
      const newState = reducer(state, { t: 'BEGIN_CHAL' });
      
      expect(newState.phase).toBe('challenge');
      expect(newState.overlay).toBe(null);
      expect(newState.clicked.size).toBe(0); // No nodes clicked yet
    });

    it('should register node clicks during a challenge', () => {
      // Set up challenge state
      state = {
        ...state,
        phase: 'challenge',
        overlay: null,
        clicked: new Set()
      };
      
      // Click the first node
      let newState = reducer(state, { t: 'CLICK', id: 0 });
      expect(newState.clicked.size).toBe(1);
      expect(newState.clicked.has(0)).toBe(true);
      
      // Click the second node
      newState = reducer(newState, { t: 'CLICK', id: 1 });
      expect(newState.clicked.size).toBe(2);
      expect(newState.clicked.has(1)).toBe(true);
    });

    it('should not register clicks outside of challenge phase', () => {
      // Set up state not in challenge phase
      state = {
        ...state,
        phase: 'main',
        clicked: new Set()
      };
      
      // Try to click
      const newState = reducer(state, { t: 'CLICK', id: 0 });
      
      // State should remain unchanged
      expect(newState).toEqual(state);
    });

    it('should end challenge with success when enough nodes clicked', () => {
      // Set up challenge state with enough clicks for success
      // Need to click 2/3 of the alive nodes (ceil(4 * 0.66) = 3)
      state = {
        ...state,
        phase: 'challenge',
        clicked: new Set([0, 1, 2])
      };
      
      // End the challenge
      const newState = reducer(state, { t: 'END_CHAL' });
      
      // Should be successful
      expect(newState.phase).toBe('result');
      expect(newState.overlay).toBe('Upgrade success +50 sats');
      expect(newState.sats).toBe(state.sats + 50); // Received satoshis reward
      expect(newState.tick).toBe('Upgrade success');
      expect(newState.tcol).toBe('#10b981'); // Success color
    });

    it('should end challenge with failure when not enough nodes clicked', () => {
      // Set up challenge state with not enough clicks for success
      state = {
        ...state,
        phase: 'challenge',
        clicked: new Set([0]) // Only clicked 1 out of 4 nodes
      };
      
      // End the challenge
      const newState = reducer(state, { t: 'END_CHAL' });
      
      // Should be failure
      expect(newState.phase).toBe('result');
      expect(newState.overlay).toBe('Upgrade failed -33% nodes');
      expect(newState.sats).toBe(state.sats); // No reward
      expect(newState.tick).toBe('Upgrade failed');
      expect(newState.tcol).toBe('#ef4444'); // Failure color
      
      // Should have lost some nodes (33% of alive nodes)
      const deadNodesCount = newState.nodes.filter(n => !n.alive).length;
      expect(deadNodesCount).toBe(1); // Should lose 1 node (floor(4 * 0.33) = 1)
    });

    it('should reject challenge and return to main game', () => {
      // Set up confirmation state
      state = {
        ...state,
        phase: 'confirm',
        run: false,
        overlay: 'Approve upgrade?'
      };
      
      // Reject the challenge
      const newState = reducer(state, { t: 'REJECT' });
      
      expect(newState.phase).toBe('main');
      expect(newState.run).toBe(true);
      expect(newState.overlay).toBe(null);
    });

    it('should resume normal gameplay after a result', () => {
      // Set up result state
      state = {
        ...state,
        phase: 'result',
        run: false,
        overlay: 'Upgrade success +50 sats'
      };
      
      // Resume the game
      const newState = reducer(state, { t: 'RESUME' });
      
      expect(newState.phase).toBe('main');
      expect(newState.run).toBe(true);
      expect(newState.overlay).toBe(null);
    });
  });

  describe('Node Manipulation', () => {
    it('should update node position when dragged', () => {
      // Set up initial state
      const nodeId = 0;
      const newX = 150;
      const newY = 160;
      
      // Drag the node
      const newState = reducer(state, { t: 'DRAG', id: nodeId, x: newX, y: newY });
      
      // Check position was updated
      expect(newState.nodes[nodeId].x).toBe(newX);
      expect(newState.nodes[nodeId].y).toBe(newY);
      
      // Other nodes should remain unchanged
      expect(newState.nodes[1]).toEqual(state.nodes[1]);
      expect(newState.nodes[2]).toEqual(state.nodes[2]);
      expect(newState.nodes[3]).toEqual(state.nodes[3]);
    });
  });
}); 
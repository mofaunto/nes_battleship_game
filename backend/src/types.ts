export interface Player {
  socketId: string;
  displayName: string;
}

export interface Ship {
  name: string;
  size: number;
}

export const SHIPS: Ship[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

export type CellState = 'empty' | 'ship' | 'hit' | 'miss';

export interface Game {
  id: string;
  players: Player[];
  status: 'waiting' | 'placing' | 'playing' | 'finished';
  gridSize: number;
  placements: Map<string, CellState[][]>;
  ready: Set<string>;
  deadline?: NodeJS.Timeout;
  currentTurn?: string;
  shipPositions?: Map<string, Map<string, [number, number][]>>;
}
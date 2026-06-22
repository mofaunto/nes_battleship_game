export interface Player {
  socketId: string;
  displayName: string;
}

export interface Game {
  id: string;
  players: Player[];
  status: 'waiting' | 'placing' | 'playing' | 'finished';
  gridSize: number;
}
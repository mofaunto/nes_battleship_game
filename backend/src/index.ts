import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { Player, Game, SHIPS, CellState } from './types';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const nameCounters = new Map<string, number>();
const normalize = (str: string) => str.trim().toLowerCase();

const players = new Map<string, Player>();
const games = new Map<string, Game>();

function isValidPlacement( board: CellState[][],gridSize: number ): { valid: boolean; reason?: string } {
  if (!Array.isArray(board) || board.length !== gridSize) {
    return { valid: false, reason: 'not valid board dimensions' };
  }

  for (const row of board) {
    if (!Array.isArray(row) || row.length !== gridSize) {
      return { valid: false, reason: 'wrong board row dimensions' };
    }
  }

  const visited = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const foundShips: number[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c] === 'ship' && !visited[r][c]) {
        let size = 1;
        let c2 = c + 1;
        while (c2 < gridSize && board[r][c2] === 'ship' && !visited[r][c2]) {
          size++;
          c2++;
        }
        if (size > 1) {
          // horizontal ship
          for (let i = 0; i < size; i++) {
            visited[r][c + i] = true;
          }
          foundShips.push(size);
          continue;
        }
        // check vertical
        let r2 = r + 1;
        size = 1;
        while (r2 < gridSize && board[r2][c] === 'ship' && !visited[r2][c]) {
          size++;
          r2++;
        }
        for (let i = 0; i < size; i++) {
          visited[r + i][c] = true;
        }
        foundShips.push(size);
      }
    }
  }

  const required = SHIPS.map(s => s.size).sort((a, b) => a - b);
  const foundSorted = foundShips.sort((a, b) => a - b);
  if (foundSorted.length !== required.length || !foundSorted.every((val, idx) => val === required[idx])) {
    return { valid: false, reason: 'Incorrect ship configuration' };
  }

  return { valid: true };
}

app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.includes(' ')) {
        return res.status(400).json({ error: 'Name must be a single word, no spaces' });
    }

    const base = normalize(name);
    const counter = nameCounters.get(base) || 0;
    const newCounter = counter + 1;
    nameCounters.set(base, newCounter);
    const displayName = counter === 0 ? base : `${base} ${newCounter}`;

    res.json({ displayName })
})


io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  function emitGamesList() {
    const openGames = Array.from(games.values()).filter(g => g.status === 'waiting').map(({ id, players }) => ({ id, host: players[0]?.displayName }));
    io.emit('games-list', openGames);
  }

  socket.on('register', (displayName: string) => {
    if (!displayName || typeof displayName !== 'string') return;

    if (players.has(socket.id)) {
      players.delete(socket.id);
    }

    const player: Player = { socketId: socket.id, displayName };
    players.set(socket.id, player);
    socket.emit('registered', player);
  });

  socket.on('get-games', () => {
    const openGames = Array.from(games.values())
      .filter(g => g.status === 'waiting')
      .map(({ id, players }) => ({ id, host: players[0]?.displayName }));
    socket.emit('games-list', openGames);
  });

  socket.on('create-game', (options: { gridSize?: number } = {}) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', 'You must register first'); // not truly registration per se, but they need to set their names first
      return;
    }
    const gridSize = options.gridSize && options.gridSize >= 5 && options.gridSize <= 15 ? options.gridSize : 10;
    const gameId = uuidv4();

    const game: Game = {
      id: gameId,
      players: [player],
      status: 'waiting',
      gridSize,
      placements: new Map(),
      ready: new Set(),
    };

    games.set(gameId, game);
    socket.join(gameId);
    socket.emit('game-created', { gameId, gridSize });
    emitGamesList();
  });

  socket.on('join-game', (gameId: string) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', 'You must register first');
      return;
    }
    const game = games.get(gameId);
    if (!game || game.status !== 'waiting' || game.players.length >= 2) {
      socket.emit('error', 'Game not available');
      return;
    }

    if (game.players.some(p => p.socketId === socket.id)) {
      socket.emit('error', 'You cannot join your own game');
      return;
    }
    game.players.push(player);
    socket.join(gameId);

    game.status = 'placing';
    const deadline = Date.now() + 6000000;
    game.deadline = setTimeout(() => {
      io.to(gameId).emit('placement-timeout');
      games.delete(gameId);
      emitGamesList();
    }, 6000000);

    io.to(gameId).emit('game-start', {
      gameId,
      phase: 'placing',
      players: game.players.map(p => p.displayName),
      gridSize: game.gridSize,
      deadline,
    });

     emitGamesList();
  });

  socket.on('ships-placed', (data: { gameId: string; board: CellState[][] }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const game = games.get(data.gameId);
    if (!game || game.status !== 'placing') return;
    if (game.ready.has(socket.id)) {
      socket.emit('error', 'You already submitted');
      return;
    }

    const validation = isValidPlacement(data.board, game.gridSize);
    if (!validation.valid) {
      socket.emit('placement-error', validation.reason || 'Invalid placement');
      return;
    }

    game.placements.set(socket.id, data.board);
    game.ready.add(socket.id);
    socket.emit('placement-accepted');

    // if both ready, start game
    if (game.ready.size === 2) {
      if (game.deadline) clearTimeout(game.deadline);
      game.status = 'playing';
      const firstTurnIndex = Math.random() < 0.5 ? 0 : 1;
      game.currentTurn = game.players[firstTurnIndex].socketId;

      io.to(game.id).emit('game-phase', {
        phase: 'playing',
        currentTurn: game.currentTurn,
        players: game.players.map(p => p.displayName),
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const player = players.get(socket.id);

    if (player) {
      players.delete(socket.id);
      for (const [gameId, game] of games.entries()) {
        if (game.players.some(p => p.socketId === socket.id)) {
          if (game.status !== 'finished') {
            io.to(gameId).emit('opponent-disconnected');
            games.delete(gameId);
            if (game.deadline) clearTimeout(game.deadline);
          }
          break;
        }
      }
      emitGamesList();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
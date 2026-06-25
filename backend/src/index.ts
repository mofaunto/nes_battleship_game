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

function isValidPlacement(board: CellState[][], gridSize: number): { valid: boolean; reason?: string } {
  if (!Array.isArray(board) || board.length !== gridSize) {
    return { valid: false, reason: 'Invalid board dimensions' };
  }
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== gridSize) {
      return { valid: false, reason: 'Invalid board row dimensions' };
    }
  }

  const shipMap = getShipCells(board, gridSize);

  for (const name of shipMap.keys()) {
    if (name.startsWith('Ship_')) {
      return { valid: false, reason: 'Ships must not touch each other' };
    }
  }

  const foundSizes = Array.from(shipMap.values()).map(c => c.length).sort((a, b) => a - b);
  const required = SHIPS.map(s => s.size).sort((a, b) => a - b);
  if (foundSizes.length !== required.length || !foundSizes.every((v, i) => v === required[i])) {
    return { valid: false, reason: 'Incorrect ship configuration' };
  }

  return { valid: true };
}

function getShipCells(board: CellState[][], gridSize: number): Map<string, [number, number][]> {
  const shipMap = new Map<string, [number, number][]>();
  const visited = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const foundShips: { size: number; cells: [number, number][] }[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c] !== 'ship' || visited[r][c]) continue;

      const horizontal = c + 1 < gridSize && board[r][c + 1] === 'ship';
      const vertical = r + 1 < gridSize && board[r + 1][c] === 'ship';

      if (!horizontal && !vertical) {
        foundShips.push({ size: 1, cells: [[r, c]] });
        visited[r][c] = true;
        continue;
      }

      const cells: [number, number][] = [];
      if (horizontal) {
        let c2 = c;
        while (c2 < gridSize && board[r][c2] === 'ship') {
          cells.push([r, c2]);
          visited[r][c2] = true;
          c2++;
        }
      } else {
        let r2 = r;
        while (r2 < gridSize && board[r2][c] === 'ship') {
          cells.push([r2, c]);
          visited[r2][c] = true;
          r2++;
        }
      }
      foundShips.push({ size: cells.length, cells });
    }
  }

  const remaining = SHIPS.map(s => ({ ...s }));
  for (const found of foundShips.sort((a, b) => b.size - a.size)) {
    const idx = remaining.findIndex(s => s.size === found.size);
    if (idx !== -1) {
      shipMap.set(remaining[idx].name, found.cells);
      remaining.splice(idx, 1);
    } else {
      shipMap.set(`Ship_${found.size}`, found.cells);
    }
  }
  return shipMap;
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
    const deadline = Date.now() + 300000;
    game.deadline = setTimeout(() => {
      io.to(gameId).emit('placement-timeout');
      games.delete(gameId);
      emitGamesList();
    }, 300000);

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

    const shipCells = getShipCells(data.board, game.gridSize);
    if (!game.shipPositions) {
      game.shipPositions = new Map();
    }
    game.shipPositions.set(socket.id, shipCells);

    game.placements.set(socket.id, data.board);
    game.ready.add(socket.id);
    socket.emit('placement-accepted');

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

  socket.on('make-shot', (data: { gameId: string; row: number; col: number }) => {
      const player = players.get(socket.id);
      if (!player) return;
      const game = games.get(data.gameId);
      if (!game || game.status !== 'playing') return;
      if (game.currentTurn !== socket.id) {
        socket.emit('error', 'Not your turn');
        return;
      }
      const { row, col } = data;
      if (row < 0 || row >= game.gridSize || col < 0 || col >= game.gridSize) {
        socket.emit('error', 'Invalid coordinates');
        return;
      }

      const opponentId = game.players.find(p => p.socketId !== socket.id)!.socketId;
      const opponentBoard = game.placements.get(opponentId)!;
      const currentCell = opponentBoard[row][col];
      if (currentCell === 'hit' || currentCell === 'miss') {
        socket.emit('error', 'Already shot there');
        return;
      }

      const isHit = currentCell === 'ship';
      opponentBoard[row][col] = isHit ? 'hit' : 'miss';
      let hitShip: string | undefined;
      
      let sunkShip: string | undefined;
      if (isHit) {
        const ships = game.shipPositions?.get(opponentId);
        if (ships) {
          for (const [shipName, cells] of ships) {
            if (cells.some(([r, c]) => r === row && c === col)) {
              hitShip = shipName;
              const allHit = cells.every(([r, c]) => opponentBoard[r][c] === 'hit');
              if (allHit) sunkShip = shipName;
              break;
            }
          }
        }
      }

      io.to(game.id).emit('shot-result', {
        shooter: socket.id,
        row,
        col,
        result: isHit ? 'hit' : 'miss',
        sunkShip: sunkShip || null,
        hitShip: hitShip || null,
      });

      const opponentShips = game.shipPositions?.get(opponentId);
      if (opponentShips) {
        const allSunk = Array.from(opponentShips.values()).every(cells =>
          cells.every(([r, c]) => opponentBoard[r][c] === 'hit')
        );
        if (allSunk) {
          game.status = 'finished';
          io.to(game.id).emit('game-over', { winner: socket.id, winnerName: player.displayName });
          if (game.deadline) clearTimeout(game.deadline);
          return;
        }
      }

      if (!isHit) {
        game.currentTurn = opponentId;
        io.to(game.id).emit('turn-change', { currentTurn: opponentId });
      }
  });

  socket.on('request-game-data', (gameId: string) => {
    const player = players.get(socket.id);
    if (!player) return;
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;
    if (!game.players.some(p => p.socketId === socket.id)) return;

    const ownBoard = game.placements.get(socket.id)!;
    const ownShips = game.shipPositions?.get(socket.id) || new Map();
    const enemyId = game.players.find(p => p.socketId !== socket.id)!.socketId;
    const enemyShipsRaw = game.shipPositions?.get(enemyId);
    const enemyShips: Record<string, number> = {};
    if (enemyShipsRaw) {
      for (const [name, cells] of enemyShipsRaw) {
        enemyShips[name] = cells.length;
      }
    }

    const enemyBoard = Array.from({ length: game.gridSize }, () =>
      Array(game.gridSize).fill('empty' as CellState)
    );

    socket.emit('game-init', {
      ownBoard,
      enemyBoard,
      ownShips: Object.fromEntries(ownShips),
      enemyShips,
      gridSize: game.gridSize,
    });
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
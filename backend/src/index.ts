import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { Player, Game } from './types';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const nameCounters = new Map<string, number>();
const normalize = (str: string) => str.trim().toLowerCase();

const players = new Map<string, Player>();
const games = new Map<string, Game>();

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
    const gridSize = options.gridSize && options.gridSize >= 5 && options.gridSize <= 15
      ? options.gridSize
      : 10;
    const gameId = uuidv4();
    const game: Game = {
      id: gameId,
      players: [player],
      status: 'waiting',
      gridSize,
    };
    games.set(gameId, game);
    socket.join(gameId);

    socket.emit('game-created', { gameId, gridSize });
    io.emit('games-list', Array.from(games.values())
      .filter(g => g.status === 'waiting')
      .map(({ id, players }) => ({ id, host: players[0]?.displayName })));
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
    game.status = 'playing';
    game.status = 'placing';
    socket.join(gameId);

    io.to(gameId).emit('game-start', { gameId, players: game.players.map(p => p.displayName), gridSize: game.gridSize });
    io.emit('games-list', Array.from(games.values())
      .filter(g => g.status === 'waiting')
      .map(({ id, players }) => ({ id, host: players[0]?.displayName })));
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      for (const [gameId, game] of games.entries()) {
        if (game.players.some(p => p.socketId === socket.id)) {
          if (game.status !== 'finished') {
            socket.to(gameId).emit('opponent-disconnected');
            games.delete(gameId);
          }
          break;
        }
      }
      io.emit('games-list', Array.from(games.values())
        .filter(g => g.status === 'waiting')
        .map(({ id, players }) => ({ id, host: players[0]?.displayName })));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
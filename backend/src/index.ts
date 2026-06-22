import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const nameCounters = new Map<string, number>();
const normalize = (str: string) => str.trim().toLowerCase();

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
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
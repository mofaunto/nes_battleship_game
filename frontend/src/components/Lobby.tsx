import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';

interface GameItem {
  id: string;
  host: string;
}

export default function Lobby() {
  const { player, socket, setPlayer } = useGame();
  const [games, setGames] = useState<GameItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.emit('register', player?.displayName);
    socket.emit('get-games');


    const handleGamesList = (list: GameItem[]) => setGames(list);
    const handleError = (msg: string) => setError(msg);

    socket.on('games-list', handleGamesList);
    socket.on('error', handleError);

    return () => {
      socket.off('games-list', handleGamesList);
      socket.off('error', handleError);
    };
  }, [socket, player]);

  const createGame = () => {
    socket?.emit('create-game', { gridSize: 10 });
  };

  const joinGame = (gameId: string) => {
    socket?.emit('join-game', gameId);
  };

  const leaveGame = () => {
    setPlayer(null);
  };

  return (
    <div className="nes-container is-dark with-title" style={{ margin: '2rem auto', width: '80%', height: '60vh'  }}>
      <p className="title">LOBBY</p>
      <div style={{marginTop: "2rem"}}>
        <p>Welcome, <strong>{player?.displayName}</strong></p>
        <button className="nes-btn is-error" onClick={leaveGame}>Leave</button>
        <button className="nes-btn is-primary" onClick={createGame}>Create Game</button>
      </div>

      {error && <p style={{ color: '#e76e55', marginTop: "1rem" }}>{error}</p>}

      <div style={{marginTop: "2rem"}}>
        <h3>Open Games</h3>
        {games.length === 0 && <p>No games available. Create one!</p>}
        <ul style={{ listStyle: 'none', padding: 0, width: "100%" }}>
          {games.map((game) => (
            <li key={game.id} style={{ marginBottom: '0.5rem', display: "flex", alignItems: "center", justifyContent: 'space-between' }}>
              <span>{game.host}'s game</span>
              <button
                className="nes-btn is-success"
                onClick={() => joinGame(game.id)}
              >
                Join
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
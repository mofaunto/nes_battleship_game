import { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen';
import Lobby from './components/Lobby';
import PlacementScreen from './components/PlacementScreen';
import { useGame } from './context/GameContext';
import Battle from './components/Battle';

interface GameStartData {
  gameId: string;
  phase: string;
  players: string[];
  gridSize: number;
  deadline: number;
  currentTurn?: string;
}

function App() {
  const { player, socket, connectSocket } = useGame();
  const [game, setGame] = useState<GameStartData | null>(null);

  useEffect(() => {
    if (player) {
      connectSocket();
    }
  }, [player, connectSocket]);

  useEffect(() => {
    if (!socket) return;

    const handleGameStart = (data: GameStartData) => {
      setGame(data);
    };

    const handlePlacementTimeout = () => {
      setGame(null);
      alert('Placement time expired.');
    };
    
    const handleOpponentDisconnected = () => {
      setGame(null);
      alert('Opponent disconnected.');
    };

    const handleGamePhase = (data: { phase: string; currentTurn: string; players: string[] }) => {
      if (data.phase === 'playing') {
        setGame(prev => prev ? {
          ...prev,
          phase: 'playing',
          currentTurn: data.currentTurn,
        } : null);
      }
    };

    socket.on('game-start', handleGameStart);
    socket.on('placement-timeout', handlePlacementTimeout);
    socket.on('opponent-disconnected', handleOpponentDisconnected);
    socket.on('game-phase', handleGamePhase);
    return () => {
      socket.off('game-start', handleGameStart);
      socket.off('placement-timeout', handlePlacementTimeout);
      socket.off('opponent-disconnected', handleOpponentDisconnected);
      socket.off('game-phase', handleGamePhase);
    };
  }, [socket, game]);

  const handleLeaveGame = () => {
    setGame(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100svh',
        width: '100%',
        backgroundColor: '#0078F8',
      }}
    >
      {game ? (
        game.phase === 'placing' ? (
          <PlacementScreen
            gameId={game.gameId}
            players={game.players}
            gridSize={game.gridSize}
            deadline={game.deadline}
            onTimeout={handleLeaveGame}
          />
        ) : (
          <Battle
            gameId={game.gameId}
            players={game.players}
            gridSize={game.gridSize}
            currentTurn={game.currentTurn!}
            onLeave={handleLeaveGame}
          />
        )
      ) : player ? (
        <Lobby />
      ) : (
        <StartScreen />
      )}
    </div>
  );
}

export default App;
import { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen';
import Lobby from './components/Lobby';
import PlacementScreen from './components/PlacementScreen';
import { useGame } from './context/GameContext';

interface GameStartData {
  gameId: string;
  phase: string; // 'placing' initially
  players: string[];
  gridSize: number;
  deadline: number;
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
    // Also listen for game-phase transition (to playing) for future use
    const handleGamePhase = (data: { phase: string }) => {
      if (data.phase === 'playing' && game) {
        // We'll transition to battle screen (yet to be built)
        // For now just log
        console.log('Game phase changed to playing');
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
    // TODO: emit 'leave-game' to server if needed
    setGame(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
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
          // placeholder for battle screen
          <div>Battle</div>
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
import StartScreen from './components/StartScreen';
import Lobby from './components/Lobby';
import { useGame } from './context/GameContext';
import { useEffect } from 'react';

function App() {
  const { player, connectSocket } = useGame();

  useEffect(() => {
    if (player) {
      connectSocket();
    }
  }, [player, connectSocket]);

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
      {player ? <Lobby /> : <StartScreen />}
    </div>
  );
}

export default App;
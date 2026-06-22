import StartScreen from './components/StartScreen';

function App() {
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
      <StartScreen />
    </div>
  );
}

export default App;
import { useState } from 'react';

export default function StartScreen() {
  const [name, setName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);

  const handleSetName = () => {
    const trimmed = name.trim();
    if (trimmed && !trimmed.includes(' ')) {
      setIsNameSet(true);
      console.log('Name set:', trimmed);
    }
  };

  return (
    <div className="nes-container is-dark with-title is-centered">
      <p className="title">BATTLESHIP</p>

      {!isNameSet ? (
        <div>
          <p>Enter your name, Captain!</p>
          <div className="nes-field" style={{ maxWidth: '400px', margin: '0 auto' }}>
            <input
              type="text"
              className="nes-input"
              placeholder="One word, no spaces"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
            />
          </div>
          <button
            className="nes-btn is-primary"
            style={{ marginTop: '1rem' }}
            onClick={handleSetName}
            disabled={!name.trim() || name.includes(' ')}
          >
            Set Name
          </button>
        </div>
      ) : (
        <div>
          <p>Welcome, <strong>{name}</strong>!</p>
          <button className="nes-btn is-success" style={{ marginTop: '1rem' }} disabled>
            YOU LOSE!
          </button>
        </div>
      )}
    </div>
  );
}
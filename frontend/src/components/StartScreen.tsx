import { useMemo, useState } from 'react';


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function StartScreen() {
  const [name, setName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validationMessage = useMemo(() => {
    if (name.length > 0 && name.includes(' ')) {
      return 'Name must be a single word (no spaces).';
    }
    return '';
  }, [name]);

  const isValid = name.trim().length > 0 && !name.includes(' ');

  const handleSetName = async () => {
    if (!isValid) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }

      const data = await res.json();
      setDisplayName(data.displayName);
      setIsNameSet(true);
    } catch (err) {
      // Properly type the error without using `any`
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setLoading(false);
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
              className={`nes-input ${validationMessage ? 'is-error' : ''}`}
              placeholder="One word, no spaces"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
            />
          </div>
          {validationMessage && (
            <p style={{ color: '#e76e55', marginTop: '0.5rem' }}>
              {validationMessage}
            </p>
          )}
          {error && (
            <p style={{ color: '#e76e55', marginTop: '0.5rem' }}>
              {error}
            </p>
          )}
          <button
            className={`nes-btn ${!isValid ? 'is-disabled' : 'is-primary'}`}
            style={{ marginTop: '1rem' }}
            onClick={handleSetName}
            disabled={loading || !isValid}
          >
            {loading ? 'Registering...' : 'Set Name'}
          </button>
        </div>
      ) : (
        <div>
          <p>Welcome, <strong>{displayName}</strong>!</p>
          <button className="nes-btn is-success" style={{ marginTop: '1rem' }} disabled>
            YOU LOSE!
          </button>
        </div>
      )}
    </div>
  );
}
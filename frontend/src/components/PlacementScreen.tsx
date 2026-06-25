import { useState, useEffect, useCallback, useRef } from 'react';
import Board, { type CellState } from './Board';
import { useGame } from '../context/GameContext';

const SHIPS = [
  { id: 1, name: 'Carrier', size: 5 },
  { id: 2, name: 'Battleship', size: 4 },
  { id: 3, name: 'Cruiser', size: 3 },
  { id: 4, name: 'Submarine', size: 3 },
  { id: 5, name: 'Destroyer', size: 2 },
];

interface PlacementScreenProps {
  gameId: string;
  players: string[];
  gridSize: number;
  deadline: number;
  onTimeout: () => void;
}

export default function PlacementScreen({
  gameId,
  gridSize,
  deadline,
  onTimeout,
}: PlacementScreenProps) {
  const { socket } = useGame();
  const [board, setBoard] = useState<CellState[][]>(() => Array.from({ length: gridSize }, () => Array(gridSize).fill('empty')));
  const [placedShips, setPlacedShips] = useState<Map<string, number[][]>>(new Map());
  const [selectedShipType, setSelectedShipType] = useState<string | null>(null);
  const [shipId, setShipId] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');

  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        onTimeout();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
    timerRef.current = window.setInterval(update, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [deadline, onTimeout]);

  const [previewCells, setPreviewCells] = useState<[number, number][]>([]);

  const hasConflict = useCallback((r: number, c: number, boardSnapshot: CellState[][]) => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && boardSnapshot[nr][nc] === 'ship') {
            return true;
          }
        }
      }
      return false;
    },
    [gridSize]
  );

  const generatePreview = useCallback((row: number, col: number, type: string) => {
      const ship = SHIPS.find(s => s.name === type);
      if (!ship) return [];
      const cells: [number, number][] = [];
      
      for (let i = 0; i < ship.size; i++) {
        const r = orientation === 'vertical' ? row + i : row;
        const c = orientation === 'horizontal' ? col + i : col;
        if (r < gridSize && c < gridSize) {
          cells.push([r, c]);
        } else {
          return [];
        }
      }

      for (const [r, c] of cells) {
        if (board[r][c] === 'ship' || hasConflict(r, c, board)) {
          return [];
        }
      }
      return cells;
    },
    [orientation, board, gridSize, hasConflict]
  );

  const handleBoardClick = (row: number, col: number) => {
    if (ready || waiting) return;
    if (!selectedShipType) return;

    const preview = generatePreview(row, col, selectedShipType);
    if (preview.length === 0) {
      setError('Invalid placement (out of bounds, overlap, or too close to another ship)');
      return;
    }

    const newBoard = board.map((r) => [...r]);
    for (const [r, c] of preview) {
      newBoard[r][c] = 'ship';
    }
    setBoard(newBoard);

    const newPlaced = new Map(placedShips);
    newPlaced.set(selectedShipType, preview);
    setPlacedShips(newPlaced);

    setSelectedShipType(null);
    setShipId(null);
    setPreviewCells([]);
    setError('');
  };

  const handleCellHover = (row: number, col: number) => {
    if (!selectedShipType || ready || waiting) return;
    const preview = generatePreview(row, col, selectedShipType);
    setPreviewCells(preview);
  };

  const handleCellLeave = () => {
    setPreviewCells([]);
  };

  const handleRemoveShip = (shipName: string) => {
    const shipCells = placedShips.get(shipName);
    if (!shipCells) return;
    const newBoard = board.map((r) => [...r]);
    for (const [r, c] of shipCells) {
      newBoard[r][c] = 'empty';
    }
    setBoard(newBoard);
    const newPlaced = new Map(placedShips);
    newPlaced.delete(shipName);
    setPlacedShips(newPlaced);
  };

  const handleRandomPlace = () => {
  const newBoard = Array.from({ length: gridSize }, () => Array(gridSize).fill('empty') as CellState[]);
  const newPlaced = new Map<string, number[][]>();

  const placeShip = (ship: typeof SHIPS[0]) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const horiz = Math.random() < 0.5;
      const o = horiz ? 'horizontal' : 'vertical';
      const row = Math.floor(Math.random() * gridSize);
      const col = Math.floor(Math.random() * gridSize);
      const cells: [number, number][] = [];

      let valid = true;
      for (let i = 0; i < ship.size; i++) {
        const r = o === 'vertical' ? row + i : row;
        const c = o === 'horizontal' ? col + i : col;
        if (r >= gridSize || c >= gridSize || newBoard[r][c] !== 'empty' || hasConflict(r, c, newBoard)) {
          valid = false;
          break;
        }
        cells.push([r, c]);
      }

      if (valid) {
        for (const [r, c] of cells) {
          newBoard[r][c] = 'ship';
        }
        newPlaced.set(ship.name, cells);
        return true;
      }
    }
    return false;
  };

  for (const ship of SHIPS) {
    if (!placeShip(ship)) {
      setError('Random placement failed, try again or place manually.');
      return;
    }
  }

  setBoard(newBoard);
  setPlacedShips(newPlaced);
  setSelectedShipType(null);
  setShipId(null);
  setError('');
};

  const handleReady = () => {
    if (placedShips.size !== SHIPS.length) return;
    socket?.emit('ships-placed', { gameId, board });
    setWaiting(true);
  };

  useEffect(() => {
    if (!socket) return;

    const handlePlacementError = (msg: string) => {
      setError(msg);
      setWaiting(false);
    };

    const handlePlacementAccepted = () => {
      setReady(true);
      setWaiting(true);
    };

    const handleOpponentDisconnected = () => {
      setError('Opponent disconnected');
      setWaiting(false);
    };

    socket.on('placement-error', handlePlacementError);
    socket.on('placement-accepted', handlePlacementAccepted);
    socket.on('opponent-disconnected', handleOpponentDisconnected);

    return () => {
      socket.off('placement-error', handlePlacementError);
      socket.off('placement-accepted', handlePlacementAccepted);
      socket.off('opponent-disconnected', handleOpponentDisconnected);
    };
  }, [socket, gameId]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h3 className="nes-text is-primary" style={{marginBottom: "4rem"}}>Timer: {timeLeft}s</h3>
      <h3 className="nes-text is-warning" style={{marginBottom: "4rem"}}>PLACE YOUR FLEET!</h3>
      <div style={{ display: 'flex', alignContent: "start", justifyContent: 'center', gap: '3rem', flexWrap: 'wrap' }}>
        <div>
          <Board
            gridSize={gridSize}
            board={board}
            onCellClick={handleBoardClick}
            onCellHover={handleCellHover}
            onCellLeave={handleCellLeave}
            disabled={ready || waiting}
            showShips
            previewCells={previewCells}
          />
        </div>

        <div className="nes-container is-dark with-title" style={{ maxWidth: '400px' }}>
          <p className="title">Fleet</p>
          <div>
            {SHIPS.map(ship => {
              const placed = placedShips.has(ship.name);
              const selected = shipId === ship.id;
              return (
                <div key={ship.name} style={{ width: "100%", margin: '0.5rem 0', display: 'flex', justifyContent: 'space-between', alignContent: "center" }} onClick={() => setShipId(ship.id)}>
                  <span
                    style={{
                      cursor: placed ? 'default' : 'pointer',
                      opacity: placed ? 0.5 : 1,
                      color: placed ? '#6bbe6b' : '#fff',
                      textDecoration: selected ? 'underline' : 'none'
                    }}
                    onClick={() => !placed && setSelectedShipType(ship.name)}
                  >
                    {ship.name} ({ship.size})
                  </span>
                  {placed && (
                    <button
                      className="nes-btn is-error"
                      style={{ display: "flex", alignContent: "center", justifyContent: "center",  padding: '0 0.5rem', fontSize: '0.6rem' }}
                      onClick={() => handleRemoveShip(ship.name)}
                    >
                      X
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          
          <div style={{width: "100%", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "start", justifyContent: "center"}}>
            <button
              className="nes-btn"
              onClick={() => setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
              disabled={ready || waiting}
              style={{width: "100%", textAlign: "center"}}
            >
              {orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
            </button>
            <button
              className="nes-btn"
              onClick={handleRandomPlace}
              disabled={ready || waiting}
              style={{width: "100%", textAlign: "center"}}
            >
              Random
            </button>
            <button
              className="nes-btn is-success"
              disabled={placedShips.size !== SHIPS.length || ready || waiting}
              onClick={handleReady}
              style={{width: "100%", textAlign: "center"}}
            >
              {ready ? 'Ready!' : 'Ready'}
            </button>
          </div>

          {waiting && !ready && <p style={{ color: '#e76e55' }}>Waiting for opponent...</p>}
          {ready && <p style={{ color: '#6bbe6b' }}>Waiting for opponent to ready up...</p>}
          {error && <p style={{ color: '#e76e55' }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
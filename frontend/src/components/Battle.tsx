import { useState, useEffect, useCallback, useRef } from 'react';
import Board, { type CellState } from './Board';
import { useGame } from '../context/GameContext';
import hitSound from '../assets/ship_hit.mp3';

interface BattleProps {
  gameId: string;
  players: string[];
  gridSize: number;
  currentTurn: string;
  onLeave: () => void;
}

type ShipMap = Record<string, [number, number][]>;

export default function Battle({ gameId, players, gridSize, currentTurn: initialTurn, onLeave }: BattleProps) {
  const { player, socket } = useGame();
  const ownName = player?.displayName || '';
  const opponentName = players.find(p => p !== ownName) || 'Opponent';

  const [ownBoard, setOwnBoard] = useState<CellState[][]>(() => Array.from({ length: gridSize }, () => Array(gridSize).fill('empty')));
  const [enemyBoard, setEnemyBoard] = useState<CellState[][]>(() => Array.from({ length: gridSize }, () => Array(gridSize).fill('empty')));
  const [ownShips, setOwnShips] = useState<ShipMap>({});
  const [enemyShips, setEnemyShips] = useState<Record<string, number>>({});
  const [enemyHits, setEnemyHits] = useState<Record<string, number>>({});
  const [turn, setTurn] = useState(initialTurn);
  const [turnNumber, setTurnNumber] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const [countdown, setCountdown] = useState(3);
  const isMobile = window.innerWidth <= 768;
  const dialogRef = useRef<HTMLDialogElement>(null);

  const playHitSound = () => {
    try {
      const audio = new Audio(hitSound);
      audio.play();
    } catch (e) {
      console.error('no sound', e);
    }
  };

  useEffect(() => {
    if (gameOver && dialogRef.current) {
      dialogRef.current.showModal();
    }
  }, [gameOver]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('request-game-data', gameId);

    const handleGameInit = (data: {
      ownBoard: CellState[][];
      enemyBoard: CellState[][];
      ownShips: Record<string, [number, number][]>;
      enemyShips?: Record<string, number>;
    }) => {
      setOwnBoard(data.ownBoard);
      setEnemyBoard(data.enemyBoard);
      setOwnShips(data.ownShips);
      setEnemyShips(data.enemyShips || {});
      setEnemyHits(Object.fromEntries(Object.keys(data.enemyShips || {}).map(k => [k, 0])));
    };

    socket.on('game-init', handleGameInit);
    return () => { socket.off('game-init', handleGameInit); };
  }, [socket, gameId]);

  useEffect(() => {
    if (!socket) return;
    const handleShotResult = (data: {
      shooter: string;
      row: number;
      col: number;
      result: 'hit' | 'miss';
      sunkShip: string | null;
      hitShip?: string | null;
    }) => {
      const { shooter, row, col, result, hitShip } = data;
      if (shooter === socket.id) {
        setEnemyBoard(prev => {
          const newBoard = prev.map(r => [...r]);
          newBoard[row][col] = result === 'hit' ? 'hit' : 'miss';
          return newBoard;
        });
        if (hitShip) {
          playHitSound();
          setEnemyHits(prev => {
            const newHits = { ...prev, [hitShip]: (prev[hitShip] || 0) + 1 };
            return newHits;
          });
        }
      } else {
        setOwnBoard(prev => {
          const newBoard = prev.map(r => [...r]);
          newBoard[row][col] = result === 'hit' ? 'hit' : 'miss';
          return newBoard;
        });
      }
    };

    const handleTurnChange = (data: { currentTurn: string }) => {
      setTurn(data.currentTurn);
      setTurnNumber(prev => prev + 1);
    };

    const handleGameOver = (data: { winner: string; winnerName: string }) => {
      setGameOver(true);
      setWinnerName(data.winnerName);
    };

    const handleOpponentDisconnected = () => {
      alert('Opponent disconnected');
      onLeave();
    };

    socket.on('shot-result', handleShotResult);
    socket.on('turn-change', handleTurnChange);
    socket.on('game-over', handleGameOver);
    socket.on('opponent-disconnected', handleOpponentDisconnected);

    return () => {
      socket.off('shot-result', handleShotResult);
      socket.off('turn-change', handleTurnChange);
      socket.off('game-over', handleGameOver);
      socket.off('opponent-disconnected', handleOpponentDisconnected);
    };
  }, [socket, onLeave]);

  const handleEnemyCellClick = useCallback(
    (row: number, col: number) => {
      if (gameOver || turn !== socket?.id) return;
      if (enemyBoard[row][col] !== 'empty') return;
      socket?.emit('make-shot', { gameId, row, col });
    },
    [gameOver, turn, socket, gameId, enemyBoard]
  );

  const isMyTurn = turn === socket?.id;

  const ownFleet = Object.entries(ownShips).map(([name, cells]) => {
    const hits = cells.filter(([r, c]) => ownBoard[r][c] === 'hit').length;
    const sunk = hits === cells.length;
    return { name, size: cells.length, hits, sunk };
  });

  const enemyFleet = Object.entries(enemyShips).map(([name, size]) => {
    const hits = enemyHits[name] || 0;
    const sunk = hits === size;
    return { name, size, hits, sunk };
  });

  if (countdown > 0) {
    return (
      <div>
        <h2 className="nes-text is-primary" style={{color: "white"}}>Battle starts in</h2>
        <p style={{ fontSize: '4rem', color: "white" }}>{countdown}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: '2rem', textAlign: 'center' }}>
      <h2 className="nes-text" style={{color: "white"}}>
        {gameOver ? 'Game Over' : isMyTurn ? "Your Turn" : `${opponentName}'s Turn`}
      </h2>
      <p style={{color: "white"}}>Turn {turnNumber}</p>

      <div style={{ display: 'flex', flexDirection: `${isMobile ? "column" : "row"}`, alignContent: `${isMobile ? "end" : "flex-start"}}`, justifyContent: 'center', gap: '3rem' }}>
        <Board
          gridSize={gridSize}
          board={ownBoard}
          disabled
          label="Your Fleet"
          showShips
        />
        <Board
          gridSize={gridSize}
          board={enemyBoard}
          onCellClick={handleEnemyCellClick}
          disabled={!isMyTurn || gameOver}
          label="Enemy Waters"
          showShips={false}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: `${isMobile ? "column" : "row"}`, alignItems: 'center',  justifyContent: 'space-between', gap: '3rem', marginTop: '2rem' }}>
        <div className="nes-container is-dark with-title" style={{width: "100%"}}>
          <p className="title">Your Fleet</p>
          {ownFleet.map(ship => (
            <div key={ship.name} style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '3rem' }}>
              <span style={{ width: '100%', textAlign: 'left', color: ship.sunk ? '#e76e55' : '#fff' }}>
                {ship.name} {ship.sunk && '(SUNK)'}
              </span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {Array.from({ length: ship.size }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: i < ship.hits ? '#e76e55' : '#3a6ea5',
                      border: '1px solid #000',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="nes-container is-dark with-title" style={{width: "100%"}}>
          <p className="title">Enemy Fleet</p>
          {enemyFleet.map(ship => (
            <div key={ship.name} style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '3rem' }}>
              <span style={{ width: '100%', textAlign: 'left', color: ship.sunk ? '#e76e55' : '#fff' }}>
                {ship.name}{ship.sunk && '(SUNK)'}
              </span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {Array.from({ length: ship.size }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: i < ship.hits ? '#e76e55' : '#6bbe6b',
                      border: '1px solid #000',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <dialog ref={dialogRef} className="nes-dialog is-dark" id="game-over-dialog">
        <form method="dialog">
          <p className="title">Game Over</p>
          <p>{winnerName} wins!</p>
          <menu className="dialog-menu">
            <button className="nes-btn is-primary" onClick={onLeave}>
              Back to Lobby
            </button>
          </menu>
        </form>
      </dialog>
    </div>
  );
}
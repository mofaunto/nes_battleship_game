import React from 'react';
import './Board.css';
export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'preview';

interface BoardProps {
  gridSize: number;
  board: CellState[][];
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
  onCellLeave?: () => void;
  disabled?: boolean;
  label?: string;
  showShips?: boolean;
  previewCells?: [number, number][];
}

const ROW_LABELS = 'ABCDEFGHIJKLMNO'.split('');

export default function Board({
  gridSize,
  board,
  onCellClick,
  onCellHover,
  onCellLeave,
  disabled = false,
  label,
  showShips = true,
  previewCells = [],
}: BoardProps) {
  const isPreview = (row: number, col: number) =>
    previewCells.some(([r, c]) => r === row && c === col);

  return (
    <div className="board-wrapper">
      {label && <p className="board-label">{label}</p>}
      <div
        className="board-grid"
        style={{
          gridTemplateColumns: `auto repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `auto repeat(${gridSize}, 1fr)`,
        }}
      >
        <div className="cell header" />
        {Array.from({ length: gridSize }, (_, col) => (
          <div key={`col-${col}`} className="cell header">{col + 1}</div>
        ))}
        {board.map((rowCells, row) => (
          <React.Fragment key={`row-${row}`}>
            <div key={`row-${row}-label`} className="cell header">{ROW_LABELS[row]}</div>
            {rowCells.map((cell, col) => {
              let cellClass = 'cell';
              if (isPreview(row, col)) {
                cellClass += ' preview';
              } else if (!showShips && cell === 'ship') {
                cellClass += ' empty';
              } else {
                cellClass += ` ${cell}`;
              }
              return (
                <div
                  key={`${row}-${col}`}
                  className={cellClass}
                  onClick={() => !disabled && onCellClick?.(row, col)}
                  onMouseEnter={() => !disabled && onCellHover?.(row, col)}
                  onMouseLeave={() => !disabled && onCellLeave?.()}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
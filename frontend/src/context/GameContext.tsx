import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface PlayerInfo {
  displayName: string;
}

interface GameContextType {
  player: PlayerInfo | null;
  setPlayer: (player: PlayerInfo | null) => void;
  socket: Socket | null;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const isConnecting = useRef(false);
  const socketRef = useRef<Socket | null>(null);

  const connectSocket = () => {
    if (socketRef.current?.connected || isConnecting.current) return;

    isConnecting.current = true;
    const newSocket = io(API_URL);

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      isConnecting.current = false;
      setSocket(newSocket);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      isConnecting.current = false;
      newSocket.close();
    });

    socketRef.current = newSocket;
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      isConnecting.current = false;
    }
  };

  useEffect(() => {
    if (!player) {
      disconnectSocket();
    }
  }, [player]);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <GameContext.Provider value={{ player, setPlayer, socket, connectSocket, disconnectSocket }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
}
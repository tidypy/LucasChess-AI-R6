import React, { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

export function ResponsiveChessboard({ pgn }: { pgn?: string }) {
  const [game] = useState(new Chess());
  const [currentPosition, setCurrentPosition] = useState(game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (pgn) {
      try {
        game.loadPgn(pgn);
        const moves = game.history();
        setHistory(moves);
        setHistoryIndex(moves.length - 1);
        setCurrentPosition(game.fen());
      } catch (e) {
        console.error("Failed to load PGN", e);
      }
    }
  }, [pgn, game]);

  const updateToMove = (index: number) => {
    if (index < -1 || index >= history.length) return;
    
    const tempGame = new Chess();
    for (let i = 0; i <= index; i++) {
      tempGame.move(history[i]);
    }
    
    setCurrentPosition(tempGame.fen());
    setHistoryIndex(index);
  };

  const handlePrev = () => updateToMove(historyIndex - 1);
  const handleNext = () => updateToMove(historyIndex + 1);
  const handleReset = () => updateToMove(-1);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg shadow-xl overflow-hidden border border-slate-800">
      <div className="flex-grow p-4 flex items-center justify-center">
        <div className="w-full max-w-[600px] aspect-square shadow-2xl">
          <Chessboard 
            position={currentPosition} 
            boardOrientation="white"
            customDarkSquareStyle={{ backgroundColor: "#334155" }}
            customLightSquareStyle={{ backgroundColor: "#94a3b8" }}
            animationDuration={200}
          />
        </div>
      </div>
      
      <div className="h-16 bg-slate-950 border-t border-slate-800 flex items-center justify-center space-x-6">
        <button onClick={handleReset} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
          <RotateCcw className="w-5 h-5" />
        </button>
        <button onClick={handlePrev} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-slate-300 font-mono text-sm w-16 text-center">
          {historyIndex >= 0 ? Math.floor(historyIndex / 2) + 1 : 0}
        </span>
        <button onClick={handleNext} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

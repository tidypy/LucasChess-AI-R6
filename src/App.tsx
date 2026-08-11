import React, { useEffect, useState } from "react";
import { Wing } from "./components/layout/Wing";
import { DesktopMenu } from "./components/layout/DesktopMenu";
import { ResponsiveChessboard } from "./components/chessboard/ResponsiveChessboard";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "./lib/api";

function App() {
  const { data: gameData, isLoading, isError } = useQuery({ 
    queryKey: ["game", 42], 
    queryFn: () => fetchGame(42),
    retry: 1
  });

  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    // SSE EventSource connection
    const eventSource = new EventSource("http://127.0.0.1:8000/api/v1/events");
    
    eventSource.onmessage = (event) => {
      console.log("SSE Message:", event.data);
    };

    eventSource.addEventListener("connect", (e) => {
      setEvents(prev => [...prev, `[Connect] ${e.data}`]);
    });

    eventSource.addEventListener("ping", (e) => {
      setEvents(prev => [...prev.slice(-4), `[Ping] ${e.data}`]);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-hidden">
      <Wing />
      
      <div className="flex-grow flex flex-col min-w-0">
        <DesktopMenu />
        
        <div className="flex-grow p-6 flex space-x-6 overflow-hidden">
          {/* Main Board Area */}
          <div className="flex-grow max-w-4xl h-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500">Loading Database...</div>
            ) : isError ? (
              <div className="h-full flex items-center justify-center text-rose-500 bg-slate-900 rounded-lg">Backend Core Offline</div>
            ) : (
              <ResponsiveChessboard pgn={gameData?.pgn} />
            )}
          </div>

          {/* AI Dossier Placeholder */}
          <div className="w-80 flex-shrink-0 flex flex-col space-y-4">
            <div className="flex-grow bg-slate-900 rounded-lg border border-slate-800 p-4 shadow-lg overflow-y-auto">
              <h2 className="text-emerald-500 font-medium mb-4 flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                AI Dossier
              </h2>
              
              <div className="space-y-4">
                <div className="p-3 bg-slate-800/50 rounded text-sm text-slate-300">
                  Waiting for game progression...
                </div>
              </div>
            </div>

            {/* Telemetry Output */}
            <div className="h-48 bg-slate-900 rounded-lg border border-slate-800 p-4 shadow-lg overflow-y-auto">
              <h2 className="text-slate-400 font-medium mb-2 text-xs uppercase tracking-wider">SSE Telemetry</h2>
              <div className="font-mono text-xs text-slate-500 space-y-1">
                {events.length === 0 ? "Listening..." : events.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

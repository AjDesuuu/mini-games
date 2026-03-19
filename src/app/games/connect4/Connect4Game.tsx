"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  C4State,
  C4ClientView,
  ROWS,
  COLS,
  initC4,
  dropDisc,
} from "@/lib/connect4-engine";
import { useMultiplayer } from "@/hooks/useMultiplayer";

type Phase = "lobby" | "waiting" | "playing";
type Role = "host" | "guest";

export default function Connect4Game() {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<C4ClientView | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const roleRef = useRef<Role | null>(null);
  const nameRef = useRef("");
  const guestNameRef = useRef("");
  const gameRef = useRef<C4State | null>(null);
  const sendRef = useRef<(msg: unknown) => void>(() => {});
  const phaseRef = useRef<Phase>("lobby");

  function buildView(
    gs: C4State,
    playerIndex: 1 | 2,
    myName: string,
    oppName: string,
  ): C4ClientView {
    const names = [myName, oppName];
    return {
      board: gs.board,
      myColor: playerIndex,
      isMyTurn: !gs.winner && !gs.isDraw && gs.currentPlayer === playerIndex,
      winner: gs.winner ? (gs.winner === playerIndex ? myName : oppName) : null,
      isDraw: gs.isDraw,
      myName,
      opponentName: oppName,
      lastMove: gs.lastMove,
      winCells: gs.winCells,
    };
  }

  const broadcast = useCallback((gs: C4State) => {
    gameRef.current = gs;
    const hostView = buildView(gs, 1, nameRef.current, guestNameRef.current);
    const guestView = buildView(gs, 2, guestNameRef.current, nameRef.current);
    setView(hostView);
    sendRef.current({ type: "state-update", view: guestView });
  }, []);

  const handleMessage = useCallback(
    (msg: any) => {
      const r = roleRef.current;
      if (r === "host") {
        switch (msg.type) {
          case "join": {
            guestNameRef.current = msg.name;
            const gs = initC4();
            broadcast(gs);
            sendRef.current({ type: "game-started" });
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
          case "drop": {
            const gs = gameRef.current;
            if (!gs || gs.currentPlayer !== 2) break;
            const next = dropDisc(gs, msg.col);
            if (!next) break;
            broadcast(next);
            break;
          }
          case "restart": {
            const gs = initC4();
            broadcast(gs);
            break;
          }
        }
      } else if (r === "guest") {
        switch (msg.type) {
          case "state-update":
            setView(msg.view);
            if (phaseRef.current !== "playing") {
              phaseRef.current = "playing";
              setPhase("playing");
            }
            break;
          case "game-started":
            phaseRef.current = "playing";
            setPhase("playing");
            break;
        }
      }
    },
    [broadcast],
  );

  const mp = useMultiplayer("c4", handleMessage);

  useEffect(() => {
    sendRef.current = mp.send;
  }, [mp.send]);

  useEffect(() => {
    if (roleRef.current === "guest" && mp.status === "connected") {
      mp.send({ type: "join", name: nameRef.current });
    }
  }, [mp.status, mp.send]);

  const onCreate = useCallback(() => {
    if (!name.trim()) return;
    roleRef.current = "host";
    nameRef.current = name.trim();
    setRole("host");
    phaseRef.current = "waiting";
    setPhase("waiting");
    mp.createRoom();
  }, [name, mp]);

  const onJoin = useCallback(() => {
    if (!name.trim() || joinCode.trim().length < 3) return;
    roleRef.current = "guest";
    nameRef.current = name.trim();
    setRole("guest");
    phaseRef.current = "waiting";
    setPhase("waiting");
    mp.joinRoom(joinCode.trim());
  }, [name, joinCode, mp]);

  const onDrop = useCallback(
    (col: number) => {
      if (roleRef.current === "host") {
        const gs = gameRef.current;
        if (!gs || gs.currentPlayer !== 1) return;
        const next = dropDisc(gs, col);
        if (!next) return;
        broadcast(next);
      } else {
        sendRef.current({ type: "drop", col });
      }
    },
    [broadcast],
  );

  const onRestart = useCallback(() => {
    if (roleRef.current === "host") {
      const gs = initC4();
      broadcast(gs);
    } else {
      sendRef.current({ type: "restart" });
    }
  }, [broadcast]);

  const onBackToLobby = useCallback(() => {
    mp.disconnect();
    setPhase("lobby");
    setRole(null);
    setView(null);
    roleRef.current = null;
    phaseRef.current = "lobby";
    gameRef.current = null;
  }, [mp]);

  // ─── Lobby ───
  if (phase === "lobby") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-red-400 to-yellow-400 bg-clip-text text-transparent">
            🔴🟡 Connect 4
          </h1>
          <p className="text-gray-400 text-center mb-6">
            Drop discs, get 4 in a row to win!
          </p>
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate()}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="space-y-3">
            <button
              onClick={onCreate}
              disabled={!name.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-yellow-500 font-bold text-lg hover:from-red-400 hover:to-yellow-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Room
            </button>
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="flex-1 h-px bg-gray-700" />
              or join
              <div className="flex-1 h-px bg-gray-700" />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  name.trim() &&
                  joinCode.trim().length >= 3 &&
                  onJoin()
                }
                placeholder="ROOM CODE"
                maxLength={5}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-center tracking-widest font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={onJoin}
                disabled={!name.trim() || joinCode.trim().length < 3}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join
              </button>
            </div>
          </div>
          {mp.error && (
            <p className="mt-4 text-red-400 text-sm text-center">{mp.error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Waiting ───
  if (phase === "waiting") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4 text-center">
          {role === "host" ? (
            <>
              <h2 className="text-xl font-bold mb-4 text-yellow-400">
                Waiting for opponent...
              </h2>
              {mp.roomCode ? (
                <div className="mb-6">
                  <p className="text-gray-400 text-sm mb-2">
                    Share this room code:
                  </p>
                  <div className="text-4xl font-mono font-bold tracking-[0.3em] text-white bg-gray-700 rounded-xl py-4 select-all cursor-pointer">
                    {mp.roomCode}
                  </div>
                </div>
              ) : (
                <p className="text-gray-400">Creating room...</p>
              )}
            </>
          ) : (
            <h2 className="text-xl font-bold mb-4 text-blue-400">
              {mp.status === "connected"
                ? "Connected! Starting..."
                : "Connecting..."}
            </h2>
          )}
          <button
            onClick={onBackToLobby}
            className="mt-6 px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
          >
            Cancel
          </button>
          {mp.error && <p className="mt-4 text-red-400 text-sm">{mp.error}</p>}
        </div>
      </div>
    );
  }

  // ─── Game Board ───
  if (!view) return null;

  const winSet = new Set(view.winCells?.map((c) => `${c.row}-${c.col}`) ?? []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4">
      {/* Disconnection */}
      {mp.status === "disconnected" && !view.winner && !view.isDraw && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center border border-red-500">
            <div className="text-4xl mb-4">😵</div>
            <h2 className="text-xl font-bold mb-2 text-red-400">
              Opponent Disconnected
            </h2>
            <button
              onClick={onBackToLobby}
              className="mt-4 px-8 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="mb-4 text-center">
        <div className="flex items-center justify-center gap-4 mb-2">
          <span
            className={`flex items-center gap-1 ${view.myColor === 1 ? "text-red-400" : "text-yellow-400"}`}
          >
            <span
              className={`w-4 h-4 rounded-full inline-block ${view.myColor === 1 ? "bg-red-500" : "bg-yellow-400"}`}
            />
            {view.myName} (You)
          </span>
          <span className="text-gray-500">vs</span>
          <span
            className={`flex items-center gap-1 ${view.myColor === 1 ? "text-yellow-400" : "text-red-400"}`}
          >
            <span
              className={`w-4 h-4 rounded-full inline-block ${view.myColor === 1 ? "bg-yellow-400" : "bg-red-500"}`}
            />
            {view.opponentName}
          </span>
        </div>
        <p
          className={`text-sm font-semibold ${view.isMyTurn ? "text-green-400" : "text-gray-500"}`}
        >
          {view.winner
            ? `🎉 ${view.winner} wins!`
            : view.isDraw
              ? "It's a draw!"
              : view.isMyTurn
                ? "Your turn!"
                : `Waiting for ${view.opponentName}...`}
        </p>
      </div>

      {/* Board */}
      <div className="bg-blue-700 rounded-2xl p-3 shadow-2xl">
        {/* Column hover indicators */}
        <div className="grid grid-cols-7 gap-1.5 mb-1.5 px-0.5">
          {Array.from({ length: COLS }, (_, c) => (
            <div key={c} className="flex justify-center h-6">
              {view.isMyTurn && hoverCol === c && (
                <div
                  className={`w-8 h-8 rounded-full ${view.myColor === 1 ? "bg-red-500/50" : "bg-yellow-400/50"} animate-bounce`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) => {
              const cell = view.board[r][c];
              const isWin = winSet.has(`${r}-${c}`);
              const isLast =
                view.lastMove?.row === r && view.lastMove?.col === c;
              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => view.isMyTurn && onDrop(c)}
                  onMouseEnter={() => setHoverCol(c)}
                  onMouseLeave={() => setHoverCol(null)}
                  disabled={!view.isMyTurn}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 transition-all ${
                    cell === 1
                      ? `bg-red-500 border-red-400 ${isWin ? "ring-2 ring-white animate-pulse" : ""}`
                      : cell === 2
                        ? `bg-yellow-400 border-yellow-300 ${isWin ? "ring-2 ring-white animate-pulse" : ""}`
                        : "bg-blue-900 border-blue-800 hover:bg-blue-800"
                  } ${isLast && !isWin ? "ring-2 ring-white/40" : ""} ${
                    view.isMyTurn && cell === 0
                      ? "cursor-pointer"
                      : "cursor-default"
                  }`}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Game over buttons */}
      {(view.winner || view.isDraw) && (
        <div className="flex gap-3 mt-6">
          <button
            onClick={onRestart}
            className="px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold transition-colors"
          >
            Play Again
          </button>
          <button
            onClick={onBackToLobby}
            className="px-8 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
          >
            Leave
          </button>
        </div>
      )}
    </div>
  );
}

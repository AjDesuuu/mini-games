"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  MemoryState,
  MemClientView,
  initMemory,
  flipCard,
  checkMatch,
  createMemView,
} from "@/lib/memory-engine";
import { useMultiplayer } from "@/hooks/useMultiplayer";

type Phase = "lobby" | "waiting" | "playing";
type Role = "host" | "guest";

export default function MemoryGame() {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<MemClientView | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const roleRef = useRef<Role | null>(null);
  const nameRef = useRef("");
  const guestNameRef = useRef("");
  const gameRef = useRef<MemoryState | null>(null);
  const sendRef = useRef<(msg: unknown) => void>(() => {});
  const phaseRef = useRef<Phase>("lobby");
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const broadcastViews = useCallback((gs: MemoryState) => {
    gameRef.current = gs;
    const names: [string, string] = [nameRef.current, guestNameRef.current];
    const hv = createMemView(gs, 1, names);
    const gv = createMemView(gs, 2, names);
    setView(hv);
    sendRef.current({ type: "state-update", view: gv });
  }, []);

  const scheduleCheck = useCallback(
    (gs: MemoryState) => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = setTimeout(() => {
        const result = checkMatch(gs);
        if (result) {
          broadcastViews(result.newState);
        }
      }, 1000);
    },
    [broadcastViews],
  );

  const handleMessage = useCallback(
    (msg: any) => {
      const r = roleRef.current;
      if (r === "host") {
        switch (msg.type) {
          case "join": {
            guestNameRef.current = msg.name;
            const gs = initMemory(8);
            broadcastViews(gs);
            sendRef.current({ type: "game-started" });
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
          case "flip": {
            const gs = gameRef.current;
            if (!gs || gs.currentPlayer !== 2) break;
            const next = flipCard(gs, msg.cardId);
            if (!next) break;
            gameRef.current = next;
            broadcastViews(next);
            if (next.flippedIds.length === 2) {
              scheduleCheck(next);
            }
            break;
          }
          case "restart": {
            if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
            const gs = initMemory(8);
            broadcastViews(gs);
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
    [broadcastViews, scheduleCheck],
  );

  const mp = useMultiplayer("memory", handleMessage);

  useEffect(() => {
    sendRef.current = mp.send;
  }, [mp.send]);

  useEffect(() => {
    if (roleRef.current === "guest" && mp.status === "connected") {
      mp.send({ type: "join", name: nameRef.current });
    }
  }, [mp.status, mp.send]);

  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, []);

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

  const onFlip = useCallback(
    (cardId: number) => {
      if (roleRef.current === "host") {
        const gs = gameRef.current;
        if (!gs || gs.currentPlayer !== 1) return;
        const next = flipCard(gs, cardId);
        if (!next) return;
        gameRef.current = next;
        broadcastViews(next);
        if (next.flippedIds.length === 2) {
          scheduleCheck(next);
        }
      } else {
        sendRef.current({ type: "flip", cardId });
      }
    },
    [broadcastViews, scheduleCheck],
  );

  const onRestart = useCallback(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    if (roleRef.current === "host") {
      const gs = initMemory(8);
      broadcastViews(gs);
    } else {
      sendRef.current({ type: "restart" });
    }
  }, [broadcastViews]);

  const onBackToLobby = useCallback(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
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
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            🧠 Memory Match
          </h1>
          <p className="text-gray-400 text-center mb-6">
            Flip cards, find pairs. Most matches wins!
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 font-bold text-lg hover:from-cyan-400 hover:to-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h2 className="text-xl font-bold mb-4 text-cyan-400">
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

  if (!view) return null;

  // ─── Game Board ───
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4 py-6">
      {/* Disconnection */}
      {mp.status === "disconnected" && !view.gameOver && (
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

      {/* Scoreboard */}
      <div className="flex items-center gap-6 mb-4">
        <div
          className={`text-center px-4 py-2 rounded-xl ${view.isMyTurn ? "bg-green-600/20 ring-2 ring-green-500" : "bg-gray-800"}`}
        >
          <p className="font-bold text-green-400">{view.myName}</p>
          <p className="text-2xl font-bold">{view.myScore}</p>
        </div>
        <span className="text-gray-500 text-lg">vs</span>
        <div
          className={`text-center px-4 py-2 rounded-xl ${!view.isMyTurn && !view.gameOver ? "bg-red-600/20 ring-2 ring-red-500" : "bg-gray-800"}`}
        >
          <p className="font-bold text-red-400">{view.opponentName}</p>
          <p className="text-2xl font-bold">{view.opponentScore}</p>
        </div>
      </div>

      <p
        className={`text-sm font-semibold mb-4 ${view.isMyTurn ? "text-green-400" : "text-gray-500"}`}
      >
        {view.gameOver
          ? view.winner
            ? `🎉 ${view.winner} wins!`
            : "It's a draw!"
          : view.isMyTurn
            ? "Your turn — flip a card!"
            : `${view.opponentName}'s turn...`}
      </p>

      {/* Card Grid */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md">
        {view.cards.map((card) => (
          <button
            key={card.id}
            onClick={() =>
              view.isMyTurn && !card.flipped && !card.matched && onFlip(card.id)
            }
            disabled={!view.isMyTurn || card.flipped || card.matched}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl text-3xl sm:text-4xl flex items-center justify-center font-bold transition-all duration-300 select-none ${
              card.matched
                ? "bg-green-600/30 border-2 border-green-500/50 scale-95"
                : card.flipped
                  ? "bg-gray-700 border-2 border-purple-400 scale-105"
                  : "bg-gray-700 border-2 border-gray-600 hover:border-purple-400 hover:bg-gray-600 cursor-pointer"
            } ${!view.isMyTurn || card.flipped || card.matched ? "cursor-default" : ""}`}
          >
            {card.emoji ?? <span className="text-gray-500 text-xl">?</span>}
          </button>
        ))}
      </div>

      {/* Game Over */}
      {view.gameOver && (
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

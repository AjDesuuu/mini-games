"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  GameState,
  Color,
  ClientGameView,
  initializeGame,
  playCard,
  handleDraw,
  createClientView,
} from "@/lib/uno-engine";
import { useMultiplayer } from "@/hooks/useMultiplayer";
import UnoCard from "./UnoCard";
import ColorPicker from "./ColorPicker";

type Phase = "lobby" | "waiting" | "playing";
type Role = "host" | "guest";

export default function UnoGame() {
  // ─── UI State ───
  const [phase, setPhase] = useState<Phase>("lobby");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<ClientGameView | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // ─── Refs (read in stable callbacks) ───
  const roleRef = useRef<Role | null>(null);
  const nameRef = useRef("");
  const gameStateRef = useRef<GameState | null>(null);
  const sendRef = useRef<(msg: unknown) => void>(() => {});
  const pendingWildRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("lobby");
  const viewRef = useRef<ClientGameView | null>(null);

  // Helper: host updates game state and broadcasts views
  const broadcastState = useCallback((newState: GameState) => {
    gameStateRef.current = newState;
    const hostView = createClientView(newState, 0);
    const guestView = createClientView(newState, 1);
    viewRef.current = hostView;
    setView(hostView);
    sendRef.current({ type: "state-update", view: guestView });
  }, []);

  // ─── Message Handler (stable, uses refs) ───
  const handleMessage = useCallback(
    (msg: any) => {
      const r = roleRef.current;
      const send = sendRef.current;

      if (r === "host") {
        switch (msg.type) {
          case "join": {
            const newState = initializeGame([nameRef.current, msg.name]);
            broadcastState(newState);
            send({ type: "game-started" });
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
          case "play-card": {
            const gs = gameStateRef.current;
            if (!gs || gs.currentPlayerIndex !== 1) break;
            const newState = playCard(gs, msg.cardId, msg.color);
            if (newState === gs) break;
            broadcastState(newState);
            break;
          }
          case "draw": {
            const gs = gameStateRef.current;
            if (!gs || gs.currentPlayerIndex !== 1) break;
            const newState = handleDraw(gs);
            broadcastState(newState);
            break;
          }
          case "restart": {
            const gs = gameStateRef.current;
            if (!gs) break;
            const newState = initializeGame([
              gs.players[0].name,
              gs.players[1].name,
            ]);
            broadcastState(newState);
            break;
          }
        }
      } else if (r === "guest") {
        switch (msg.type) {
          case "state-update": {
            viewRef.current = msg.view;
            setView(msg.view);
            if (phaseRef.current !== "playing") {
              phaseRef.current = "playing";
              setPhase("playing");
            }
            break;
          }
          case "game-started": {
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
        }
      }
    },
    [broadcastState],
  );

  const mp = useMultiplayer(handleMessage);

  // Keep sendRef in sync
  useEffect(() => {
    sendRef.current = mp.send;
  }, [mp.send]);

  // Guest: send join message when connected
  useEffect(() => {
    if (roleRef.current === "guest" && mp.status === "connected") {
      mp.send({ type: "join", name: nameRef.current });
    }
  }, [mp.status, mp.send]);

  // ─── Lobby Actions ───
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

  // ─── Game Actions ───
  const executePlay = useCallback(
    (cardId: string, color?: Color) => {
      if (roleRef.current === "host") {
        const gs = gameStateRef.current;
        if (!gs || gs.currentPlayerIndex !== 0) return;
        const newState = playCard(gs, cardId, color);
        if (newState === gs) return;
        broadcastState(newState);
      } else {
        sendRef.current({ type: "play-card", cardId, color });
      }
    },
    [broadcastState],
  );

  const onPlayCard = useCallback(
    (cardId: string) => {
      const v = viewRef.current;
      if (!v) return;
      const card = v.myHand.find((c) => c.id === cardId);
      if (!card) return;

      if (card.type === "wild" || card.type === "wild_draw4") {
        pendingWildRef.current = cardId;
        setShowColorPicker(true);
        return;
      }
      executePlay(cardId);
    },
    [executePlay],
  );

  const onColorChoice = useCallback(
    (color: Color) => {
      const cardId = pendingWildRef.current;
      if (!cardId) return;
      executePlay(cardId, color);
      pendingWildRef.current = null;
      setShowColorPicker(false);
    },
    [executePlay],
  );

  const onDraw = useCallback(() => {
    if (roleRef.current === "host") {
      const gs = gameStateRef.current;
      if (!gs || gs.currentPlayerIndex !== 0) return;
      const newState = handleDraw(gs);
      broadcastState(newState);
    } else {
      sendRef.current({ type: "draw" });
    }
  }, [broadcastState]);

  const onRestart = useCallback(() => {
    setShowColorPicker(false);
    pendingWildRef.current = null;
    if (roleRef.current === "host") {
      const gs = gameStateRef.current;
      if (!gs) return;
      const newState = initializeGame([
        gs.players[0].name,
        gs.players[1].name,
      ]);
      broadcastState(newState);
    } else {
      sendRef.current({ type: "restart" });
    }
  }, [broadcastState]);

  const onBackToLobby = useCallback(() => {
    mp.disconnect();
    setPhase("lobby");
    setRole(null);
    setView(null);
    setShowColorPicker(false);
    roleRef.current = null;
    phaseRef.current = "lobby";
    gameStateRef.current = null;
    viewRef.current = null;
    pendingWildRef.current = null;
  }, [mp]);

  // ─── Render: Lobby ───
  if (phase === "lobby") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 bg-clip-text text-transparent">
            🃏 UNO
          </h1>
          <p className="text-gray-400 text-center mb-6">
            Play UNO with a friend on another device!
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 font-bold text-lg hover:from-purple-400 hover:to-pink-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Room
            </button>

            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="flex-1 h-px bg-gray-700" />
              or join a room
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

  // ─── Render: Waiting Room ───
  if (phase === "waiting") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4 text-center">
          {role === "host" ? (
            <>
              <h2 className="text-xl font-bold mb-4 text-purple-400">
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
                  <p className="text-gray-500 text-xs mt-2">
                    Click the code to select it
                  </p>
                </div>
              ) : (
                <p className="text-gray-400">Creating room...</p>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-4 text-blue-400">
                {mp.status === "connected"
                  ? "Connected! Starting game..."
                  : "Connecting..."}
              </h2>
              <p className="text-gray-400">
                Joining room {joinCode.toUpperCase()}...
              </p>
            </>
          )}

          <button
            onClick={onBackToLobby}
            className="mt-6 px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
          >
            Cancel
          </button>

          {mp.error && (
            <p className="mt-4 text-red-400 text-sm">{mp.error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: Game Board ───
  if (!view) return null;

  const playableSet = new Set(view.playableCardIds);
  const hasPlayable = playableSet.size > 0;

  const colorIndicator: Record<string, string> = {
    red: "bg-red-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
    yellow: "bg-yellow-400",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] max-w-5xl mx-auto px-2">
      {/* Color picker */}
      {showColorPicker && <ColorPicker onSelect={onColorChoice} />}

      {/* Winner overlay */}
      {view.gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center border border-purple-500 shadow-2xl animate-slide-up">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold mb-2 text-purple-400">
              {view.winner} Wins!
            </h2>
            <p className="text-gray-400 mb-6">
              {view.winner === view.myName
                ? "Congratulations!"
                : "Better luck next time!"}
            </p>
            <div className="flex gap-3 justify-center">
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
          </div>
        </div>
      )}

      {/* Disconnection overlay */}
      {mp.status === "disconnected" && !view.gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center border border-red-500 shadow-2xl">
            <div className="text-4xl mb-4">😵</div>
            <h2 className="text-xl font-bold mb-2 text-red-400">
              Opponent Disconnected
            </h2>
            <button
              onClick={onBackToLobby}
              className="mt-4 px-8 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold transition-colors"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Opponent's cards (face down) */}
      <div className="pt-3 pb-2">
        <div className="text-center text-sm text-gray-500 mb-1">
          {view.opponentName} — {view.opponentCardCount} cards
          {view.opponentCardCount === 1 && (
            <span className="ml-2 text-red-400 font-bold animate-pulse">
              UNO!
            </span>
          )}
        </div>
        <div className="flex justify-center gap-1 flex-wrap">
          {Array.from({ length: view.opponentCardCount }, (_, i) => (
            <div
              key={i}
              className="w-10 h-14 rounded-lg border-2 border-gray-500 bg-gray-700 flex items-center justify-center text-xs select-none bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.05)_3px,rgba(255,255,255,0.05)_6px)]"
            >
              🂠
            </div>
          ))}
        </div>
      </div>

      {/* Center play area */}
      <div className="flex-1 flex items-center justify-center gap-8">
        {/* Draw pile */}
        <button
          onClick={onDraw}
          disabled={!view.isMyTurn}
          className="flex flex-col items-center gap-2 group disabled:opacity-50"
        >
          <div className="w-20 h-28 rounded-xl border-2 border-gray-500 bg-gray-700 flex items-center justify-center text-2xl font-bold shadow-lg group-hover:border-purple-400 group-hover:scale-105 transition-all cursor-pointer group-disabled:cursor-default group-disabled:hover:scale-100 group-disabled:hover:border-gray-500 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.03)_4px,rgba(255,255,255,0.03)_8px)]">
            🂠
          </div>
          <span className="text-xs text-gray-400">
            {view.mustDraw > 0
              ? `Draw ${view.mustDraw}`
              : hasPlayable
                ? "Draw"
                : "Draw (no plays)"}
          </span>
          <span className="text-[10px] text-gray-600">
            {view.drawPileCount} left
          </span>
        </button>

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-2">
          <UnoCard card={view.topCard} wildColor={view.wildColor} />
          <div className="flex items-center gap-1.5">
            <div
              className={`w-3 h-3 rounded-full ${colorIndicator[view.effectiveColor]}`}
            />
            <span className="text-xs text-gray-400 capitalize">
              {view.effectiveColor}
            </span>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="text-center py-2">
        <p className="text-sm text-gray-400">{view.lastAction}</p>
        <p
          className={`text-xs font-semibold mt-1 ${view.isMyTurn ? "text-green-400" : "text-gray-500"}`}
        >
          {view.isMyTurn
            ? view.mustDraw > 0
              ? `Your turn — draw ${view.mustDraw} cards or stack!`
              : "Your turn!"
            : `Waiting for ${view.opponentName}...`}
        </p>
      </div>

      {/* Current player's hand */}
      <div className="pb-4">
        <div className="text-center text-sm text-gray-400 mb-2">
          {view.myName} — {view.myHand.length} cards
          {view.myHand.length === 1 && (
            <span className="ml-2 text-red-400 font-bold animate-pulse">
              UNO!
            </span>
          )}
        </div>
        <div className="flex justify-center gap-1.5 flex-wrap px-2">
          {view.myHand.map((card) => (
            <UnoCard
              key={card.id}
              card={card}
              playable={playableSet.has(card.id)}
              onClick={
                playableSet.has(card.id) ? () => onPlayCard(card.id) : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

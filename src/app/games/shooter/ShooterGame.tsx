"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMultiplayer } from "@/hooks/useMultiplayer";

// ─── Target types ───

interface Target {
  id: number;
  emoji: string;
  points: number;
  x: number; // percentage 0-90
  y: number; // percentage 0-85
  size: "sm" | "md" | "lg";
  spawnedAt: number;
  lifetime: number; // ms before it disappears
}

interface ShooterView {
  myName: string;
  opponentName: string;
  myScore: number;
  opponentScore: number;
  targets: Target[];
  timeLeft: number; // seconds
  gameOver: boolean;
  winner: string | null; // null = draw
  maxScore: number;
  lastHit: { player: string; emoji: string; points: number } | null;
}

const TARGET_POOL = [
  { emoji: "🎯", points: 1, weight: 40, lifetime: 2500, size: "lg" as const },
  { emoji: "⭐", points: 2, weight: 30, lifetime: 2000, size: "md" as const },
  { emoji: "💎", points: 3, weight: 15, lifetime: 1500, size: "md" as const },
  { emoji: "🌟", points: 5, weight: 10, lifetime: 1200, size: "sm" as const },
  { emoji: "👑", points: 10, weight: 5, lifetime: 800, size: "sm" as const },
];

const MAX_SCORE = 30;
const GAME_DURATION = 60; // seconds
const SPAWN_INTERVAL = 800; // ms
const MAX_TARGETS = 6;

type Phase = "lobby" | "waiting" | "playing";
type Role = "host" | "guest";

export default function ShooterGame() {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<ShooterView | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

  const roleRef = useRef<Role | null>(null);
  const nameRef = useRef("");
  const guestNameRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");
  const sendRef = useRef<(msg: unknown) => void>(() => {});

  // Host game state
  const targetsRef = useRef<Target[]>([]);
  const scoresRef = useRef<[number, number]>([0, 0]);
  const lastHitRef = useRef<{
    player: string;
    emoji: string;
    points: number;
  } | null>(null);
  const targetIdRef = useRef(0);
  const gameOverRef = useRef(false);
  const startTimeRef = useRef(0);
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function pickTarget(): (typeof TARGET_POOL)[number] {
    const totalWeight = TARGET_POOL.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * totalWeight;
    for (const t of TARGET_POOL) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return TARGET_POOL[0];
  }

  function buildView(timeLeft: number): ShooterView {
    return {
      myName: nameRef.current,
      opponentName: guestNameRef.current,
      myScore: scoresRef.current[0],
      opponentScore: scoresRef.current[1],
      targets: targetsRef.current,
      timeLeft,
      gameOver: gameOverRef.current,
      winner: gameOverRef.current
        ? scoresRef.current[0] > scoresRef.current[1]
          ? nameRef.current
          : scoresRef.current[1] > scoresRef.current[0]
            ? guestNameRef.current
            : null
        : null,
      maxScore: MAX_SCORE,
      lastHit: lastHitRef.current,
    };
  }

  function guestView(hv: ShooterView): ShooterView {
    return {
      ...hv,
      myName: guestNameRef.current,
      opponentName: nameRef.current,
      myScore: hv.opponentScore,
      opponentScore: hv.myScore,
    };
  }

  const broadcastState = useCallback(() => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const timeLeft = Math.max(0, Math.ceil(GAME_DURATION - elapsed));
    const hv = buildView(timeLeft);
    const gv = guestView(hv);
    setView(hv);
    sendRef.current({ type: "state-update", view: gv });
  }, []);

  const endGame = useCallback(() => {
    gameOverRef.current = true;
    if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    broadcastState();
  }, [broadcastState]);

  const checkWinByScore = useCallback(() => {
    if (
      scoresRef.current[0] >= MAX_SCORE ||
      scoresRef.current[1] >= MAX_SCORE
    ) {
      endGame();
      return true;
    }
    return false;
  }, [endGame]);

  const spawnTarget = useCallback(() => {
    if (gameOverRef.current) return;
    // Remove expired targets
    const now = Date.now();
    targetsRef.current = targetsRef.current.filter(
      (t) => now - t.spawnedAt < t.lifetime,
    );

    if (targetsRef.current.length >= MAX_TARGETS) return;

    const template = pickTarget();
    const target: Target = {
      id: targetIdRef.current++,
      emoji: template.emoji,
      points: template.points,
      x: Math.random() * 85 + 2,
      y: Math.random() * 75 + 5,
      size: template.size,
      spawnedAt: now,
      lifetime: template.lifetime,
    };
    targetsRef.current.push(target);
  }, []);

  const startGameLoop = useCallback(() => {
    gameOverRef.current = false;
    scoresRef.current = [0, 0];
    targetsRef.current = [];
    targetIdRef.current = 0;
    lastHitRef.current = null;
    startTimeRef.current = Date.now();

    spawnTimerRef.current = setInterval(() => {
      spawnTarget();
      broadcastState();
    }, SPAWN_INTERVAL);

    tickTimerRef.current = setInterval(() => {
      // Remove expired
      const now = Date.now();
      targetsRef.current = targetsRef.current.filter(
        (t) => now - t.spawnedAt < t.lifetime,
      );

      const elapsed = (now - startTimeRef.current) / 1000;
      if (elapsed >= GAME_DURATION) {
        endGame();
        return;
      }
      broadcastState();
    }, 200);
  }, [spawnTarget, broadcastState, endGame]);

  const handleHit = useCallback(
    (playerIndex: 0 | 1, targetId: number) => {
      if (gameOverRef.current) return;
      const idx = targetsRef.current.findIndex((t) => t.id === targetId);
      if (idx === -1) return;

      const target = targetsRef.current[idx];
      targetsRef.current.splice(idx, 1);

      scoresRef.current[playerIndex] += target.points;
      const playerName =
        playerIndex === 0 ? nameRef.current : guestNameRef.current;
      lastHitRef.current = {
        player: playerName,
        emoji: target.emoji,
        points: target.points,
      };

      if (!checkWinByScore()) {
        broadcastState();
      }
    },
    [broadcastState, checkWinByScore],
  );

  const handleMessage = useCallback(
    (msg: any) => {
      const r = roleRef.current;
      if (r === "host") {
        switch (msg.type) {
          case "join": {
            guestNameRef.current = msg.name;
            // Start countdown
            let count = 3;
            setCountdown(count);
            sendRef.current({ type: "countdown", count });
            const cdInterval = setInterval(() => {
              count--;
              if (count > 0) {
                setCountdown(count);
                sendRef.current({ type: "countdown", count });
              } else {
                clearInterval(cdInterval);
                setCountdown(null);
                sendRef.current({ type: "countdown", count: 0 });
                startGameLoop();
                phaseRef.current = "playing";
                setPhase("playing");
              }
            }, 1000);
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
          case "hit": {
            handleHit(1, msg.targetId);
            break;
          }
          case "restart": {
            let count = 3;
            setCountdown(count);
            sendRef.current({ type: "countdown", count });
            const cdInterval = setInterval(() => {
              count--;
              if (count > 0) {
                setCountdown(count);
                sendRef.current({ type: "countdown", count });
              } else {
                clearInterval(cdInterval);
                setCountdown(null);
                sendRef.current({ type: "countdown", count: 0 });
                startGameLoop();
              }
            }, 1000);
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
          case "countdown":
            setCountdown(msg.count > 0 ? msg.count : null);
            if (msg.count === 0 && phaseRef.current !== "playing") {
              phaseRef.current = "playing";
              setPhase("playing");
            }
            break;
        }
      }
    },
    [handleHit, startGameLoop],
  );

  const mp = useMultiplayer("shooter", handleMessage);

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
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
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

  const onHit = useCallback(
    (targetId: number) => {
      if (roleRef.current === "host") {
        handleHit(0, targetId);
      } else {
        sendRef.current({ type: "hit", targetId });
      }
    },
    [handleHit],
  );

  const onRestart = useCallback(() => {
    if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    if (roleRef.current === "host") {
      let count = 3;
      setCountdown(count);
      sendRef.current({ type: "countdown", count });
      const cdInterval = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdown(count);
          sendRef.current({ type: "countdown", count });
        } else {
          clearInterval(cdInterval);
          setCountdown(null);
          sendRef.current({ type: "countdown", count: 0 });
          startGameLoop();
        }
      }, 1000);
    } else {
      sendRef.current({ type: "restart" });
    }
  }, [startGameLoop]);

  const onBackToLobby = useCallback(() => {
    if (spawnTimerRef.current) clearInterval(spawnTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    mp.disconnect();
    setPhase("lobby");
    setRole(null);
    setView(null);
    setCountdown(null);
    roleRef.current = null;
    phaseRef.current = "lobby";
    gameOverRef.current = false;
  }, [mp]);

  // ─── Lobby ───
  if (phase === "lobby") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4">
          <h1 className="text-3xl font-bold text-center mb-2">🎯</h1>
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-amber-400 to-red-400 bg-clip-text text-transparent">
            Target Shooter
          </h1>
          <p className="text-gray-400 text-center mb-6">
            Targets pop up — shoot them before your opponent! First to{" "}
            {MAX_SCORE} points or highest score in {GAME_DURATION}s wins.
          </p>
          <div className="mb-4 text-xs text-gray-500 text-center">
            <span className="inline-flex items-center gap-1">🎯 1pt</span> ·{" "}
            <span className="inline-flex items-center gap-1">⭐ 2pt</span> ·{" "}
            <span className="inline-flex items-center gap-1">💎 3pt</span> ·{" "}
            <span className="inline-flex items-center gap-1">🌟 5pt</span> ·{" "}
            <span className="inline-flex items-center gap-1">👑 10pt</span>
          </div>
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-red-500 font-bold text-lg hover:from-amber-400 hover:to-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h2 className="text-xl font-bold mb-4 text-amber-400">
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

  // ─── Game Arena ───
  return (
    <div className="flex flex-col h-[calc(100vh-60px)] max-w-4xl mx-auto px-2 select-none">
      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="text-9xl font-bold text-white animate-bounce">
            {countdown}
          </div>
        </div>
      )}

      {/* Disconnection */}
      {mp.status === "disconnected" && view && !view.gameOver && (
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

      {/* Game Over overlay */}
      {view?.gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center border border-purple-500 shadow-2xl animate-slide-up max-w-sm w-full mx-4">
            <div className="text-6xl mb-4">
              {view.winner === view.myName ? "🏆" : view.winner ? "😢" : "🤝"}
            </div>
            <h2 className="text-3xl font-bold mb-2 text-purple-400">
              {view.winner ? `${view.winner} wins!` : "It's a draw!"}
            </h2>
            <div className="flex justify-center gap-6 mb-4 text-lg">
              <span>
                {view.myName}:{" "}
                <strong className="text-green-400">{view.myScore}</strong>
              </span>
              <span>
                {view.opponentName}:{" "}
                <strong className="text-red-400">{view.opponentScore}</strong>
              </span>
            </div>
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

      {/* HUD */}
      <div className="flex items-center justify-between py-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold">{view?.myName}</span>
          <span className="text-2xl font-bold text-white">
            {view?.myScore ?? 0}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-mono font-bold text-amber-400">
            {view?.timeLeft ?? GAME_DURATION}s
          </span>
          <span className="text-[10px] text-gray-500">
            first to {MAX_SCORE}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">
            {view?.opponentScore ?? 0}
          </span>
          <span className="text-red-400 font-bold">{view?.opponentName}</span>
        </div>
      </div>

      {/* Score bars */}
      <div className="flex gap-2 px-2 mb-2">
        <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-green-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${((view?.myScore ?? 0) / MAX_SCORE) * 100}%` }}
          />
        </div>
        <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className="bg-red-500 h-full rounded-full transition-all duration-300 ml-auto"
            style={{
              width: `${((view?.opponentScore ?? 0) / MAX_SCORE) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Last hit indicator */}
      {view?.lastHit && (
        <div className="text-center text-xs text-gray-400 mb-1">
          {view.lastHit.player} hit {view.lastHit.emoji} (+
          {view.lastHit.points})
        </div>
      )}

      {/* Arena */}
      <div className="flex-1 relative bg-gray-900/50 rounded-2xl border border-gray-700 overflow-hidden">
        {/* Crosshair cursor area */}
        <div className="absolute inset-0" style={{ cursor: "crosshair" }}>
          {view?.targets.map((target) => {
            const sizeClass =
              target.size === "lg"
                ? "w-14 h-14 text-3xl"
                : target.size === "md"
                  ? "w-12 h-12 text-2xl"
                  : "w-10 h-10 text-xl";
            return (
              <button
                key={target.id}
                onClick={() => onHit(target.id)}
                className={`absolute ${sizeClass} flex items-center justify-center rounded-full hover:scale-125 active:scale-90 transition-transform duration-100 cursor-crosshair animate-slide-up`}
                style={{
                  left: `${target.x}%`,
                  top: `${target.y}%`,
                }}
                title={`${target.emoji} +${target.points}`}
              >
                <span className="drop-shadow-lg">{target.emoji}</span>
              </button>
            );
          })}

          {/* Empty state */}
          {(!view || (view.targets.length === 0 && !view.gameOver)) && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              {countdown ? "" : "Targets incoming..."}
            </div>
          )}
        </div>
      </div>

      {/* Point legend */}
      <div className="flex justify-center gap-3 py-2 text-xs text-gray-500">
        <span>🎯 1pt</span>
        <span>⭐ 2pt</span>
        <span>💎 3pt</span>
        <span>🌟 5pt</span>
        <span>👑 10pt</span>
      </div>
    </div>
  );
}

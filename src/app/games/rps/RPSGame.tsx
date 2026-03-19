"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMultiplayer } from "@/hooks/useMultiplayer";

type Choice = "rock" | "paper" | "scissors";
type RoundResult = "win" | "lose" | "draw";

interface RoundRecord {
  myChoice: Choice;
  oppChoice: Choice;
  result: RoundResult;
}

interface RPSView {
  myName: string;
  opponentName: string;
  myScore: number;
  opponentScore: number;
  round: number;
  maxWins: number;
  waitingForOpponent: boolean;
  myChoice: Choice | null;
  lastRound: {
    myChoice: Choice;
    oppChoice: Choice;
    result: RoundResult;
  } | null;
  gameOver: boolean;
  winner: string | null;
  history: RoundRecord[];
}

const CHOICE_EMOJI: Record<Choice, string> = {
  rock: "🪨",
  paper: "📄",
  scissors: "✂️",
};
const CHOICE_LABEL: Record<Choice, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};
const CHOICES: Choice[] = ["rock", "paper", "scissors"];

function getResult(me: Choice, opp: Choice): RoundResult {
  if (me === opp) return "draw";
  if (
    (me === "rock" && opp === "scissors") ||
    (me === "paper" && opp === "rock") ||
    (me === "scissors" && opp === "paper")
  )
    return "win";
  return "lose";
}

type Phase = "lobby" | "waiting" | "playing";
type Role = "host" | "guest";

export default function RPSGame() {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<RPSView | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showResult, setShowResult] = useState(false);

  const roleRef = useRef<Role | null>(null);
  const nameRef = useRef("");
  const guestNameRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");
  const sendRef = useRef<(msg: unknown) => void>(() => {});

  // Host state
  const hostChoiceRef = useRef<Choice | null>(null);
  const guestChoiceRef = useRef<Choice | null>(null);
  const scoresRef = useRef<[number, number]>([0, 0]);
  const roundRef = useRef(1);
  const historyRef = useRef<
    { p1: Choice; p2: Choice; result: "p1" | "p2" | "draw" }[]
  >([]);
  const MAX_WINS = 3;

  function buildHostView(): RPSView {
    return {
      myName: nameRef.current,
      opponentName: guestNameRef.current,
      myScore: scoresRef.current[0],
      opponentScore: scoresRef.current[1],
      round: roundRef.current,
      maxWins: MAX_WINS,
      waitingForOpponent:
        hostChoiceRef.current !== null && guestChoiceRef.current === null,
      myChoice: hostChoiceRef.current,
      lastRound: null,
      gameOver: false,
      winner: null,
      history: historyRef.current.map((h) => ({
        myChoice: h.p1,
        oppChoice: h.p2,
        result: h.result === "p1" ? "win" : h.result === "p2" ? "lose" : "draw",
      })),
    };
  }

  function buildGuestView(): RPSView {
    return {
      myName: guestNameRef.current,
      opponentName: nameRef.current,
      myScore: scoresRef.current[1],
      opponentScore: scoresRef.current[0],
      round: roundRef.current,
      maxWins: MAX_WINS,
      waitingForOpponent:
        guestChoiceRef.current !== null && hostChoiceRef.current === null,
      myChoice: guestChoiceRef.current,
      lastRound: null,
      gameOver: false,
      winner: null,
      history: historyRef.current.map((h) => ({
        myChoice: h.p2,
        oppChoice: h.p1,
        result: h.result === "p2" ? "win" : h.result === "p1" ? "lose" : "draw",
      })),
    };
  }

  const resolveRound = useCallback(() => {
    const hc = hostChoiceRef.current;
    const gc = guestChoiceRef.current;
    if (!hc || !gc) return;

    const result = getResult(hc, gc);
    let roundResult: "p1" | "p2" | "draw" = "draw";
    if (result === "win") {
      scoresRef.current = [scoresRef.current[0] + 1, scoresRef.current[1]];
      roundResult = "p1";
    } else if (result === "lose") {
      scoresRef.current = [scoresRef.current[0], scoresRef.current[1] + 1];
      roundResult = "p2";
    }

    historyRef.current.push({ p1: hc, p2: gc, result: roundResult });

    const s = scoresRef.current;
    const gameOver = s[0] >= MAX_WINS || s[1] >= MAX_WINS;
    const winnerName = gameOver
      ? s[0] >= MAX_WINS
        ? nameRef.current
        : guestNameRef.current
      : null;

    // Send round result to both
    const hostRound = {
      myChoice: hc,
      oppChoice: gc,
      result: getResult(hc, gc),
    };
    const guestRound = {
      myChoice: gc,
      oppChoice: hc,
      result: getResult(gc, hc),
    };

    const hostView: RPSView = {
      ...buildHostView(),
      lastRound: hostRound,
      gameOver,
      winner: winnerName,
    };
    const guestView: RPSView = {
      ...buildGuestView(),
      lastRound: guestRound,
      gameOver,
      winner: winnerName,
    };

    setView(hostView);
    setShowResult(true);
    sendRef.current({ type: "round-result", view: guestView });

    // Reset choices for next round
    hostChoiceRef.current = null;
    guestChoiceRef.current = null;
    if (!gameOver) {
      roundRef.current += 1;
    }
  }, []);

  const resetGame = useCallback(() => {
    hostChoiceRef.current = null;
    guestChoiceRef.current = null;
    scoresRef.current = [0, 0];
    roundRef.current = 1;
    historyRef.current = [];
    setShowResult(false);
    const hv = buildHostView();
    const gv = buildGuestView();
    setView(hv);
    sendRef.current({ type: "state-update", view: gv });
  }, []);

  const handleMessage = useCallback(
    (msg: any) => {
      const r = roleRef.current;
      if (r === "host") {
        switch (msg.type) {
          case "join": {
            guestNameRef.current = msg.name;
            hostChoiceRef.current = null;
            guestChoiceRef.current = null;
            scoresRef.current = [0, 0];
            roundRef.current = 1;
            historyRef.current = [];
            setShowResult(false);
            const hv = buildHostView();
            const gv = buildGuestView();
            setView(hv);
            sendRef.current({ type: "state-update", view: gv });
            phaseRef.current = "playing";
            setPhase("playing");
            break;
          }
          case "choose": {
            guestChoiceRef.current = msg.choice;
            // Update host view to show waiting
            setView(buildHostView());
            if (hostChoiceRef.current) resolveRound();
            break;
          }
          case "restart": {
            resetGame();
            break;
          }
          case "next-round": {
            setShowResult(false);
            const hv = buildHostView();
            const gv = buildGuestView();
            setView(hv);
            sendRef.current({ type: "state-update", view: gv });
            break;
          }
        }
      } else if (r === "guest") {
        switch (msg.type) {
          case "state-update":
            setView(msg.view);
            setShowResult(false);
            if (phaseRef.current !== "playing") {
              phaseRef.current = "playing";
              setPhase("playing");
            }
            break;
          case "round-result":
            setView(msg.view);
            setShowResult(true);
            break;
        }
      }
    },
    [resolveRound, resetGame],
  );

  const mp = useMultiplayer("rps", handleMessage);

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

  const onChoose = useCallback(
    (choice: Choice) => {
      if (roleRef.current === "host") {
        hostChoiceRef.current = choice;
        setView(buildHostView());
        if (guestChoiceRef.current) resolveRound();
      } else {
        sendRef.current({ type: "choose", choice });
        setView((prev) =>
          prev ? { ...prev, myChoice: choice, waitingForOpponent: true } : prev,
        );
      }
    },
    [resolveRound],
  );

  const onNextRound = useCallback(() => {
    if (roleRef.current === "host") {
      setShowResult(false);
      const hv = buildHostView();
      const gv = buildGuestView();
      setView(hv);
      sendRef.current({ type: "state-update", view: gv });
    } else {
      sendRef.current({ type: "next-round" });
      setShowResult(false);
    }
  }, []);

  const onRestart = useCallback(() => {
    setShowResult(false);
    if (roleRef.current === "host") {
      resetGame();
    } else {
      sendRef.current({ type: "restart" });
    }
  }, [resetGame]);

  const onBackToLobby = useCallback(() => {
    mp.disconnect();
    setPhase("lobby");
    setRole(null);
    setView(null);
    roleRef.current = null;
    phaseRef.current = "lobby";
    setShowResult(false);
  }, [mp]);

  // ─── Lobby ───
  if (phase === "lobby") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-8 w-full max-w-md mx-4">
          <h1 className="text-3xl font-bold text-center mb-2">✊✋✌️</h1>
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-orange-400 to-pink-400 bg-clip-text text-transparent">
            Rock Paper Scissors
          </h1>
          <p className="text-gray-400 text-center mb-6">
            Best of 5 — first to 3 wins!
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 font-bold text-lg hover:from-orange-400 hover:to-pink-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              <h2 className="text-xl font-bold mb-4 text-orange-400">
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

  // ─── Game ───
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] px-4">
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
      <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-6 w-full max-w-md mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-green-400">{view.myName}</span>
          <span className="text-gray-500 text-sm">Round {view.round}</span>
          <span className="font-bold text-red-400">{view.opponentName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-4xl font-bold">{view.myScore}</span>
          <span className="text-gray-500 text-lg">first to {view.maxWins}</span>
          <span className="text-4xl font-bold">{view.opponentScore}</span>
        </div>

        {/* History */}
        {view.history.length > 0 && (
          <div className="flex justify-center gap-2 mt-3">
            {view.history.map((h, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  h.result === "win"
                    ? "bg-green-600"
                    : h.result === "lose"
                      ? "bg-red-600"
                      : "bg-gray-600"
                }`}
              >
                {CHOICE_EMOJI[h.myChoice]}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Round result */}
      {showResult && view.lastRound && (
        <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-6 w-full max-w-md mb-6 text-center animate-slide-up">
          <div className="flex justify-center items-center gap-8 mb-4">
            <div className="text-center">
              <div className="text-5xl mb-1">
                {CHOICE_EMOJI[view.lastRound.myChoice]}
              </div>
              <p className="text-xs text-gray-400">
                {CHOICE_LABEL[view.lastRound.myChoice]}
              </p>
            </div>
            <span className="text-2xl text-gray-500">vs</span>
            <div className="text-center">
              <div className="text-5xl mb-1">
                {CHOICE_EMOJI[view.lastRound.oppChoice]}
              </div>
              <p className="text-xs text-gray-400">
                {CHOICE_LABEL[view.lastRound.oppChoice]}
              </p>
            </div>
          </div>
          <p
            className={`font-bold text-lg ${
              view.lastRound.result === "win"
                ? "text-green-400"
                : view.lastRound.result === "lose"
                  ? "text-red-400"
                  : "text-gray-400"
            }`}
          >
            {view.lastRound.result === "win"
              ? "You win this round!"
              : view.lastRound.result === "lose"
                ? "You lose this round!"
                : "Draw!"}
          </p>

          {view.gameOver ? (
            <div className="mt-4">
              <p className="text-2xl font-bold mb-4 text-purple-400">
                🎉 {view.winner} wins the match!
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={onRestart}
                  className="px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold"
                >
                  Play Again
                </button>
                <button
                  onClick={onBackToLobby}
                  className="px-8 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold"
                >
                  Leave
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onNextRound}
              className="mt-4 px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold"
            >
              Next Round
            </button>
          )}
        </div>
      )}

      {/* Choice buttons */}
      {!showResult && (
        <div className="w-full max-w-md">
          {view.myChoice ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">{CHOICE_EMOJI[view.myChoice]}</div>
              <p className="text-gray-400">
                You picked {CHOICE_LABEL[view.myChoice]}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Waiting for {view.opponentName}...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {CHOICES.map((choice) => (
                <button
                  key={choice}
                  onClick={() => onChoose(choice)}
                  className="flex flex-col items-center gap-2 py-6 rounded-2xl bg-gray-800 border-2 border-gray-700 hover:border-purple-500 hover:bg-gray-700 transition-all hover:scale-105"
                >
                  <span className="text-5xl">{CHOICE_EMOJI[choice]}</span>
                  <span className="text-sm font-bold">
                    {CHOICE_LABEL[choice]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

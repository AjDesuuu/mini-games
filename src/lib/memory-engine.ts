export const EMOJIS = [
  "🐶",
  "🐱",
  "🐸",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🦁",
  "🐯",
  "🐮",
  "🐷",
  "🐵",
  "🐔",
  "🐧",
  "🐳",
  "🦄",
];

export interface MemCard {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

export interface MemoryState {
  cards: MemCard[];
  currentPlayer: 1 | 2;
  scores: [number, number];
  flippedIds: number[]; // currently face-up (max 2)
  gameOver: boolean;
}

export function initMemory(pairCount: number = 12): MemoryState {
  const chosen = EMOJIS.slice(0, pairCount);
  const raw = [...chosen, ...chosen].map((emoji, i) => ({
    id: i,
    emoji,
    flipped: false,
    matched: false,
  }));

  // Shuffle
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [raw[i], raw[j]] = [raw[j], raw[i]];
    raw[i].id = i;
    raw[j].id = j;
  }
  // Re-assign IDs after shuffle
  raw.forEach((c, i) => (c.id = i));

  return {
    cards: raw,
    currentPlayer: 1,
    scores: [0, 0],
    flippedIds: [],
    gameOver: false,
  };
}

export function flipCard(
  state: MemoryState,
  cardId: number,
): MemoryState | null {
  if (state.gameOver) return null;
  if (state.flippedIds.length >= 2) return null;

  const card = state.cards[cardId];
  if (!card || card.flipped || card.matched) return null;

  const newState = structuredClone(state);
  newState.cards[cardId].flipped = true;
  newState.flippedIds.push(cardId);

  return newState;
}

export function checkMatch(state: MemoryState): {
  newState: MemoryState;
  matched: boolean;
} | null {
  if (state.flippedIds.length !== 2) return null;

  const [id1, id2] = state.flippedIds;
  const card1 = state.cards[id1];
  const card2 = state.cards[id2];

  const newState = structuredClone(state);
  const matched = card1.emoji === card2.emoji;

  if (matched) {
    newState.cards[id1].matched = true;
    newState.cards[id2].matched = true;
    newState.scores[newState.currentPlayer - 1]++;
    // Same player goes again
  } else {
    newState.cards[id1].flipped = false;
    newState.cards[id2].flipped = false;
    // Switch player
    newState.currentPlayer = newState.currentPlayer === 1 ? 2 : 1;
  }

  newState.flippedIds = [];
  newState.gameOver = newState.cards.every((c) => c.matched);

  return { newState, matched };
}

export interface MemClientView {
  cards: {
    id: number;
    emoji: string | null;
    flipped: boolean;
    matched: boolean;
  }[];
  isMyTurn: boolean;
  myScore: number;
  opponentScore: number;
  myName: string;
  opponentName: string;
  gameOver: boolean;
  winner: string | null; // null = draw
}

export function createMemView(
  state: MemoryState,
  playerIndex: 1 | 2,
  names: [string, string],
): MemClientView {
  const oppIndex = playerIndex === 1 ? 2 : 1;
  const myScore = state.scores[playerIndex - 1];
  const oppScore = state.scores[oppIndex - 1];

  let winner: string | null = null;
  if (state.gameOver) {
    if (myScore > oppScore) winner = names[playerIndex - 1];
    else if (oppScore > myScore) winner = names[oppIndex - 1];
    // else null = draw
  }

  return {
    cards: state.cards.map((c) => ({
      id: c.id,
      emoji: c.flipped || c.matched ? c.emoji : null,
      flipped: c.flipped,
      matched: c.matched,
    })),
    isMyTurn: !state.gameOver && state.currentPlayer === playerIndex,
    myScore,
    opponentScore: oppScore,
    myName: names[playerIndex - 1],
    opponentName: names[oppIndex - 1],
    gameOver: state.gameOver,
    winner,
  };
}

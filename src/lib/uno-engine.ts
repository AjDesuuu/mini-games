export type Color = "red" | "blue" | "green" | "yellow";
export type WildColor = Color | null;

export type CardType =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild_draw4";

export interface Card {
  id: string;
  type: CardType;
  color: Color | null; // null for wild cards
  value: number | null; // 0-9 for number cards, null for action/wild
}

export interface Player {
  id: number;
  name: string;
  hand: Card[];
}

export interface GameState {
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  wildColor: WildColor;
  winner: number | null;
  mustDraw: number; // stacked draw cards
  status: "setup" | "playing" | "choosing-color" | "finished";
  lastAction: string;
}

const COLORS: Color[] = ["red", "blue", "green", "yellow"];

let cardIdCounter = 0;

function createCard(
  type: CardType,
  color: Color | null,
  value: number | null,
): Card {
  return { id: `card-${cardIdCounter++}`, type, color, value };
}

export function createDeck(): Card[] {
  cardIdCounter = 0;
  const cards: Card[] = [];

  for (const color of COLORS) {
    // One 0 per color
    cards.push(createCard("number", color, 0));
    // Two of each 1-9
    for (let n = 1; n <= 9; n++) {
      cards.push(createCard("number", color, n));
      cards.push(createCard("number", color, n));
    }
    // Two skip, reverse, draw2 per color
    for (let i = 0; i < 2; i++) {
      cards.push(createCard("skip", color, null));
      cards.push(createCard("reverse", color, null));
      cards.push(createCard("draw2", color, null));
    }
  }

  // 4 wild and 4 wild draw 4
  for (let i = 0; i < 4; i++) {
    cards.push(createCard("wild", null, null));
    cards.push(createCard("wild_draw4", null, null));
  }

  return cards;
}

export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function initializeGame(playerNames: string[]): GameState {
  const deck = shuffleDeck(createDeck());
  const players: Player[] = playerNames.map((name, i) => ({
    id: i,
    name,
    hand: [],
  }));

  let drawIndex = 0;

  // Deal 7 cards to each player
  for (let round = 0; round < 7; round++) {
    for (const player of players) {
      player.hand.push(deck[drawIndex++]);
    }
  }

  // Find a non-wild, non-action card for the first discard
  let firstDiscardIndex = drawIndex;
  while (
    firstDiscardIndex < deck.length &&
    deck[firstDiscardIndex].type !== "number"
  ) {
    firstDiscardIndex++;
  }

  // Swap with current draw position if needed
  if (firstDiscardIndex !== drawIndex) {
    [deck[drawIndex], deck[firstDiscardIndex]] = [
      deck[firstDiscardIndex],
      deck[drawIndex],
    ];
  }

  const firstDiscard = deck[drawIndex++];

  return {
    players,
    drawPile: deck.slice(drawIndex),
    discardPile: [firstDiscard],
    currentPlayerIndex: 0,
    direction: 1,
    wildColor: null,
    winner: null,
    mustDraw: 0,
    status: "playing",
    lastAction: `Game started! ${firstDiscard.color} ${firstDiscard.value} on the pile.`,
  };
}

export function getTopCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function getEffectiveColor(state: GameState): Color {
  const top = getTopCard(state);
  if (top.color) return top.color;
  return state.wildColor ?? "red";
}

export function canPlayCard(card: Card, state: GameState): boolean {
  // If must draw, can only play draw2 on draw2 (stacking) or wild_draw4
  if (state.mustDraw > 0) {
    const top = getTopCard(state);
    if (top.type === "draw2" && card.type === "draw2") return true;
    if (top.type === "wild_draw4" && card.type === "wild_draw4") return true;
    return false;
  }

  // Wild cards can always be played
  if (card.type === "wild" || card.type === "wild_draw4") return true;

  const effectiveColor = getEffectiveColor(state);

  // Match by color
  if (card.color === effectiveColor) return true;

  const top = getTopCard(state);

  // Match by number
  if (
    card.type === "number" &&
    top.type === "number" &&
    card.value === top.value
  )
    return true;

  // Match by type (action cards)
  if (card.type !== "number" && card.type === top.type) return true;

  return false;
}

function nextPlayer(state: GameState): number {
  const count = state.players.length;
  return (
    (((state.currentPlayerIndex + state.direction) % count) + count) % count
  );
}

function recycleDiscardPile(state: GameState): void {
  if (state.drawPile.length === 0 && state.discardPile.length > 1) {
    const topCard = state.discardPile.pop()!;
    state.drawPile = shuffleDeck(state.discardPile);
    state.discardPile = [topCard];
  }
}

export function drawCards(state: GameState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    recycleDiscardPile(state);
    if (state.drawPile.length > 0) {
      drawn.push(state.drawPile.pop()!);
    }
  }
  return drawn;
}

export function playCard(
  state: GameState,
  cardId: string,
  chosenColor?: Color,
): GameState {
  const newState = structuredClone(state);
  const player = newState.players[newState.currentPlayerIndex];
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);

  if (cardIndex === -1) return state;

  const card = player.hand[cardIndex];

  if (!canPlayCard(card, newState)) return state;

  // Remove card from hand
  player.hand.splice(cardIndex, 1);

  // Place on discard pile
  newState.discardPile.push(card);

  // Check for win
  if (player.hand.length === 0) {
    newState.winner = player.id;
    newState.status = "finished";
    newState.lastAction = `🎉 ${player.name} wins!`;
    return newState;
  }

  // Handle wild color choice
  if (card.type === "wild" || card.type === "wild_draw4") {
    if (chosenColor) {
      newState.wildColor = chosenColor;
    } else {
      newState.status = "choosing-color";
      newState.lastAction = `${player.name} played a ${card.type === "wild" ? "Wild" : "Wild Draw 4"}! Choose a color.`;
      return newState;
    }
  } else {
    newState.wildColor = null;
  }

  // Handle card effects
  return applyCardEffect(newState, card, player.name);
}

function applyCardEffect(
  state: GameState,
  card: Card,
  playerName: string,
): GameState {
  const colorName = card.color ?? state.wildColor ?? "";

  switch (card.type) {
    case "number":
      state.lastAction = `${playerName} played ${colorName} ${card.value}`;
      state.currentPlayerIndex = nextPlayer(state);
      break;

    case "skip": {
      const skipped = state.players[nextPlayer(state)];
      state.lastAction = `${playerName} played Skip! ${skipped.name} loses a turn.`;
      state.currentPlayerIndex = nextPlayer(state);
      state.currentPlayerIndex = nextPlayer(state);
      break;
    }

    case "reverse":
      state.direction = state.direction === 1 ? -1 : 1;
      state.lastAction = `${playerName} played Reverse!`;
      // In 2 player, reverse acts like skip
      if (state.players.length === 2) {
        // Don't advance — same player goes again conceptually, but let's skip opponent
        state.currentPlayerIndex = nextPlayer(state);
        state.currentPlayerIndex = nextPlayer(state);
      } else {
        state.currentPlayerIndex = nextPlayer(state);
      }
      break;

    case "draw2":
      state.mustDraw += 2;
      state.lastAction = `${playerName} played Draw 2! (+${state.mustDraw} cards pending)`;
      state.currentPlayerIndex = nextPlayer(state);
      break;

    case "wild":
      state.lastAction = `${playerName} played Wild! Color is now ${state.wildColor}.`;
      state.currentPlayerIndex = nextPlayer(state);
      break;

    case "wild_draw4":
      state.mustDraw += 4;
      state.lastAction = `${playerName} played Wild Draw 4! Color is now ${state.wildColor}. (+${state.mustDraw} cards pending)`;
      state.currentPlayerIndex = nextPlayer(state);
      break;
  }

  state.status = "playing";
  return state;
}

export function chooseWildColor(state: GameState, color: Color): GameState {
  if (state.status !== "choosing-color") return state;

  const newState = structuredClone(state);
  newState.wildColor = color;

  const player = newState.players[newState.currentPlayerIndex];
  const card = getTopCard(newState);

  return applyCardEffect(newState, card, player.name);
}

export function handleDraw(state: GameState): GameState {
  const newState = structuredClone(state);
  const player = newState.players[newState.currentPlayerIndex];

  if (newState.mustDraw > 0) {
    // Forced draw
    const cards = drawCards(newState, newState.mustDraw);
    player.hand.push(...cards);
    newState.lastAction = `${player.name} drew ${cards.length} cards.`;
    newState.mustDraw = 0;
    newState.currentPlayerIndex = nextPlayer(newState);
  } else {
    // Voluntary draw — draw 1 card
    const cards = drawCards(newState, 1);
    player.hand.push(...cards);
    newState.lastAction = `${player.name} drew a card.`;
    // After drawing, the turn passes
    newState.currentPlayerIndex = nextPlayer(newState);
  }

  return newState;
}

export function getPlayableCards(state: GameState): Card[] {
  const player = state.players[state.currentPlayerIndex];
  return player.hand.filter((card) => canPlayCard(card, state));
}

// ─── Client View for Multiplayer ───

export interface ClientGameView {
  myHand: Card[];
  playableCardIds: string[];
  opponentCardCount: number;
  opponentName: string;
  myName: string;
  topCard: Card;
  drawPileCount: number;
  isMyTurn: boolean;
  effectiveColor: Color;
  wildColor: WildColor;
  mustDraw: number;
  winner: string | null;
  lastAction: string;
  gameOver: boolean;
}

function sortHand(hand: Card[]): Card[] {
  const colorOrder: Record<string, number> = {
    red: 0,
    blue: 1,
    green: 2,
    yellow: 3,
  };
  return [...hand].sort((a, b) => {
    if (!a.color && b.color) return 1;
    if (a.color && !b.color) return -1;
    if (!a.color && !b.color) return 0;
    const cd = colorOrder[a.color!] - colorOrder[b.color!];
    if (cd !== 0) return cd;
    const typeOrder: Record<string, number> = {
      number: 0,
      skip: 1,
      reverse: 2,
      draw2: 3,
    };
    const td = (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4);
    if (td !== 0) return td;
    return (a.value ?? 0) - (b.value ?? 0);
  });
}

export function createClientView(
  state: GameState,
  playerIndex: number,
): ClientGameView {
  const me = state.players[playerIndex];
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponent = state.players[opponentIndex];
  const topCard = getTopCard(state);
  const isMyTurn = state.currentPlayerIndex === playerIndex;
  const playableCardIds =
    isMyTurn && state.status === "playing"
      ? me.hand.filter((c) => canPlayCard(c, state)).map((c) => c.id)
      : [];

  return {
    myHand: sortHand(me.hand),
    playableCardIds,
    opponentCardCount: opponent.hand.length,
    opponentName: opponent.name,
    myName: me.name,
    topCard,
    drawPileCount: state.drawPile.length,
    isMyTurn,
    effectiveColor: getEffectiveColor(state),
    wildColor: state.wildColor,
    mustDraw: state.mustDraw,
    winner: state.winner !== null ? state.players[state.winner].name : null,
    lastAction: state.lastAction,
    gameOver: state.status === "finished",
  };
}

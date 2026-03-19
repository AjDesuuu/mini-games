"use client";

import { Card, Color } from "@/lib/uno-engine";

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-500 border-red-400 text-white",
  blue: "bg-blue-500 border-blue-400 text-white",
  green: "bg-green-500 border-green-400 text-white",
  yellow: "bg-yellow-400 border-yellow-300 text-gray-900",
};

const WILD_STYLE =
  "bg-gradient-to-br from-red-500 via-blue-500 to-green-500 border-purple-400 text-white";

function getCardLabel(card: Card): { top: string; center: string } {
  switch (card.type) {
    case "number":
      return { top: String(card.value), center: String(card.value) };
    case "skip":
      return { top: "⊘", center: "SKIP" };
    case "reverse":
      return { top: "⟲", center: "REV" };
    case "draw2":
      return { top: "+2", center: "+2" };
    case "wild":
      return { top: "W", center: "WILD" };
    case "wild_draw4":
      return { top: "+4", center: "+4" };
  }
}

interface UnoCardProps {
  card: Card;
  playable?: boolean;
  faceDown?: boolean;
  small?: boolean;
  wildColor?: Color | null;
  onClick?: () => void;
}

export default function UnoCard({
  card,
  playable,
  faceDown,
  small,
  wildColor,
  onClick,
}: UnoCardProps) {
  if (faceDown) {
    return (
      <div
        className={`
          ${small ? "w-10 h-14 text-xs" : "w-16 h-24 text-sm"}
          rounded-lg border-2 border-gray-500 bg-gray-700
          flex items-center justify-center font-bold
          select-none
          bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.05)_3px,rgba(255,255,255,0.05)_6px)]
        `}
      >
        <span className={small ? "text-xs" : "text-lg"}>🂠</span>
      </div>
    );
  }

  const label = getCardLabel(card);

  // For wild cards on the discard pile, show the chosen color
  const displayColor = card.color ?? (wildColor || null);
  const colorStyle = displayColor ? COLOR_MAP[displayColor] : WILD_STYLE;

  return (
    <button
      onClick={playable ? onClick : undefined}
      disabled={!playable}
      className={`
        ${small ? "w-10 h-14" : "w-16 h-24"}
        rounded-lg border-2 font-bold
        flex flex-col items-center justify-between
        ${small ? "p-0.5" : "p-1.5"}
        select-none transition-all duration-150
        ${colorStyle}
        ${
          playable
            ? "cursor-pointer hover:scale-110 hover:-translate-y-2 hover:shadow-lg hover:shadow-white/20 ring-2 ring-white/50 animate-pulse-glow"
            : onClick
              ? "cursor-pointer opacity-80 hover:scale-105"
              : "cursor-default opacity-70"
        }
      `}
      title={playable ? "Click to play" : ""}
    >
      <span className={`self-start ${small ? "text-[8px]" : "text-xs"}`}>
        {label.top}
      </span>
      <span className={`font-extrabold ${small ? "text-[10px]" : "text-lg"}`}>
        {label.center}
      </span>
      <span
        className={`self-end rotate-180 ${small ? "text-[8px]" : "text-xs"}`}
      >
        {label.top}
      </span>
    </button>
  );
}

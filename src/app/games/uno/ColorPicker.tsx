"use client";

import { Color } from "@/lib/uno-engine";

const COLORS: { color: Color; label: string; bg: string }[] = [
  { color: "red", label: "Red", bg: "bg-red-500 hover:bg-red-400" },
  { color: "blue", label: "Blue", bg: "bg-blue-500 hover:bg-blue-400" },
  { color: "green", label: "Green", bg: "bg-green-500 hover:bg-green-400" },
  {
    color: "yellow",
    label: "Yellow",
    bg: "bg-yellow-400 hover:bg-yellow-300 text-gray-900",
  },
];

interface ColorPickerProps {
  onSelect: (color: Color) => void;
}

export default function ColorPicker({ onSelect }: ColorPickerProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-slide-up">
      <div className="bg-gray-800 rounded-2xl p-6 border border-gray-600 shadow-2xl">
        <h3 className="text-lg font-bold text-center mb-4">Choose a color</h3>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map(({ color, label, bg }) => (
            <button
              key={color}
              onClick={() => onSelect(color)}
              className={`${bg} text-white font-bold py-4 px-8 rounded-xl transition-all hover:scale-105`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

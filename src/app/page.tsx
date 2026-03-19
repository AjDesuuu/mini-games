import Link from "next/link";

const games = [
  {
    id: "uno",
    name: "UNO",
    description:
      "Classic card game for 2 players. Match colors and numbers, be the first to empty your hand!",
    emoji: "🃏",
    players: "2 Players",
    color: "from-red-500 to-yellow-500",
  },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Minigame Arcade
        </h1>
        <p className="text-gray-400 text-lg">
          Pick a game and play with friends!
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/games/${game.id}`}
            className="group block rounded-2xl border border-gray-700 bg-gray-800/50 p-6 hover:border-purple-500 hover:bg-gray-800 transition-all duration-200 hover:scale-[1.02]"
          >
            <div
              className={`text-5xl mb-4 w-16 h-16 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center`}
            >
              {game.emoji}
            </div>
            <h2 className="text-xl font-bold mb-1 group-hover:text-purple-400 transition-colors">
              {game.name}
            </h2>
            <p className="text-sm text-gray-400 mb-3">{game.description}</p>
            <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-300">
              {game.players}
            </span>
          </Link>
        ))}

        <div className="rounded-2xl border-2 border-dashed border-gray-700 p-6 flex flex-col items-center justify-center text-gray-500 min-h-[200px]">
          <span className="text-4xl mb-2">➕</span>
          <p className="text-sm">More games coming soon!</p>
        </div>
      </div>
    </div>
  );
}

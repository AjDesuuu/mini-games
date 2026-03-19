import { Metadata } from "next";
import MemoryGame from "./MemoryGame";

export const metadata: Metadata = {
  title: "Memory Match - Minigame App",
  description: "Flip cards and find matching pairs!",
};

export default function MemoryPage() {
  return <MemoryGame />;
}

import { Metadata } from "next";
import RPSGame from "./RPSGame";

export const metadata: Metadata = {
  title: "Rock Paper Scissors - Minigame App",
  description: "Best of 5 Rock Paper Scissors!",
};

export default function RPSPage() {
  return <RPSGame />;
}

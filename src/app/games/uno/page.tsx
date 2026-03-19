import { Metadata } from "next";
import UnoGame from "./UnoGame";

export const metadata: Metadata = {
  title: "UNO - Minigame App",
  description: "Play UNO with a friend!",
};

export default function UnoPage() {
  return <UnoGame />;
}

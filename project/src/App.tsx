import { useState } from "react";
import { Lobby } from "@/components/Lobby";
import { FlagMaker } from "@/components/FlagMaker";
import { CardStudio } from "@/components/CardStudio";
import { DeckBuilder } from "@/components/DeckBuilder";
import { PlaySelect } from "@/components/PlaySelect";
import { BattleArena } from "@/components/BattleArena";
import type { Deck, RuleSet } from "@/types";
import { DEFAULT_RULES } from "@/types";

type Screen = "lobby" | "flag" | "card" | "deck" | "play" | "battle";

function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [battleMode, setBattleMode] = useState<"bot" | "multiplayer">("bot");
  const [battleDeck, setBattleDeck] = useState<Deck | null>(null);
  const [battleRules, setBattleRules] = useState<RuleSet>(DEFAULT_RULES);

  if (screen === "battle" && battleDeck) {
    return (
      <BattleArena
        mode={battleMode}
        hostDeck={battleDeck}
        rules={battleRules}
        onExit={() => {
          setScreen("lobby");
          setBattleDeck(null);
        }}
      />
    );
  }

  if (screen === "play") {
    return (
      <PlaySelect
        onExit={() => setScreen("lobby")}
        onPlay={(mode, deck, rules) => {
          setBattleRules(rules);
          setBattleMode(mode);
          setBattleDeck(deck);
          setScreen("battle");
        }}
      />
    );
  }

  if (screen === "flag") return <FlagMaker onBack={() => setScreen("lobby")} />;
  if (screen === "card") return <CardStudio onBack={() => setScreen("lobby")} />;
  if (screen === "deck") return <DeckBuilder onBack={() => setScreen("lobby")} />;

  return (
    <Lobby
      onFlagMaker={() => setScreen("flag")}
      onCardStudio={() => setScreen("card")}
      onDeckBuilder={() => setScreen("deck")}
      onPlay={() => setScreen("play")}
    />
  );
}

export default App;

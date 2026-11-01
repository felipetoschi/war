import { describe, expect, it } from "vitest";
import { applyBotAction, botToAct, chooseBotAction, newBotMemory } from "./bot";
import { BRASIL_MAP } from "./brasil";
import { createGame, placeArmies } from "./rules";
import type { GameState, Player, Rng } from "./types";

const map = BRASIL_MAP;

/** Gerador pseudoaleatório com semente, para partidas reproduzíveis. */
function seeded(seed: number): Rng {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bots = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    color: "#000",
    bot: true,
  }));

/** Joga uma partida inteira só com bots e devolve o estado final. */
function playOut(players: Player[], seed: number, maxActions = 30000) {
  const rng = seeded(seed);
  let state: GameState = createGame(map, players, rng);
  const memory = newBotMemory();
  let actions = 0;
  for (; actions < maxActions && state.phase !== "finished"; actions++) {
    const actor = botToAct(state);
    if (!actor) throw new Error(`Nenhum bot para agir na fase ${state.phase}`);
    state = applyBotAction(state, map, chooseBotAction(state, map, actor, memory), rng);
  }
  return { state, actions };
}

describe("bots", () => {
  for (const n of [2, 3, 4]) {
    it(`partidas só de bots com ${n} jogadores terminam sem erros`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const { state } = playOut(bots(n), seed * 97 + n);
        expect(state.phase, `semente ${seed}`).toBe("finished");
        expect(state.winner).not.toBeNull();
        expect(state.winReason).not.toBeNull();
        expect(state.round).toBeLessThan(200);
      }
    });
  }

  it("bot só age na sua vez; humano decide a própria jogada", () => {
    const players: Player[] = [
      { id: "h", name: "Humano", color: "#000" },
      { id: "b", name: "Bot", color: "#111", bot: true },
    ];
    const state = createGame(map, players);
    // na ordem, só o bot rola sozinho
    expect(botToAct(state)).toBe("b");
    const action = chooseBotAction(state, map, "b");
    expect(action).toEqual({ type: "roll-order", players: ["b"] });
  });

  it("na rodada inicial, o bot espera a vez dele para colocar", () => {
    const players: Player[] = [
      { id: "h", name: "Humano", color: "#000" },
      { id: "b", name: "Bot", color: "#111", bot: true },
    ];
    let state: GameState = {
      ...createGame(map, players),
      phase: "placement",
      placementLeft: { h: 3, b: 3 },
    };
    // o humano é o primeiro da ordem: o bot espera
    expect(botToAct(state)).toBeNull();
    const mine = Object.keys(state.territories).find((id) => state.territories[id]!.owner === "h")!;
    state = placeArmies(state, map, mine, 3);
    expect(state.currentPlayerIndex).toBe(1);
    for (let i = 0; i < 3; i++) {
      expect(botToAct(state)).toBe("b");
      state = applyBotAction(state, map, chooseBotAction(state, map, "b"));
    }
    // todos colocaram: começa a rodada 1 com o primeiro da ordem
    expect(state.phase).toBe("attack");
    expect(state.round).toBe(1);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it("bot defende sozinho quando um humano o ataca", () => {
    const players: Player[] = [
      { id: "h", name: "Humano", color: "#000" },
      { id: "b", name: "Bot", color: "#111", bot: true },
    ];
    const base = createGame(map, players);
    const territories: GameState["territories"] = {};
    for (const t of map.territories) territories[t.id] = { owner: "b", armies: 1 };
    territories.sp = { owner: "h", armies: 5 };
    const state: GameState = {
      ...base,
      territories,
      phase: "attack",
      round: 1,
      battle: {
        from: "sp",
        to: "mg",
        attacker: "h",
        defender: "b",
        soldiers: 3,
        defenseDice: 1,
        attackRolls: [6, 5, 4],
      },
    };
    expect(botToAct(state)).toBe("b");
    expect(chooseBotAction(state, map, "b")).toEqual({ type: "roll-defense" });
  });
});

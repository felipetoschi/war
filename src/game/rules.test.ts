import { describe, expect, it } from "vitest";
import { AURORA_MAP } from "./map";
import {
  attack,
  canAttack,
  createGame,
  endAttackPhase,
  endTurn,
  fortify,
  placeArmies,
  reinforcementsFor,
  territoriesOf,
} from "./rules";
import type { GameState, Player } from "./types";

const players: Player[] = [
  { id: "a", name: "Ana", color: "#c0392b" },
  { id: "b", name: "Beto", color: "#2471a3" },
];

/** RNG determinístico que repete a sequência informada. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Estado de teste: "b" tem tudo, exceto os territórios dados ao "a". */
function stateWith(owned: Record<string, number>, phase: GameState["phase"] = "attack"): GameState {
  const territories: GameState["territories"] = {};
  for (const t of AURORA_MAP.territories) {
    territories[t.id] =
      t.id in owned ? { owner: "a", armies: owned[t.id]! } : { owner: "b", armies: 1 };
  }
  return {
    players,
    territories,
    currentPlayerIndex: 0,
    phase,
    turn: 1,
    pendingReinforcements: 0,
    winner: null,
  };
}

describe("createGame", () => {
  it("distribui todos os territórios de forma equilibrada", () => {
    const game = createGame(AURORA_MAP, players, seq(0.3, 0.7, 0.1));
    expect(Object.keys(game.territories)).toHaveLength(AURORA_MAP.territories.length);
    expect(territoriesOf(game, "a")).toHaveLength(10);
    expect(territoriesOf(game, "b")).toHaveLength(10);
    expect(game.phase).toBe("reinforce");
    expect(game.pendingReinforcements).toBeGreaterThanOrEqual(3);
  });

  it("exige pelo menos 2 jogadores", () => {
    expect(() => createGame(AURORA_MAP, [players[0]!])).toThrow();
  });
});

describe("reinforcementsFor", () => {
  it("dá no mínimo 3 exércitos", () => {
    expect(reinforcementsFor(stateWith({ geleira: 1 }), AURORA_MAP, "a")).toBe(3);
  });

  it("soma o bônus de continente", () => {
    const boreal = { geleira: 1, fiorde: 1, taiga: 1, aurora: 1, planalto: 1 };
    expect(reinforcementsFor(stateWith(boreal), AURORA_MAP, "a")).toBe(3 + 4);
  });
});

describe("placeArmies", () => {
  it("passa para a fase de ataque ao terminar os reforços", () => {
    const state = { ...stateWith({ geleira: 1 }, "reinforce"), pendingReinforcements: 3 };
    const next = placeArmies(state, "geleira", 3);
    expect(next.territories.geleira!.armies).toBe(4);
    expect(next.phase).toBe("attack");
  });

  it("não deixa posicionar em território inimigo", () => {
    const state = { ...stateWith({ geleira: 1 }, "reinforce"), pendingReinforcements: 3 };
    expect(() => placeArmies(state, "fiorde", 1)).toThrow();
  });
});

describe("attack", () => {
  it("só permite atacar vizinhos inimigos com mais de 1 exército", () => {
    const state = stateWith({ geleira: 3, oasis: 1 });
    expect(canAttack(state, AURORA_MAP, "geleira", "fiorde")).toBe(true);
    expect(canAttack(state, AURORA_MAP, "geleira", "salina")).toBe(false);
    expect(canAttack(state, AURORA_MAP, "oasis", "salina")).toBe(false);
  });

  it("conquista o território e move os exércitos atacantes", () => {
    // ataque com 2 dados (6, 6) contra 1 dado (1)
    const result = attack(
      stateWith({ geleira: 3 }),
      AURORA_MAP,
      "geleira",
      "fiorde",
      seq(0.99, 0.99, 0),
    );
    expect(result.conquered).toBe(true);
    expect(result.state.territories.fiorde).toEqual({ owner: "a", armies: 2 });
    expect(result.state.territories.geleira!.armies).toBe(1);
  });

  it("declara vencedor quem domina todos os territórios", () => {
    const all = Object.fromEntries(AURORA_MAP.territories.map((t) => [t.id, 1]));
    delete all.fiorde;
    all.geleira = 2;
    const result = attack(stateWith(all), AURORA_MAP, "geleira", "fiorde", seq(0.99, 0));
    expect(result.state.winner).toBe("a");
    expect(result.state.phase).toBe("finished");
  });
});

describe("fortify e endTurn", () => {
  it("move exércitos entre vizinhos próprios deixando ao menos 1", () => {
    const state = endAttackPhase(stateWith({ geleira: 4, taiga: 1 }));
    const next = fortify(state, AURORA_MAP, "geleira", "taiga", 3);
    expect(next.territories.taiga!.armies).toBe(4);
    expect(() => fortify(state, AURORA_MAP, "geleira", "taiga", 4)).toThrow();
  });

  it("passa a vez e calcula os reforços do próximo jogador", () => {
    const next = endTurn(stateWith({ geleira: 1 }), AURORA_MAP);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe("reinforce");
    // "b" tem 19 territórios + Verdejante, Árido e Coralina
    expect(next.pendingReinforcements).toBe(9 + 4 + 3 + 3);
  });
});

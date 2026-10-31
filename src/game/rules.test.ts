import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";
import { OBJECTIVES } from "./objectives";
import {
  attack,
  attackPenalty,
  canAttack,
  createGame,
  endAttackPhase,
  endTurn,
  fortify,
  navalPenalty,
  placeArmies,
  reinforcementsFor,
  territoriesOf,
} from "./rules";
import type { GameState, Objective, Player } from "./types";

const players: Player[] = [
  { id: "a", name: "Ana", color: "#c0392b" },
  { id: "b", name: "Beto", color: "#2471a3" },
];

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const objective = (id: string): Objective => OBJECTIVES.find((o) => o.id === id)!;

/** Estado de teste: "a" tem os estados informados, "b" tem o resto (1 exército cada). */
function stateWith(owned: Record<string, number>, phase: GameState["phase"] = "attack"): GameState {
  const territories: GameState["territories"] = {};
  for (const t of BRASIL_MAP.territories) {
    territories[t.id] =
      t.id in owned ? { owner: "a", armies: owned[t.id]! } : { owner: "b", armies: 1 };
  }
  return {
    players,
    objectives: { a: objective("18-estados"), b: objective("18-estados") },
    territories,
    currentPlayerIndex: 0,
    phase,
    turn: 1,
    pendingReinforcements: 0,
    winner: null,
  };
}

describe("createGame", () => {
  it("distribui os 27 estados e dá um objetivo diferente para cada jogador", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    const game = createGame(BRASIL_MAP, five, seq(0.3, 0.7, 0.1, 0.9, 0.5));
    expect(Object.keys(game.territories)).toHaveLength(27);
    for (const p of five) expect(territoriesOf(game, p.id).length).toBeGreaterThanOrEqual(5);
    const objectiveIds = Object.values(game.objectives).map((o) => o.id);
    expect(new Set(objectiveIds).size).toBe(5);
  });

  it("aceita de 2 a 5 jogadores", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    expect(() => createGame(BRASIL_MAP, many.slice(0, 1))).toThrow();
    expect(() => createGame(BRASIL_MAP, many)).toThrow();
  });
});

describe("reinforcementsFor", () => {
  it("dá no mínimo 3 exércitos", () => {
    expect(reinforcementsFor(stateWith({ ac: 1 }), BRASIL_MAP, "a")).toBe(3);
  });

  it("soma o bônus da região", () => {
    expect(reinforcementsFor(stateWith({ pr: 1, sc: 1, rs: 1 }), BRASIL_MAP, "a")).toBe(3 + 2);
  });
});

describe("ataque naval", () => {
  it("penalidade cresce com a distância no litoral", () => {
    expect(navalPenalty(2)).toBe(1);
    expect(navalPenalty(4)).toBe(1);
    expect(navalPenalty(5)).toBe(2);
    expect(navalPenalty(8)).toBe(2);
    expect(navalPenalty(9)).toBe(3);
  });

  it("calcula a rota: terra sem penalidade, mar com penalidade, interior sem rota", () => {
    expect(attackPenalty(BRASIL_MAP, "sp", "mg")).toBe(0);
    expect(attackPenalty(BRASIL_MAP, "rj", "pr")).toBe(1); // distância 2
    expect(attackPenalty(BRASIL_MAP, "rn", "rs")).toBe(3); // distância 11
    expect(attackPenalty(BRASIL_MAP, "rs", "rn")).toBe(3); // e vice-versa
    expect(attackPenalty(BRASIL_MAP, "ba", "rs")).toBe(2); // distância 6
    expect(attackPenalty(BRASIL_MAP, "sp", "go")).toBeNull(); // GO não tem litoral
    expect(attackPenalty(BRASIL_MAP, "mg", "rs")).toBeNull(); // MG não tem litoral
  });

  it("permite atacar pelo mar estados litorâneos sem fronteira", () => {
    const state = stateWith({ rn: 4 });
    expect(canAttack(state, BRASIL_MAP, "rn", "rs")).toBe(true);
    expect(canAttack(state, BRASIL_MAP, "rn", "go")).toBe(false);
  });

  it("aplica a penalidade nos dados de um ataque naval", () => {
    // RN -> RS (−3): ataque rola 6, 6, 6 → 3, 3, 3; defesa rola 3 → empate, defesa vence
    const result = attack(stateWith({ rn: 4 }), BRASIL_MAP, "rn", "rs", seq(0.99, 0.99, 0.99, 0.4));
    expect(result.naval).toBe(true);
    expect(result.battle.effectiveAttackRolls).toEqual([3, 3, 3]);
    expect(result.conquered).toBe(false);
    expect(result.state.territories.rn!.armies).toBe(3);
  });
});

describe("attack", () => {
  it("conquista o estado e move os exércitos atacantes", () => {
    const result = attack(stateWith({ sp: 3 }), BRASIL_MAP, "sp", "mg", seq(0.99, 0.99, 0));
    expect(result.conquered).toBe(true);
    expect(result.naval).toBe(false);
    expect(result.state.territories.mg).toEqual({ owner: "a", armies: 2 });
    expect(result.state.territories.sp!.armies).toBe(1);
  });
});

describe("objetivos e vitória", () => {
  it("vence ao completar o objetivo de região", () => {
    const state = stateWith({ pr: 1, sc: 3 });
    state.objectives.a = objective("norte-sul");
    for (const t of BRASIL_MAP.territories.filter((t) => t.region === "norte")) {
      state.territories[t.id] = { owner: "a", armies: 1 };
    }
    const result = attack(state, BRASIL_MAP, "sc", "rs", seq(0.99, 0.99, 0));
    expect(result.conquered).toBe(true);
    expect(result.state.winner).toBe("a");
    expect(result.state.phase).toBe("finished");
  });

  it("vence ao completar o objetivo de quantidade ao posicionar reforços", () => {
    const owned = Object.fromEntries(
      BRASIL_MAP.territories.slice(0, 14).map((t, i) => [t.id, i === 0 ? 1 : 2]),
    );
    const state = { ...stateWith(owned, "reinforce"), pendingReinforcements: 3 };
    state.objectives.a = objective("14-estados-2-exercitos");
    const first = BRASIL_MAP.territories[0]!.id;
    const next = placeArmies(state, BRASIL_MAP, first, 1);
    expect(next.winner).toBe("a");
  });

  it("não vence enquanto o objetivo está incompleto", () => {
    const state = { ...stateWith({ ac: 1 }, "reinforce"), pendingReinforcements: 3 };
    expect(placeArmies(state, BRASIL_MAP, "ac", 1).winner).toBeNull();
  });
});

describe("fortify e endTurn", () => {
  it("move exércitos entre vizinhos próprios deixando ao menos 1", () => {
    const state = endAttackPhase(stateWith({ sp: 4, pr: 1 }));
    const next = fortify(state, BRASIL_MAP, "sp", "pr", 3);
    expect(next.territories.pr!.armies).toBe(4);
    expect(() => fortify(state, BRASIL_MAP, "sp", "pr", 4)).toThrow();
  });

  it("passa a vez e calcula os reforços do próximo jogador", () => {
    const next = endTurn(stateWith({ ac: 1 }), BRASIL_MAP);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe("reinforce");
    // "b" tem 26 estados (13) + Nordeste, Centro-Oeste, Sudeste e Sul
    expect(next.pendingReinforcements).toBe(13 + 5 + 3 + 3 + 2);
  });

  it("não deixa posicionar em estado inimigo", () => {
    const state = { ...stateWith({ ac: 1 }, "reinforce"), pendingReinforcements: 3 };
    expect(() => placeArmies(state, BRASIL_MAP, "am", 1)).toThrow();
  });
});

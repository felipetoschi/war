import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";
import {
  attack,
  attackPenalty,
  canAttack,
  createGame,
  endAttackPhase,
  endTurn,
  fortify,
  moveAfterConquest,
  movableArmies,
  navalPenalty,
  placeArmies,
  playersToRollForOrder,
  rollForOrder,
  reinforcementsFor,
  territoriesOf,
} from "./rules";
import type { GameState, Player } from "./types";

const map = BRASIL_MAP;
const players: Player[] = [
  { id: "a", name: "Ana", color: "#c0392b" },
  { id: "b", name: "Beto", color: "#2471a3" },
];

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Estado em jogo: "a" tem os estados informados, "b" tem o resto (1 soldado cada). */
function stateWith(owned: Record<string, number>, phase: GameState["phase"] = "attack"): GameState {
  const territories: GameState["territories"] = {};
  for (const t of map.territories) {
    territories[t.id] =
      t.id in owned ? { owner: "a", armies: owned[t.id]! } : { owner: "b", armies: 1 };
  }
  return {
    ...createGame(map, players),
    territories,
    phase,
    round: 1,
  };
}

describe("createGame: sorteio dos estados", () => {
  it("sorteia os 27 estados entre os jogadores, 1 soldado em cada", () => {
    const game = createGame(map, players, seq(0.3, 0.7, 0.1, 0.9));
    expect(Object.keys(game.territories)).toHaveLength(27);
    expect(Object.values(game.territories).every((t) => t!.armies === 1)).toBe(true);
    const counts = players.map((p) => territoriesOf(game, p.id).length).sort();
    expect(counts).toEqual([13, 14]);
    expect(game.phase).toBe("order");
  });

  it("divide o mais igualmente possível com 5 jogadores", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    const game = createGame(map, five, seq(0.42, 0.13, 0.77));
    const counts = five.map((p) => territoriesOf(game, p.id).length).sort();
    expect(counts).toEqual([5, 5, 5, 6, 6]);
  });

  it("aceita de 2 a 5 jogadores", () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    expect(() => createGame(map, many.slice(0, 1))).toThrow();
    expect(() => createGame(map, many.slice(0, 5))).not.toThrow();
    expect(() => createGame(map, many)).toThrow();
  });
});

describe("dados para a ordem de jogada e rodada inicial", () => {
  /** rng que faz rollDie tirar exatamente `face` (1–6) */
  const face = (n: number) => () => (n - 1) / 6;

  it("quem tira mais começa; a rodada inicial começa por ele", () => {
    let game = createGame(map, players);
    expect(playersToRollForOrder(game)).toEqual(["a", "b"]);
    game = rollForOrder(game, map, "a", face(2));
    expect(() => rollForOrder(game, map, "a", face(6))).toThrow(); // já rolou
    game = rollForOrder(game, map, "b", face(5));
    expect(game.players.map((p) => p.id)).toEqual(["b", "a"]);
    expect(game.phase).toBe("placement");
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.pendingReinforcements).toBe(reinforcementsFor(game, map, "b"));
  });

  it("empatados rolam de novo", () => {
    let game = createGame(map, players);
    game = rollForOrder(game, map, "a", face(4));
    game = rollForOrder(game, map, "b", face(4));
    expect(game.phase).toBe("order");
    expect(playersToRollForOrder(game)).toEqual(["a", "b"]);
    game = rollForOrder(game, map, "a", face(6));
    game = rollForOrder(game, map, "b", face(1));
    expect(game.players.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("na rodada inicial todos posicionam e depois o primeiro começa o turno normal", () => {
    let game = createGame(map, players);
    game = rollForOrder(game, map, "a", face(6));
    game = rollForOrder(game, map, "b", face(1));
    const first = territoriesOf(game, "a")[0]!;
    game = placeArmies(game, map, first, game.pendingReinforcements);
    expect(game.phase).toBe("placement");
    expect(game.currentPlayerIndex).toBe(1);

    const second = territoriesOf(game, "b")[0]!;
    game = placeArmies(game, map, second, game.pendingReinforcements);
    expect(game.phase).toBe("reinforce");
    expect(game.round).toBe(1);
    expect(game.currentPlayerIndex).toBe(0);
  });
});

describe("reinforcementsFor", () => {
  it("dá no mínimo 3 soldados", () => {
    expect(reinforcementsFor(stateWith({ ac: 1 }), map, "a")).toBe(3);
  });

  it("soma o bônus da região", () => {
    expect(reinforcementsFor(stateWith({ pr: 1, sc: 1, rs: 1 }), map, "a")).toBe(3 + 2);
  });
});

describe("ataque naval", () => {
  it("penalidade cresce com a distância no litoral", () => {
    expect([2, 4, 5, 8, 9].map(navalPenalty)).toEqual([1, 1, 2, 2, 3]);
  });

  it("calcula a rota: terra sem penalidade, mar com penalidade, interior sem rota", () => {
    expect(attackPenalty(map, "sp", "mg")).toBe(0);
    expect(attackPenalty(map, "rj", "pr")).toBe(1);
    expect(attackPenalty(map, "rn", "rs")).toBe(3);
    expect(attackPenalty(map, "rs", "rn")).toBe(3);
    expect(attackPenalty(map, "sp", "go")).toBeNull();
  });

  it("aplica a penalidade nos dados de um ataque naval", () => {
    const result = attack(stateWith({ rn: 4 }), map, "rn", "rs", seq(0.99, 0.99, 0.99, 0.4));
    expect(result.naval).toBe(true);
    expect(result.battle.effectiveAttackRolls).toEqual([3, 3, 3]);
    expect(result.conquered).toBe(false);
  });
});

describe("ataque e conquista", () => {
  it("só permite atacar inimigos alcançáveis com mais de 1 soldado", () => {
    const state = stateWith({ sp: 3, go: 1 });
    expect(canAttack(state, map, "sp", "mg")).toBe(true);
    expect(canAttack(state, map, "sp", "am")).toBe(false);
    expect(canAttack(state, map, "go", "mg")).toBe(false);
  });

  it("ao conquistar, o jogador escolhe mover de 1 até o número de dados usados", () => {
    // SP com 5 soldados ataca com 3 dados (6, 6, 6) contra 1 (1)
    const result = attack(stateWith({ sp: 5 }), map, "sp", "mg", seq(0.99, 0.99, 0.99, 0));
    expect(result.conquered).toBe(true);
    expect(result.state.pendingMove).toEqual({ from: "sp", to: "mg", max: 3 });
    expect(canAttack(result.state, map, "sp", "rj")).toBe(false); // bloqueado até mover
    expect(() => moveAfterConquest(result.state, 4)).toThrow();

    const moved = moveAfterConquest(result.state, 2);
    expect(moved.territories.mg).toEqual({ owner: "a", armies: 2 });
    expect(moved.territories.sp!.armies).toBe(3);
    expect(moved.pendingMove).toBeNull();
  });

  it("o máximo a mover nunca deixa a origem vazia", () => {
    // SP com 2 soldados ataca com 1 dado
    const result = attack(stateWith({ sp: 2 }), map, "sp", "mg", seq(0.99, 0));
    expect(result.state.pendingMove!.max).toBe(1);
  });

  it("informa o jogador eliminado e declara vencedor o último vivo", () => {
    const owned = Object.fromEntries(map.territories.map((t) => [t.id, 1]));
    delete owned.mg;
    owned.sp = 3;
    const result = attack(stateWith(owned), map, "sp", "mg", seq(0.99, 0.99, 0));
    expect(result.eliminated).toBe("b");
    expect(result.state.winner).toBe("a");
    expect(result.state.phase).toBe("finished");
    expect(result.state.pendingMove).toBeNull();
  });
});

describe("remanejamento e troca de turno", () => {
  it("move soldados entre vizinhos deixando ao menos 1", () => {
    const state = endAttackPhase(stateWith({ sp: 4, pr: 1 }));
    const next = fortify(state, map, "sp", "pr", 3);
    expect(next.territories.pr!.armies).toBe(4);
    expect(() => fortify(state, map, "sp", "pr", 4)).toThrow();
  });

  it("soldado remanejado não se move de novo no mesmo turno", () => {
    let state = endAttackPhase(stateWith({ sp: 4, pr: 1, sc: 1 }));
    state = fortify(state, map, "sp", "pr", 3);
    expect(movableArmies(state, "pr")).toBe(0);
    expect(() => fortify(state, map, "pr", "sc", 1)).toThrow();
  });

  it("passa a vez e calcula os reforços do próximo jogador", () => {
    const next = endTurn(stateWith({ ac: 1 }), map);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.phase).toBe("reinforce");
    expect(next.round).toBe(1); // só muda quando volta ao primeiro jogador
    expect(endTurn({ ...next, phase: "attack" }, map).round).toBe(2);
    expect(next.fortified).toEqual({});
    // "b" tem 26 estados (13) + Nordeste, Centro-Oeste, Sudeste e Sul
    expect(next.pendingReinforcements).toBe(13 + 5 + 3 + 3 + 2);
  });

  it("não deixa posicionar em estado inimigo", () => {
    const state = { ...stateWith({ ac: 1 }, "reinforce"), pendingReinforcements: 3 };
    expect(() => placeArmies(state, map, "am", 1)).toThrow();
  });
});

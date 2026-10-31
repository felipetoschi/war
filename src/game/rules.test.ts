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
  INITIAL_ARMIES,
  maxAttackers,
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

  it("divide o mais igualmente possível com 4 jogadores", () => {
    const four = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    const game = createGame(map, four, seq(0.42, 0.13, 0.77));
    const counts = four.map((p) => territoriesOf(game, p.id).length).sort();
    expect(counts).toEqual([6, 7, 7, 7]);
  });

  it("aceita de 2 a 4 jogadores", () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    expect(() => createGame(map, many.slice(0, 1))).toThrow();
    expect(() => createGame(map, many.slice(0, 4))).not.toThrow();
    expect(() => createGame(map, many)).toThrow();
  });
});

describe("dados para a ordem de jogada e rodada inicial", () => {
  /** rng que faz rollDie tirar exatamente `face` (1–6) */
  const face = (n: number) => () => (n - 1) / 6;

  it("quem tira mais começa e coloca 3 soldados primeiro", () => {
    let game = createGame(map, players);
    expect(playersToRollForOrder(game)).toEqual(["a", "b"]);
    game = rollForOrder(game, map, "a", face(2));
    expect(() => rollForOrder(game, map, "a", face(6))).toThrow(); // já rolou
    game = rollForOrder(game, map, "b", face(5));
    expect(game.players.map((p) => p.id)).toEqual(["b", "a"]);
    expect(game.phase).toBe("placement");
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.pendingReinforcements).toBe(INITIAL_ARMIES);
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

  it("cada um coloca 3 soldados, em um ou mais estados; depois começam os ataques", () => {
    let game = createGame(map, players);
    game = rollForOrder(game, map, "a", face(6));
    game = rollForOrder(game, map, "b", face(1));
    const [a1, a2] = territoriesOf(game, "a");
    game = placeArmies(game, map, a1!, 2);
    game = placeArmies(game, map, a2!, 1);
    expect(game.territories[a1!]!.armies).toBe(3);
    expect(game.phase).toBe("placement");
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.pendingReinforcements).toBe(3);

    const b1 = territoriesOf(game, "b")[0]!;
    game = placeArmies(game, map, b1, 3);
    // rodada 1: sem reforço, direto para o ataque do primeiro jogador
    expect(game.round).toBe(1);
    expect(game.phase).toBe("attack");
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.pendingReinforcements).toBe(0);
  });
});

describe("reforço: 1 soldado a cada 2 estados", () => {
  it("conta 1 soldado a cada 2 estados", () => {
    expect(reinforcementsFor(stateWith({ ac: 1 }), map, "a")).toBe(0);
    expect(reinforcementsFor(stateWith({ ac: 1, am: 1, ro: 1 }), map, "a")).toBe(1);
    expect(reinforcementsFor(stateWith({ ac: 1, am: 1, ro: 1, rr: 1 }), map, "a")).toBe(2);
  });

  it("soma o bônus da região", () => {
    expect(reinforcementsFor(stateWith({ pr: 1, sc: 1, rs: 1 }), map, "a")).toBe(1 + 2);
  });

  it("começa na rodada 2: o reforço vem antes do ataque", () => {
    const owned = { ac: 1, am: 1, ro: 1, rr: 1 };
    const roundOneEnd = { ...stateWith(owned), currentPlayerIndex: 1 };
    const next = endTurn(roundOneEnd, map); // volta ao primeiro: rodada 2
    expect(next.round).toBe(2);
    expect(next.phase).toBe("reinforce");
    expect(next.pendingReinforcements).toBe(2);
  });

  it("na rodada 1 não há reforço", () => {
    const next = endTurn(stateWith({ ac: 1 }), map); // de "a" para "b", ainda rodada 1
    expect(next.round).toBe(1);
    expect(next.phase).toBe("attack");
    expect(next.pendingReinforcements).toBe(0);
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

  it("o jogador escolhe com quantos soldados ataca (até 3, deixando 1)", () => {
    expect(maxAttackers(stateWith({ sp: 2 }), "sp")).toBe(1);
    expect(maxAttackers(stateWith({ sp: 3 }), "sp")).toBe(2);
    expect(maxAttackers(stateWith({ sp: 9 }), "sp")).toBe(3);
    const state = stateWith({ sp: 9 });
    expect(() => attack(state, map, "sp", "mg", Math.random, 4)).toThrow();
    // ataca com 2: rola 2 dados
    const result = attack(state, map, "sp", "mg", seq(0.99, 0.99, 0), 2);
    expect(result.battle.attackRolls).toHaveLength(2);
  });

  it("ao conquistar, os soldados que atacaram e sobreviveram ocupam o estado", () => {
    // SP com 9 ataca com 2 (6, 6) contra 1 (1)
    const result = attack(stateWith({ sp: 9 }), map, "sp", "mg", seq(0.99, 0.99, 0), 2);
    expect(result.conquered).toBe(true);
    expect(result.state.territories.mg).toEqual({ owner: "a", armies: 2 });
    expect(result.state.territories.sp!.armies).toBe(7);
  });

  it("empate favorece a defesa", () => {
    // 1 soldado ataca (4) contra 1 defensor (4)
    const result = attack(stateWith({ sp: 2 }), map, "sp", "mg", seq(0.5, 0.5), 1);
    expect(result.battle.attackerLosses).toBe(1);
    expect(result.conquered).toBe(false);
  });

  it("informa o jogador eliminado e declara vencedor o último vivo", () => {
    const owned = Object.fromEntries(map.territories.map((t) => [t.id, 1]));
    delete owned.mg;
    owned.sp = 3;
    const result = attack(stateWith(owned), map, "sp", "mg", seq(0.99, 0.99, 0));
    expect(result.eliminated).toBe("b");
    expect(result.state.winner).toBe("a");
    expect(result.state.phase).toBe("finished");
  });
});

describe("remanejamento", () => {
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

  it("não deixa posicionar em estado inimigo", () => {
    const state = { ...stateWith({ ac: 1 }, "reinforce"), pendingReinforcements: 3 };
    expect(() => placeArmies(state, map, "am", 1)).toThrow();
  });
});

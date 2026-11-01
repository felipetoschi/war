import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";
import {
  attack,
  canAttack,
  cancelAttack,
  declareAttack,
  rollAttack,
  rollDefense,
  skipReinforce,
  tradeCards,
  createGame,
  endAttackPhase,
  endTurn,
  fortify,
  INITIAL_ARMIES,
  maxAttackers,
  movableArmies,
  movableTo,
  placeArmies,
  playersToRollForOrder,
  rollForOrder,
  reinforcementsFor,
  MIN_REINFORCEMENT,
  territoriesOf,
} from "./rules";
import { createDeck, isValidSet, tradeValue } from "./cards";
import type { Card, GameState, Player } from "./types";

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
    // sem objetivos por padrão, para os testes não terminarem a partida sem querer
    objectives: { a: [], b: [] },
    territories,
    phase,
    round: 1,
  };
}

describe("createGame: sorteio dos estados", () => {
  it("sorteia os 26 territórios entre os jogadores, 1 soldado em cada", () => {
    const game = createGame(map, players, seq(0.3, 0.7, 0.1, 0.9));
    expect(Object.keys(game.territories)).toHaveLength(26);
    expect(Object.values(game.territories).every((t) => t!.armies === 1)).toBe(true);
    const counts = players.map((p) => territoriesOf(game, p.id).length).sort();
    expect(counts).toEqual([13, 13]);
    expect(game.phase).toBe("order");
  });

  it("divide o mais igualmente possível com 4 jogadores", () => {
    const four = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));
    const game = createGame(map, four, seq(0.42, 0.13, 0.77));
    const counts = four.map((p) => territoriesOf(game, p.id).length).sort();
    expect(counts).toEqual([6, 6, 7, 7]);
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

describe("reforço: 1 soldado a cada 2 estados, no mínimo 3", () => {
  const owning = (ids: string[]) => stateWith(Object.fromEntries(ids.map((id) => [id, 1])));
  const north = ["ac", "am", "ro", "rr", "pa", "ap", "to"];
  const northeast = ["ma", "pi", "ce", "rn", "pb", "pe", "al", "se", "ba"];

  it("quem tem poucos estados recebe o mínimo de 3", () => {
    expect(reinforcementsFor(owning(["ac"]), map, "a")).toBe(MIN_REINFORCEMENT);
    expect(reinforcementsFor(owning(["ac", "am", "ro"]), map, "a")).toBe(3);
    expect(reinforcementsFor(owning(["ac", "am", "ro", "rr", "ma", "pi"]), map, "a")).toBe(3);
  });

  it("a partir de 8 estados, conta 1 soldado a cada 2 estados", () => {
    expect(reinforcementsFor(owning([...northeast.slice(0, 8)]), map, "a")).toBe(4);
    expect(reinforcementsFor(owning([...northeast.slice(0, 8), "sp", "rj"]), map, "a")).toBe(5);
  });

  it("soma o bônus da região ao reforço (mínimo incluso)", () => {
    expect(reinforcementsFor(owning(["pr", "sc", "rs"]), map, "a")).toBe(3 + 2);
    expect(reinforcementsFor(owning(north), map, "a")).toBe(3 + 5);
  });

  it("começa na rodada 2: o reforço vem antes do ataque", () => {
    const owned = { ac: 1, am: 1, ro: 1, rr: 1 };
    const roundOneEnd = { ...stateWith(owned), currentPlayerIndex: 1 };
    const next = endTurn(roundOneEnd, map); // volta ao primeiro: rodada 2
    expect(next.round).toBe(2);
    expect(next.phase).toBe("reinforce");
    expect(next.pendingReinforcements).toBe(3); // 4 estados dariam 2: vale o mínimo
  });

  it("na rodada 1 não há reforço", () => {
    const next = endTurn(stateWith({ ac: 1 }), map); // de "a" para "b", ainda rodada 1
    expect(next.round).toBe(1);
    expect(next.phase).toBe("attack");
    expect(next.pendingReinforcements).toBe(0);
  });
});

describe("só ataca quem faz divisa", () => {
  it("não existe mais ataque pelo mar entre estados sem divisa", () => {
    const state = stateWith({ rn: 4, rj: 4 });
    expect(canAttack(state, map, "rn", "ce")).toBe(true); // vizinhos
    expect(canAttack(state, map, "rn", "rs")).toBe(false); // litoral, mas sem divisa
    expect(canAttack(state, map, "rj", "pr")).toBe(false);
  });
});

describe("dados manuais: atacante rola, depois defensor", () => {
  it("declara, rola o ataque e depois a defesa", () => {
    let state = declareAttack(stateWith({ sp: 5 }), map, "sp", "mg", 2);
    expect(state.battle).toMatchObject({ soldiers: 2, defenseDice: 1, attackRolls: null });
    expect(() => rollDefense(state, map)).toThrow(); // defensor não rola antes do atacante
    expect(() => endAttackPhase(state)).toThrow(); // ataque em andamento
    state = rollAttack(state, seq(0.99, 0.99));
    expect(state.battle!.attackRolls).toEqual([6, 6]);
    expect(() => cancelAttack(state)).toThrow(); // depois de rolar, não dá para desistir
    const result = rollDefense(state, map, seq(0));
    expect(result.battle.defenseRolls).toEqual([1]);
    expect(result.conquered).toBe(true);
    expect(result.state.battle).toBeNull();
  });

  it("dá para desistir antes de rolar o ataque", () => {
    const state = declareAttack(stateWith({ sp: 5 }), map, "sp", "mg", 3);
    expect(cancelAttack(state).battle).toBeNull();
  });
});

describe("cartas de troca", () => {
  const card = (id: string, symbol: Card["symbol"], territory: string | null = id): Card => ({
    id,
    territory,
    symbol,
  });

  it("baralho tem 1 carta por território (símbolos alternados) e 2 coringas", () => {
    const deck = createDeck(map);
    expect(deck).toHaveLength(28);
    const count = (sym: Card["symbol"]) => deck.filter((c) => c.symbol === sym).length;
    expect([count("square"), count("triangle"), count("circle")]).toEqual([9, 9, 8]);
    expect(deck.filter((c) => c.symbol === "joker")).toHaveLength(2);
  });

  it("troca válida: 3 iguais, 3 diferentes, ou com coringa", () => {
    expect(isValidSet([card("a", "square"), card("b", "square"), card("c", "square")])).toBe(true);
    expect(isValidSet([card("a", "square"), card("b", "triangle"), card("c", "circle")])).toBe(
      true,
    );
    expect(isValidSet([card("a", "square"), card("b", "square"), card("c", "circle")])).toBe(false);
    expect(isValidSet([card("a", "square"), card("b", "square"), card("j", "joker", null)])).toBe(
      true,
    );
  });

  it("valor da troca cresce: 4, 6, 8, 10, 12, 15, 20…", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tradeValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25]);
  });

  it("no máximo uma carta por turno, no fim do turno, para quem conquistou", () => {
    // conquista MG e depois RJ no mesmo turno
    let result = attack(stateWith({ sp: 9 }), map, "sp", "mg", seq(0.99, 0.99, 0.99, 0), 3);
    expect(result.conquered).toBe(true);
    expect(result.state.hands.a).toHaveLength(0); // a carta vem no fim do turno
    result = attack(result.state, map, "sp", "rj", seq(0.99, 0.99, 0.99, 0), 3);
    expect(result.conquered).toBe(true);
    const next = endTurn(result.state, map);
    expect(next.hands.a).toHaveLength(1);
    expect(next.deck).toHaveLength(27);
    expect(next.conqueredThisTurn).toBe(false);
  });

  it("sem conquista no turno, não ganha carta", () => {
    const next = endTurn(stateWith({ sp: 9 }), map);
    expect(next.hands.a).toHaveLength(0);
  });

  it("troca dá soldados e +2 em cada estado das cartas que o jogador domina", () => {
    const state: GameState = {
      ...stateWith({ sp: 1, mg: 1 }, "reinforce"),
      pendingReinforcements: 0,
      hands: {
        a: [card("sp", "square"), card("ba", "triangle"), card("mg", "circle")],
        b: [],
      },
    };
    const { state: next, armies, bonusTerritories } = tradeCards(state, map, ["sp", "ba", "mg"]);
    expect(armies).toBe(4);
    expect(next.pendingReinforcements).toBe(4);
    expect(bonusTerritories.sort()).toEqual(["mg", "sp"]);
    expect(next.territories.sp!.armies).toBe(3);
    expect(next.territories.ba!.armies).toBe(1); // BA é do outro jogador: sem bônus
    expect(next.hands.a).toHaveLength(0);
    expect(next.discard).toHaveLength(3);
    expect(next.trades).toBe(1);
  });

  it("recusa trocas inválidas", () => {
    const state: GameState = {
      ...stateWith({ sp: 1 }, "reinforce"),
      hands: { a: [card("sp", "square"), card("ba", "square"), card("mg", "circle")], b: [] },
    };
    expect(() => tradeCards(state, map, ["sp", "ba", "mg"])).toThrow();
  });

  it("com 5 cartas ou mais, é obrigatório trocar antes de posicionar", () => {
    const hand = ["sp", "ba", "mg", "rj", "es"].map((id) => card(id, "square"));
    const state: GameState = {
      ...stateWith({ sp: 1 }, "reinforce"),
      pendingReinforcements: 3,
      hands: { a: hand, b: [] },
    };
    expect(() => placeArmies(state, map, "sp", 1)).toThrow();
    const traded = tradeCards(state, map, ["sp", "ba", "mg"]).state;
    expect(() => placeArmies(traded, map, "sp", 1)).not.toThrow();
  });

  it("com uma troca possível, pode trocar antes; ou posicionar e seguir sem trocar", () => {
    const hand = [card("sp", "square"), card("ba", "square"), card("mg", "square")];
    const roundOneEnd: GameState = {
      ...stateWith({ ac: 1 }),
      currentPlayerIndex: 1,
      hands: { a: hand, b: [] },
    };
    const next = endTurn(roundOneEnd, map); // rodada 2, "a" com 1 estado: o mínimo de 3
    expect(next.phase).toBe("reinforce");
    expect(next.pendingReinforcements).toBe(MIN_REINFORCEMENT);
    expect(() => skipReinforce(next)).toThrow(); // precisa posicionar antes
    expect(tradeCards(next, map, ["sp", "ba", "mg"]).state.pendingReinforcements).toBe(
      MIN_REINFORCEMENT + 4,
    );
    const placed = placeArmies(next, map, "ac", MIN_REINFORCEMENT);
    expect(placed.phase).toBe("attack");
    expect(placed.hands.a).toHaveLength(3); // não trocou: fica com as cartas
  });

  it("quem elimina um jogador fica com as cartas dele", () => {
    const owned = Object.fromEntries(map.territories.map((t) => [t.id, 1]));
    delete owned.mg;
    owned.sp = 3;
    const state: GameState = {
      ...stateWith(owned),
      hands: { a: [], b: [card("ba", "circle"), card("rj", "square")] },
    };
    const result = attack(state, map, "sp", "mg", seq(0.99, 0.99, 0));
    expect(result.eliminated).toBe("b");
    expect(result.state.hands.a).toHaveLength(2); // as 2 cartas do eliminado
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

  it("no máximo 3 soldados para cada vizinho, sem deixar estado vazio", () => {
    let state = endAttackPhase(stateWith({ sp: 9, mg: 1, rj: 1, pr: 1 }));
    state = fortify(state, map, "sp", "mg", 3);
    expect(() => fortify(state, map, "sp", "mg", 1)).toThrow(); // já foram 3 para MG
    state = fortify(state, map, "sp", "rj", 3);
    state = fortify(state, map, "sp", "pr", 2);
    expect(state.territories.sp!.armies).toBe(1);
    expect(() => fortify(state, map, "sp", "pr", 1)).toThrow(); // sobraria 0
    expect(movableTo(state, "sp", "pr")).toBe(0);
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

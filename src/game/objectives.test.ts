import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";
import {
  completedObjective,
  connected,
  MIN_MISSING_AT_DEAL,
  objectiveById,
  OBJECTIVES,
  territoriesToConnect,
} from "./objectives";
import { attack, createGame, placeArmies } from "./rules";
import type { GameState, Player } from "./types";

const map = BRASIL_MAP;
const two: Player[] = [
  { id: "a", name: "Ana", color: "#c0392b" },
  { id: "b", name: "Beto", color: "#2471a3" },
];
const four: Player[] = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `P${n}`, color: "#000" }));

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** "a" tem os estados informados (com os soldados dados), "b" tem o resto. */
function stateWith(owned: Record<string, number>, objectives: string[] = []): GameState {
  const territories: GameState["territories"] = {};
  for (const t of map.territories) {
    territories[t.id] =
      t.id in owned ? { owner: "a", armies: owned[t.id]! } : { owner: "b", armies: 1 };
  }
  return {
    ...createGame(map, two),
    objectives: { a: objectives, b: [] },
    territories,
    phase: "attack",
    round: 1,
  };
}

const progress = (state: GameState, id: string, player = "a") =>
  objectiveById(id).progress(state, map, player);

describe("sorteio dos objetivos", () => {
  it("cada jogador recebe 1 flexível e 1 focado, sem repetir entre jogadores", () => {
    const game = createGame(map, four, seq(0.13, 0.57, 0.91, 0.32, 0.74));
    const all = Object.values(game.objectives).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    for (const ids of Object.values(game.objectives)) {
      expect(ids.map((id) => objectiveById(id).group)).toEqual(["flex", "focus"]);
    }
  });

  it("ninguém começa com objetivo cumprido ou muito adiantado (faltam 3+ conquistas)", () => {
    for (const players of [two, four, four.slice(0, 3)]) {
      for (let i = 0; i < 40; i++) {
        const game = createGame(map, players);
        for (const p of players) {
          expect(completedObjective(game, map, p.id)).toBeNull();
          for (const id of game.objectives[p.id]!) {
            const { missing } = objectiveById(id).progress(game, map, p.id);
            expect(missing, `${id} para ${p.id}`).toBeGreaterThanOrEqual(MIN_MISSING_AT_DEAL);
          }
        }
      }
    }
  });

  it("conta quantos territórios faltam conquistar para ligar um caminho", () => {
    // AP → PA → MT → MS → PR → SC → RS: tem tudo menos MS e SC
    const state = stateWith({ ap: 1, pa: 1, mt: 1, pr: 1, rs: 1 });
    expect(territoriesToConnect(state, map, "a", "ap", ["rs"])).toBe(2);
    expect(progress(state, "oiapoque-chui").missing).toBe(2);
    expect(progress(stateWith({ sp: 1, rj: 1, mg: 1 }), "eixo-do-poder").missing).toBe(1);
  });

  it("caçada só entra com 3 ou mais jogadores; o alvo é o próximo da roda", () => {
    for (let i = 0; i < 20; i++) {
      const game = createGame(map, two);
      expect(Object.values(game.objectives).flat()).not.toContain("cacada");
    }
    const game = createGame(map, four);
    expect(game.huntTargets).toEqual({ p1: "p2", p2: "p3", p3: "p4", p4: "p1" });
    expect(OBJECTIVES.find((o) => o.id === "cacada")!.minPlayers).toBe(3);
  });
});

describe("caminhos", () => {
  // AP → PA → MT → MS → PR → SC → RS
  const path = { ap: 1, pa: 1, mt: 1, ms: 1, pr: 1, sc: 1, rs: 1 };

  it("do Oiapoque ao Chuí: precisa de um caminho contínuo de AP a RS", () => {
    expect(progress(stateWith(path), "oiapoque-chui").done).toBe(true);
    const broken = { ...path };
    delete (broken as Record<string, number>).ms;
    expect(progress(stateWith(broken), "oiapoque-chui")).toEqual({
      done: false,
      text: "AP ✓ · RS ✓",
      missing: 1,
    });
  });

  it("do Acre ao mar: liga o Acre a um estado do litoral do Nordeste", () => {
    const state = stateWith({ ac: 1, am: 1, pa: 1, ma: 1 });
    expect(connected(state, map, "a", "ac", ["ma"])).toBe(true);
    expect(progress(state, "litoral-a-litoral").done).toBe(true);
  });
});

describe("contagens e regiões", () => {
  it("Senhor da costa: 10 dos 17 estados do litoral", () => {
    const coast = map.territories.filter((t) => t.coastIndex !== undefined).map((t) => t.id);
    const nine = Object.fromEntries(coast.slice(0, 9).map((id) => [id, 1]));
    expect(progress(stateWith(nine), "senhor-da-costa")).toEqual({
      done: false,
      text: "9/10",
      missing: 1,
    });
    const ten = Object.fromEntries(coast.slice(0, 10).map((id) => [id, 1]));
    expect(progress(stateWith(ten), "senhor-da-costa").done).toBe(true);
  });

  it("Fortaleza: 12 territórios com 2 ou mais soldados", () => {
    const ids = map.territories.slice(0, 12).map((t) => t.id);
    const weak = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 1 : 2]));
    expect(progress(stateWith(weak), "fortaleza").done).toBe(false);
    const strong = Object.fromEntries(ids.map((id) => [id, 2]));
    expect(progress(stateWith(strong), "fortaleza").done).toBe(true);
  });

  it("Sudeste e Sul + 3: as duas regiões inteiras e mais 3 territórios", () => {
    const regions = { es: 1, mg: 1, rj: 1, sp: 1, pr: 1, sc: 1, rs: 1 };
    expect(progress(stateWith(regions), "sudeste-sul")).toEqual({
      done: false,
      text: "7/7 · mais 0/3",
      missing: 3,
    });
    const plus = { ...regions, ba: 1, go: 1, ms: 1 };
    expect(progress(stateWith(plus), "sudeste-sul").done).toBe(true);
  });

  it("Eixo do poder: SP, RJ, MG e Goiás/DF", () => {
    expect(progress(stateWith({ sp: 1, rj: 1, mg: 1 }), "eixo-do-poder").text).toBe("3/4");
    expect(progress(stateWith({ sp: 1, rj: 1, mg: 1, go: 1 }), "eixo-do-poder").done).toBe(true);
  });
});

describe("vitória por objetivo", () => {
  it("vence ao cumprir um objetivo com uma conquista, na própria vez", () => {
    // tem SP, RJ e GO; conquista MG → Eixo do poder
    const state = stateWith({ sp: 5, rj: 1, go: 1 }, ["ocupacao", "eixo-do-poder"]);
    const result = attack(state, map, "sp", "mg", seq(0.99, 0.99, 0.99, 0), 3);
    expect(result.state.winner).toBe("a");
    expect(result.state.winReason).toBe("eixo-do-poder");
    expect(result.state.phase).toBe("finished");
  });

  it("vence ao cumprir um objetivo posicionando soldados", () => {
    const ids = map.territories.slice(0, 12).map((t) => t.id);
    const owned = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 1 : 2]));
    const state = {
      ...stateWith(owned, ["fortaleza", "eixo-do-poder"]),
      phase: "reinforce" as const,
      pendingReinforcements: 2,
    };
    const next = placeArmies(state, map, ids[0]!, 1);
    expect(next.winner).toBe("a");
    expect(next.winReason).toBe("fortaleza");
  });

  it("caçada: se outro jogador elimina o alvo, vale ter 16 territórios", () => {
    const base = createGame(map, four);
    const state: GameState = {
      ...base,
      huntTargets: { p1: "p2" },
      eliminatedBy: { p2: "p3" },
    };
    expect(objectiveById("cacada").progress(state, map, "p1").text).toMatch(/^alvo caiu/);
    const mine: GameState = { ...state, eliminatedBy: { p2: "p1" } };
    expect(objectiveById("cacada").progress(mine, map, "p1").done).toBe(true);
  });
});

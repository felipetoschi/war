import { describe, expect, it } from "vitest";
import { BRASIL_MAP } from "./brasil";
import {
  allObjectives,
  completedObjective,
  MIN_MISSING_AT_DEAL,
  objectiveById,
  REGION_GOALS,
  TERRITORY_GOAL,
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
  objectiveById(map, id).progress(state, map, player);

describe("objetivos simples", () => {
  it("são só regiões inteiras e ter 18 territórios, com títulos claros", () => {
    expect(allObjectives(map).map((o) => o.title)).toEqual([
      "Conquistar o Norte e o Sul",
      "Conquistar o Norte e o Centro-Oeste",
      "Conquistar o Norte e o Sudeste",
      "Conquistar o Nordeste e o Sul",
      "Conquistar o Nordeste e o Centro-Oeste",
      "Conquistar o Nordeste e o Sudeste",
      "Conquistar o Sudeste, o Sul e o Centro-Oeste",
      `Ter ${TERRITORY_GOAL} territórios`,
    ]);
  });

  it("cada objetivo de região pede entre 10 e 13 territórios", () => {
    for (const regions of REGION_GOALS) {
      const size = map.territories.filter((t) => regions.includes(t.region)).length;
      expect(size).toBeGreaterThanOrEqual(10);
      expect(size).toBeLessThanOrEqual(13);
    }
  });

  it("mostra o progresso de região e de territórios", () => {
    const sul = { pr: 1, sc: 1, rs: 1 };
    expect(progress(stateWith(sul), "norte+sul")).toEqual({
      done: false,
      text: "3/10",
      missing: 7,
    });
    expect(progress(stateWith(sul), "territorios")).toEqual({
      done: false,
      text: `3/${TERRITORY_GOAL}`,
      missing: TERRITORY_GOAL - 3,
    });
  });
});

describe("sorteio dos objetivos", () => {
  it("cada jogador recebe 1 objetivo de região (sem repetir) + ter 18 territórios", () => {
    const game = createGame(map, four);
    const regions = four.map((p) => game.objectives[p.id]![0]!);
    expect(new Set(regions).size).toBe(4);
    for (const p of four) {
      expect(game.objectives[p.id]).toHaveLength(2);
      expect(objectiveById(map, game.objectives[p.id]![0]!).group).toBe("region");
      expect(game.objectives[p.id]![1]).toBe("territorios");
    }
  });

  it("ninguém começa com objetivo cumprido ou muito adiantado (faltam 3+ conquistas)", () => {
    for (const players of [two, four, four.slice(0, 3)]) {
      for (let i = 0; i < 40; i++) {
        const game = createGame(map, players);
        for (const p of players) {
          expect(completedObjective(game, map, p.id)).toBeNull();
          for (const id of game.objectives[p.id]!) {
            const { missing } = progress(game, id, p.id);
            expect(missing, `${id} para ${p.id}`).toBeGreaterThanOrEqual(MIN_MISSING_AT_DEAL);
          }
        }
      }
    }
  });
});

describe("vitória por objetivo", () => {
  it("vence ao conquistar as regiões do objetivo, na própria vez", () => {
    // tem o Norte inteiro, PR e SC; conquista RS → Norte e Sul
    const norte = Object.fromEntries(
      map.territories.filter((t) => t.region === "norte").map((t) => [t.id, 1]),
    );
    const state = stateWith({ ...norte, pr: 1, sc: 5 }, ["norte+sul", "territorios"]);
    const result = attack(state, map, "sc", "rs", seq(0.99, 0.99, 0.99, 0), 3);
    expect(result.state.winner).toBe("a");
    expect(result.state.winReason).toBe("norte+sul");
    expect(result.state.phase).toBe("finished");
  });

  it("vence ao chegar a 18 territórios", () => {
    const ids = map.territories.map((t) => t.id).filter((id) => id !== "mg" && id !== "sp");
    const owned = Object.fromEntries(ids.slice(0, TERRITORY_GOAL - 2).map((id) => [id, 1]));
    owned.sp = 5;
    const state = stateWith(owned, ["nordeste+sudeste", "territorios"]);
    const result = attack(state, map, "sp", "mg", seq(0.99, 0.99, 0.99, 0), 3);
    expect(result.state.winner).toBe("a");
    expect(result.state.winReason).toBe("territorios");
  });

  it("posicionar soldados não cumpre objetivo (só conquistando)", () => {
    const state = {
      ...stateWith({ sp: 1 }, ["norte+sul", "territorios"]),
      phase: "reinforce" as const,
      pendingReinforcements: 2,
    };
    expect(placeArmies(state, map, "sp", 1).winner).toBeNull();
  });
});

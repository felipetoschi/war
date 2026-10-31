import type { GameMap, GameState, Objective, PlayerId } from "./types";

/**
 * Objetivos abertos: cada jogador recebe um, sorteado, e todos podem ver
 * o objetivo de todos. Pensados para exigir entre 10 e 18 estados.
 */
export const OBJECTIVES: Objective[] = [
  {
    id: "nordeste-sul",
    kind: "regions",
    regions: ["nordeste", "sul"],
    description: "Conquistar o Nordeste e o Sul",
  },
  {
    id: "norte-sul",
    kind: "regions",
    regions: ["norte", "sul"],
    description: "Conquistar o Norte e o Sul",
  },
  {
    id: "norte-centro-oeste",
    kind: "regions",
    regions: ["norte", "centro-oeste"],
    description: "Conquistar o Norte e o Centro-Oeste",
  },
  {
    id: "nordeste-centro-oeste",
    kind: "regions",
    regions: ["nordeste", "centro-oeste"],
    description: "Conquistar o Nordeste e o Centro-Oeste",
  },
  {
    id: "sudeste-nordeste",
    kind: "regions",
    regions: ["sudeste", "nordeste"],
    description: "Conquistar o Sudeste e o Nordeste",
  },
  {
    id: "sudeste-centro-oeste-sul",
    kind: "regions",
    regions: ["sudeste", "centro-oeste", "sul"],
    description: "Conquistar o Sudeste, o Centro-Oeste e o Sul",
  },
  {
    id: "18-estados",
    kind: "territories",
    count: 18,
    minArmies: 1,
    description: "Ocupar 18 estados",
  },
  {
    id: "14-estados-2-exercitos",
    kind: "territories",
    count: 14,
    minArmies: 2,
    description: "Ocupar 14 estados com pelo menos 2 exércitos em cada",
  },
];

export interface ObjectiveProgress {
  done: number;
  total: number;
}

export function objectiveProgress(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  objective: Objective,
): ObjectiveProgress {
  if (objective.kind === "regions") {
    const targets = map.territories.filter((t) => objective.regions.includes(t.region));
    return {
      done: targets.filter((t) => state.territories[t.id]?.owner === player).length,
      total: targets.length,
    };
  }
  const held = Object.values(state.territories).filter(
    (t) => t.owner === player && t.armies >= objective.minArmies,
  ).length;
  return { done: Math.min(held, objective.count), total: objective.count };
}

export function isObjectiveComplete(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  objective: Objective,
): boolean {
  const { done, total } = objectiveProgress(state, map, player, objective);
  return done >= total;
}

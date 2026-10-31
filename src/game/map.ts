import type { GameMap, Territory } from "./types";

export function getTerritory(map: GameMap, id: string): Territory {
  const territory = map.territories.find((t) => t.id === id);
  if (!territory) throw new Error(`Território desconhecido: ${id}`);
  return territory;
}

export function areNeighbors(map: GameMap, a: string, b: string): boolean {
  return getTerritory(map, a).neighbors.includes(b);
}

export function isCoastal(map: GameMap, id: string): boolean {
  return getTerritory(map, id).coastIndex !== undefined;
}

/** Distância pelo litoral, contada em estados costeiros (null se algum não for litorâneo). */
export function coastDistance(map: GameMap, a: string, b: string): number | null {
  const ia = getTerritory(map, a).coastIndex;
  const ib = getTerritory(map, b).coastIndex;
  if (ia === undefined || ib === undefined) return null;
  return Math.abs(ia - ib);
}

import type { GameMap, GameState, PlayerId, Rng, TerritoryId } from "./types";

/**
 * Objetivos abertos, simples e intuitivos. Cada jogador tem 2 objetivos visíveis para todos
 * e vence ao cumprir qualquer um deles na sua vez (ou ao ser o último vivo):
 *
 * 1. um objetivo de **região**, sorteado: conquistar 2 ou 3 regiões inteiras;
 * 2. **ter 18 territórios** — igual para todos.
 *
 * Com dois caminhos para vencer, saber o objetivo do outro não trava o jogo.
 */
export type ObjectiveGroup = "region" | "common";

export interface ObjectiveProgress {
  done: boolean;
  /** Texto curto de progresso, ex.: "7/10". */
  text: string;
  /** Quantos territórios ainda faltam conquistar (0 = cumprido). */
  missing: number;
}

export interface ObjectiveDef {
  id: string;
  group: ObjectiveGroup;
  title: string;
  description: string;
  progress(state: GameState, map: GameMap, player: PlayerId): ObjectiveProgress;
}

/** Objetivo comum a todos: ter esta quantidade de territórios (de 26). */
export const TERRITORY_GOAL = 18;

/** No sorteio, só entram objetivos de região que ainda exigem pelo menos isto de conquistas. */
export const MIN_MISSING_AT_DEAL = 3;

const owns = (state: GameState, player: PlayerId, id: TerritoryId) =>
  state.territories[id]?.owner === player;

/** Objetivo: conquistar as regiões inteiras. */
function regionsObjective(map: GameMap, regionIds: string[]): ObjectiveDef {
  const names = regionIds.map((id) => map.regions.find((r) => r.id === id)!.name);
  const list =
    names.length === 2
      ? `o ${names[0]} e o ${names[1]}`
      : `o ${names.slice(0, -1).join(", o ")} e o ${names[names.length - 1]}`;
  return {
    id: regionIds.join("+"),
    group: "region",
    title: `Conquistar ${list}`,
    description: `Dominar todos os estados de: ${names.join(", ")}.`,
    progress: (state, map, player) => {
      const ids = map.territories.filter((t) => regionIds.includes(t.region)).map((t) => t.id);
      const have = ids.filter((id) => owns(state, player, id)).length;
      return {
        done: have === ids.length,
        text: `${have}/${ids.length}`,
        missing: ids.length - have,
      };
    },
  };
}

function territoryObjective(): ObjectiveDef {
  return {
    id: "territorios",
    group: "common",
    title: `Ter ${TERRITORY_GOAL} territórios`,
    description: `Ter ${TERRITORY_GOAL} dos 26 territórios do mapa, quaisquer que sejam.`,
    progress: (state, _map, player) => {
      const have = Object.values(state.territories).filter((t) => t?.owner === player).length;
      return {
        done: have >= TERRITORY_GOAL,
        text: `${Math.min(have, TERRITORY_GOAL)}/${TERRITORY_GOAL}`,
        missing: Math.max(0, TERRITORY_GOAL - have),
      };
    },
  };
}

/** Combinações de regiões sorteadas como objetivo (entre 10 e 13 territórios cada). */
export const REGION_GOALS: string[][] = [
  ["norte", "sul"],
  ["norte", "centro-oeste"],
  ["norte", "sudeste"],
  ["nordeste", "sul"],
  ["nordeste", "centro-oeste"],
  ["nordeste", "sudeste"],
  ["sudeste", "sul", "centro-oeste"],
];

export function allObjectives(map: GameMap): ObjectiveDef[] {
  return [...REGION_GOALS.map((r) => regionsObjective(map, r)), territoryObjective()];
}

export function objectiveById(map: GameMap, id: string): ObjectiveDef {
  const def = allObjectives(map).find((o) => o.id === id);
  if (!def) throw new Error(`Objetivo desconhecido: ${id}`);
  return def;
}

/** Primeiro objetivo cumprido pelo jogador (ou null). */
export function completedObjective(
  state: GameState,
  map: GameMap,
  player: PlayerId,
): ObjectiveDef | null {
  for (const id of state.objectives[player] ?? []) {
    const def = objectiveById(map, id);
    if (def.progress(state, map, player).done) return def;
  }
  return null;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Sorteia o objetivo de região de cada jogador (sem repetir entre jogadores e sem começar
 * adiantado: faltam pelo menos `MIN_MISSING_AT_DEAL` conquistas) e dá a todos o objetivo
 * comum de ter `TERRITORY_GOAL` territórios.
 */
export function dealObjectives(state: GameState, map: GameMap, rng: Rng): void {
  const pool = shuffle(
    allObjectives(map).filter((o) => o.group === "region"),
    rng,
  );
  const common = territoryObjective();
  for (const { id: player } of state.players) {
    const missing = pool.map((o) => o.progress(state, map, player).missing);
    let index = missing.findIndex((m) => m >= MIN_MISSING_AT_DEAL);
    if (index === -1) index = missing.indexOf(Math.max(...missing));
    const [region] = pool.splice(index, 1);
    state.objectives[player] = [region!.id, common.id];
  }
}

import type { GameMap, GameState, PlayerId, Rng, TerritoryId } from "./types";

/**
 * Objetivos abertos: cada jogador recebe 2, visíveis para todos, e vence ao cumprir
 * qualquer um deles na sua vez. Um é "flexível" (caminho ou contagem, com várias formas
 * de cumprir) e o outro é "focado" (região ou estados-chave). Assim, os adversários sabem
 * o que você quer, mas não conseguem bloquear tudo ao mesmo tempo.
 */
export type ObjectiveGroup = "flex" | "focus";

export interface ObjectiveProgress {
  done: boolean;
  /** Texto curto de progresso, ex.: "3/5" ou "AP ✓ · RS ✗". */
  text: string;
}

export interface ObjectiveDef {
  id: string;
  group: ObjectiveGroup;
  title: string;
  description: string;
  /** Jogadores mínimos para este objetivo entrar no sorteio. */
  minPlayers?: number;
  progress(state: GameState, map: GameMap, player: PlayerId): ObjectiveProgress;
}

// ---- auxiliares ----

const owns = (state: GameState, player: PlayerId, id: TerritoryId) =>
  state.territories[id]?.owner === player;

const ownedCount = (state: GameState, player: PlayerId, ids: TerritoryId[]) =>
  ids.filter((id) => owns(state, player, id)).length;

const territoryCount = (state: GameState, player: PlayerId, minArmies = 1) =>
  Object.values(state.territories).filter((t) => t?.owner === player && t.armies >= minArmies)
    .length;

/** Existe um caminho contínuo de territórios do jogador ligando `from` a algum de `to`? */
export function connected(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  from: TerritoryId,
  to: TerritoryId[],
): boolean {
  if (!owns(state, player, from)) return false;
  const goal = new Set(to);
  const seen = new Set<TerritoryId>([from]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (goal.has(id)) return true;
    for (const n of map.territories.find((t) => t.id === id)!.neighbors) {
      if (!seen.has(n) && owns(state, player, n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

const mark = (ok: boolean) => (ok ? "✓" : "✗");

function atLeast(ids: TerritoryId[], needed: number) {
  return (state: GameState, _map: GameMap, player: PlayerId): ObjectiveProgress => {
    const have = ownedCount(state, player, ids);
    return { done: have >= needed, text: `${Math.min(have, needed)}/${needed}` };
  };
}

function regions(regionIds: string[], extra = 0) {
  return (state: GameState, map: GameMap, player: PlayerId): ObjectiveProgress => {
    const ids = map.territories.filter((t) => regionIds.includes(t.region)).map((t) => t.id);
    const have = ownedCount(state, player, ids);
    const total = territoryCount(state, player);
    const regionsDone = have === ids.length;
    const extraDone = total - ids.length >= extra;
    const others = total - have;
    const text = extra
      ? `${have}/${ids.length} · mais ${Math.min(others, extra)}/${extra}`
      : `${have}/${ids.length}`;
    return { done: regionsDone && extraDone, text };
  };
}

const COASTAL = (map: GameMap) =>
  map.territories.filter((t) => t.coastIndex !== undefined).map((t) => t.id);
const NORTHEAST_COAST = ["ma", "pi", "ce", "rn", "pb", "pe", "al", "se", "ba"];
const AMAZONIA_LEGAL = ["ac", "am", "ap", "pa", "ro", "rr", "to", "mt", "ma"];
const INTERNATIONAL_BORDER = ["ac", "am", "rr", "pa", "ap", "ro", "mt", "ms", "pr", "sc", "rs"];

/** Território-alvo de quem tem o objetivo de caçada, se o alvo cair por outra mão. */
export const HUNT_FALLBACK = 16;

// ---- objetivos ----

export const OBJECTIVES: ObjectiveDef[] = [
  // Flexíveis: caminhos e contagens
  {
    id: "oiapoque-chui",
    group: "flex",
    title: "Do Oiapoque ao Chuí",
    description: "Ligar o Amapá ao Rio Grande do Sul por estados seus, sem interrupção.",
    progress: (state, map, player) => ({
      done: connected(state, map, player, "ap", ["rs"]),
      text: `AP ${mark(owns(state, player, "ap"))} · RS ${mark(owns(state, player, "rs"))}`,
    }),
  },
  {
    id: "litoral-a-litoral",
    group: "flex",
    title: "Do Acre ao mar",
    description:
      "Ligar o Acre a qualquer estado do litoral do Nordeste por estados seus, sem interrupção.",
    progress: (state, map, player) => ({
      done: connected(state, map, player, "ac", NORTHEAST_COAST),
      text: `AC ${mark(owns(state, player, "ac"))} · litoral NE ${ownedCount(state, player, NORTHEAST_COAST)}`,
    }),
  },
  {
    id: "senhor-da-costa",
    group: "flex",
    title: "Senhor da costa",
    description: "Dominar 10 dos 17 estados do litoral.",
    progress: (state, map, player) => atLeast(COASTAL(map), 10)(state, map, player),
  },
  {
    id: "ocupacao",
    group: "flex",
    title: "Ocupação",
    description: `Ter ${HUNT_FALLBACK} dos 26 territórios.`,
    progress: (state, _map, player) => {
      const have = territoryCount(state, player);
      return {
        done: have >= HUNT_FALLBACK,
        text: `${Math.min(have, HUNT_FALLBACK)}/${HUNT_FALLBACK}`,
      };
    },
  },
  {
    id: "fortaleza",
    group: "flex",
    title: "Fortaleza",
    description: "Ter 12 territórios com pelo menos 2 soldados em cada.",
    progress: (state, _map, player) => {
      const have = territoryCount(state, player, 2);
      return { done: have >= 12, text: `${Math.min(have, 12)}/12` };
    },
  },

  // Focados: regiões e estados-chave
  {
    id: "sao-francisco",
    group: "focus",
    title: "Rio São Francisco",
    description: "Dominar MG, BA, PE, AL e SE ao mesmo tempo.",
    progress: atLeast(["mg", "ba", "pe", "al", "se"], 5),
  },
  {
    id: "amazonia-legal",
    group: "focus",
    title: "Amazônia Legal",
    description: "Dominar 7 dos 9 estados da Amazônia Legal (AC, AM, AP, PA, RO, RR, TO, MT, MA).",
    progress: atLeast(AMAZONIA_LEGAL, 7),
  },
  {
    id: "eixo-do-poder",
    group: "focus",
    title: "Eixo do poder",
    description: "Dominar SP, RJ, MG e Goiás/DF ao mesmo tempo.",
    progress: atLeast(["sp", "rj", "mg", "go"], 4),
  },
  {
    id: "fronteiras",
    group: "focus",
    title: "Guardião das fronteiras",
    description: "Dominar 8 dos 11 estados que fazem fronteira com outros países.",
    progress: atLeast(INTERNATIONAL_BORDER, 8),
  },
  {
    id: "nordeste-sul",
    group: "focus",
    title: "Nordeste e Sul",
    description: "Dominar o Nordeste e o Sul inteiros.",
    progress: regions(["nordeste", "sul"]),
  },
  {
    id: "norte-centro-oeste",
    group: "focus",
    title: "Norte e Centro-Oeste",
    description: "Dominar o Norte e o Centro-Oeste inteiros.",
    progress: regions(["norte", "centro-oeste"]),
  },
  {
    id: "sudeste-sul",
    group: "focus",
    title: "Sudeste e Sul + 3",
    description: "Dominar o Sudeste e o Sul inteiros e mais 3 territórios quaisquer.",
    progress: regions(["sudeste", "sul"], 3),
  },
  {
    id: "cacada",
    group: "focus",
    title: "Caçada",
    description: `Eliminar o jogador indicado. Se outro jogador eliminá-lo antes, o objetivo vira ter ${HUNT_FALLBACK} territórios.`,
    minPlayers: 3,
    progress: (state, _map, player) => {
      const target = state.huntTargets[player];
      const killer = target ? state.eliminatedBy[target] : undefined;
      if (killer === player) return { done: true, text: "alvo eliminado ✓" };
      if (target && killer === undefined) {
        const left = territoryCount(state, target);
        return { done: false, text: `alvo com ${left} território(s)` };
      }
      const have = territoryCount(state, player);
      return {
        done: have >= HUNT_FALLBACK,
        text: `alvo caiu: ${Math.min(have, HUNT_FALLBACK)}/${HUNT_FALLBACK}`,
      };
    },
  },
];

export function objectiveById(id: string): ObjectiveDef {
  const def = OBJECTIVES.find((o) => o.id === id);
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
    const def = objectiveById(id);
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
 * Sorteia 2 objetivos para cada jogador (1 flexível + 1 focado), sem repetir entre
 * jogadores e sem dar a ninguém um objetivo que já começa cumprido.
 * Na caçada, o alvo é o próximo jogador na roda.
 */
export function dealObjectives(state: GameState, map: GameMap, rng: Rng): void {
  const playerIds = state.players.map((p) => p.id);
  const available = OBJECTIVES.filter((o) => (o.minPlayers ?? 0) <= playerIds.length);
  const pools: Record<ObjectiveGroup, ObjectiveDef[]> = {
    flex: shuffle(
      available.filter((o) => o.group === "flex"),
      rng,
    ),
    focus: shuffle(
      available.filter((o) => o.group === "focus"),
      rng,
    ),
  };
  playerIds.forEach((player, i) => {
    state.huntTargets[player] = playerIds[(i + 1) % playerIds.length]!;
    state.objectives[player] = (["flex", "focus"] as const).map((group) => {
      const pool = pools[group];
      const index = pool.findIndex((o) => !o.progress(state, map, player).done);
      const [chosen] = pool.splice(index === -1 ? 0 : index, 1);
      return chosen!.id;
    });
  });
}

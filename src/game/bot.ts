import { hasValidSet, isValidSet } from "./cards";
import { getTerritory } from "./map";
import { objectiveById } from "./objectives";
import {
  canAttack,
  currentPlayer,
  declareAttack,
  endAttackPhase,
  endTurn,
  fortify,
  maxAttackers,
  movableTo,
  mustTrade,
  placeArmies,
  playersStillPlacing,
  playersToRollForOrder,
  rollAttack,
  rollDefense,
  rollForOrder,
  skipReinforce,
  territoriesOf,
  tradeCards,
} from "./rules";
import type { Card, GameMap, GameState, PlayerId, Rng, TerritoryId } from "./types";

/**
 * Bot simples e "honesto": usa só o que está à vista na mesa (como um jogador humano) e
 * decide uma ação por vez, para a interface poder mostrar cada passo com animação e som.
 */
export type BotAction =
  | { type: "roll-order"; players: PlayerId[] }
  | { type: "trade"; cards: string[] }
  | { type: "place"; territory: TerritoryId }
  | { type: "skip-reinforce" }
  | { type: "declare"; from: TerritoryId; to: TerritoryId; soldiers: number }
  | { type: "roll-attack" }
  | { type: "roll-defense" }
  | { type: "end-attack" }
  | { type: "fortify"; from: TerritoryId; to: TerritoryId }
  | { type: "end-turn" };

/** Limites por turno, para o bot nunca ficar preso num laço. */
const MAX_ATTACKS_PER_TURN = 40;
const MAX_FORTIFY_MOVES = 12;

const isBot = (state: GameState, id: PlayerId) =>
  state.players.find((p) => p.id === id)?.bot === true;

/** Quem (bot) precisa agir agora, ou null se é a vez de um humano / não há nada a fazer. */
export function botToAct(state: GameState): PlayerId | null {
  if (state.phase === "finished") return null;
  if (state.phase === "order") {
    return playersToRollForOrder(state).find((id) => isBot(state, id)) ?? null;
  }
  if (state.phase === "placement") {
    return playersStillPlacing(state).find((id) => isBot(state, id)) ?? null;
  }
  const battle = state.battle;
  if (battle) {
    const actor = battle.attackRolls ? battle.defender : battle.attacker;
    return isBot(state, actor) ? actor : null;
  }
  const current = currentPlayer(state).id;
  return isBot(state, current) ? current : null;
}

/** Estados (ids) das regiões do objetivo de região do jogador. */
function objectiveTerritories(state: GameState, map: GameMap, player: PlayerId): Set<TerritoryId> {
  const ids = new Set<TerritoryId>();
  for (const id of state.objectives[player] ?? []) {
    if (objectiveById(map, id).group !== "region") continue;
    const regions = id.split("+");
    for (const t of map.territories) if (regions.includes(t.region)) ids.add(t.id);
  }
  return ids;
}

const enemyNeighbors = (state: GameState, map: GameMap, id: TerritoryId) => {
  const owner = state.territories[id]!.owner;
  return getTerritory(map, id).neighbors.filter((n) => state.territories[n]?.owner !== owner);
};

/** Onde colocar o próximo soldado: na fronteira, de olho no objetivo e em alvos fracos. */
function bestPlacement(state: GameState, map: GameMap, player: PlayerId): TerritoryId {
  const goal = objectiveTerritories(state, map, player);
  let best: TerritoryId | null = null;
  let bestScore = -Infinity;
  for (const id of territoriesOf(state, player)) {
    const enemies = enemyNeighbors(state, map, id);
    if (enemies.length === 0) continue;
    const armies = state.territories[id]!.armies;
    const weakest = Math.min(...enemies.map((n) => state.territories[n]!.armies));
    let score = 0;
    for (const n of enemies) score += 1 + (goal.has(n) ? 1.5 : 0);
    if (goal.has(id)) score += 1;
    if (weakest <= 2) score += 1;
    // prefere concentrar onde já há força para atacar, mas sem empilhar demais
    score += Math.min(armies, 6) * 0.25 - Math.max(0, armies - 8) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best ?? territoriesOf(state, player)[0]!;
}

/** Melhor ataque disponível (ou null se nenhum vale a pena). */
function bestAttack(
  state: GameState,
  map: GameMap,
  player: PlayerId,
): { from: TerritoryId; to: TerritoryId; soldiers: number } | null {
  const goal = objectiveTerritories(state, map, player);
  let best: { from: TerritoryId; to: TerritoryId; soldiers: number } | null = null;
  let bestScore = -Infinity;
  for (const from of territoriesOf(state, player)) {
    const armies = state.territories[from]!.armies;
    if (armies < 2) continue;
    for (const to of getTerritory(map, from).neighbors) {
      if (!canAttack(state, map, from, to)) continue;
      const defenders = state.territories[to]!.armies;
      // só ataca com vantagem clara
      const favorable = armies - 1 > defenders || (armies >= 4 && armies - 1 >= defenders);
      if (!favorable) continue;
      let score = (armies - 1) / defenders;
      if (goal.has(to)) score += 1;
      if (defenders === 1) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { from, to, soldiers: maxAttackers(state, from) };
      }
    }
  }
  return best;
}

/** Um trio válido de cartas, preferindo cartas de estados próprios (+2 soldados). */
function bestTrade(state: GameState, player: PlayerId): string[] | null {
  const hand = state.hands[player] ?? [];
  let best: Card[] | null = null;
  let bestOwned = -1;
  for (let a = 0; a < hand.length; a++) {
    for (let b = a + 1; b < hand.length; b++) {
      for (let c = b + 1; c < hand.length; c++) {
        const trio = [hand[a]!, hand[b]!, hand[c]!];
        if (!isValidSet(trio)) continue;
        const owned = trio.filter(
          (card) => card.territory && state.territories[card.territory]?.owner === player,
        ).length;
        if (owned > bestOwned) {
          bestOwned = owned;
          best = trio;
        }
      }
    }
  }
  return best?.map((c) => c.id) ?? null;
}

/** Leva soldados do interior (sem inimigos por perto) para a fronteira. */
function bestFortify(
  state: GameState,
  map: GameMap,
  player: PlayerId,
): { from: TerritoryId; to: TerritoryId } | null {
  const isBorder = (id: TerritoryId) => enemyNeighbors(state, map, id).length > 0;
  for (const from of territoriesOf(state, player)) {
    if (isBorder(from)) continue;
    for (const to of getTerritory(map, from).neighbors) {
      if (state.territories[to]?.owner !== player) continue;
      if (movableTo(state, from, to) > 0 && isBorder(to)) return { from, to };
    }
  }
  return null;
}

/** Contagem de ações do bot no turno atual (para os limites anti-laço). */
export interface BotMemory {
  turnKey: string;
  attacks: number;
  fortifies: number;
}

export function newBotMemory(): BotMemory {
  return { turnKey: "", attacks: 0, fortifies: 0 };
}

/** Decide a próxima ação do bot `player`. */
export function chooseBotAction(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  memory: BotMemory = newBotMemory(),
): BotAction {
  const turnKey = `${state.round}:${state.currentPlayerIndex}`;
  if (memory.turnKey !== turnKey) {
    memory.turnKey = turnKey;
    memory.attacks = 0;
    memory.fortifies = 0;
  }

  if (state.phase === "order") {
    return {
      type: "roll-order",
      players: playersToRollForOrder(state).filter((id) => isBot(state, id)),
    };
  }
  const battle = state.battle;
  if (battle) return battle.attackRolls ? { type: "roll-defense" } : { type: "roll-attack" };

  switch (state.phase) {
    case "placement":
      return { type: "place", territory: bestPlacement(state, map, player) };
    case "reinforce": {
      if (hasValidSet(state.hands[player] ?? [])) {
        const cards = bestTrade(state, player);
        if (cards) return { type: "trade", cards };
      }
      if (state.pendingReinforcements > 0 && !mustTrade(state)) {
        return { type: "place", territory: bestPlacement(state, map, player) };
      }
      return { type: "skip-reinforce" };
    }
    case "attack": {
      const choice = memory.attacks < MAX_ATTACKS_PER_TURN ? bestAttack(state, map, player) : null;
      if (!choice) return { type: "end-attack" };
      memory.attacks++;
      return { type: "declare", ...choice };
    }
    case "fortify": {
      const move = memory.fortifies < MAX_FORTIFY_MOVES ? bestFortify(state, map, player) : null;
      if (!move) return { type: "end-turn" };
      memory.fortifies++;
      return { type: "fortify", ...move };
    }
    default:
      return { type: "end-turn" };
  }
}

/** Aplica uma ação do bot direto nas regras (usado nos testes e simulações). */
export function applyBotAction(
  state: GameState,
  map: GameMap,
  action: BotAction,
  rng: Rng = Math.random,
): GameState {
  switch (action.type) {
    case "roll-order":
      return action.players.reduce((s, id) => rollForOrder(s, map, id, rng), state);
    case "trade":
      return tradeCards(state, map, action.cards).state;
    case "place":
      return placeArmies(state, map, action.territory, 1);
    case "skip-reinforce":
      return skipReinforce(state);
    case "declare":
      return declareAttack(state, map, action.from, action.to, action.soldiers);
    case "roll-attack":
      return rollAttack(state, rng);
    case "roll-defense":
      return rollDefense(state, map, rng).state;
    case "end-attack":
      return endAttackPhase(state);
    case "fortify":
      return fortify(state, map, action.from, action.to, 1);
    case "end-turn":
      return endTurn(state, map, rng);
  }
}

import { compareRolls, rollDice, type BattleResult } from "./dice";
import { areNeighbors, coastDistance } from "./map";
import { isObjectiveComplete, OBJECTIVES } from "./objectives";
import type { GameMap, GameState, Player, PlayerId, Rng, TerritoryId } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const MAX_ATTACK_DICE = 3;
export const MAX_DEFENSE_DICE = 3;
export const MIN_REINFORCEMENTS = 3;

/**
 * Penalidade do ataque naval, por distância no litoral (em estados costeiros):
 * 2–4 → −1 em cada dado, 5–8 → −2, 9 ou mais → −3.
 */
export function navalPenalty(distance: number): number {
  if (distance <= 4) return 1;
  if (distance <= 8) return 2;
  return 3;
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
 * Cria uma partida: sorteia a ordem dos jogadores, um objetivo aberto para cada
 * e distribui os estados igualmente (1 exército em cada).
 */
export function createGame(map: GameMap, players: Player[], rng: Rng = Math.random): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`O jogo aceita de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores`);
  }
  const order = shuffle(players, rng);
  const objectives: GameState["objectives"] = {};
  shuffle(OBJECTIVES, rng)
    .slice(0, order.length)
    .forEach((objective, i) => (objectives[order[i]!.id] = objective));

  const territories: GameState["territories"] = {};
  shuffle(map.territories, rng).forEach((t, i) => {
    territories[t.id] = { owner: order[i % order.length]!.id, armies: 1 };
  });

  const state: GameState = {
    players: order,
    objectives,
    territories,
    currentPlayerIndex: 0,
    phase: "reinforce",
    turn: 1,
    pendingReinforcements: 0,
    winner: null,
  };
  state.pendingReinforcements = reinforcementsFor(state, map, order[0]!.id);
  return state;
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

export function territoriesOf(state: GameState, player: PlayerId): TerritoryId[] {
  return Object.keys(state.territories).filter((id) => state.territories[id]!.owner === player);
}

export function controlsRegion(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  region: string,
): boolean {
  return map.territories
    .filter((t) => t.region === region)
    .every((t) => state.territories[t.id]?.owner === player);
}

/** Metade dos estados (mínimo 3) + bônus de cada região dominada. */
export function reinforcementsFor(state: GameState, map: GameMap, player: PlayerId): number {
  const base = Math.max(MIN_REINFORCEMENTS, Math.floor(territoriesOf(state, player).length / 2));
  const bonus = map.regions
    .filter((r) => controlsRegion(state, map, player, r.id))
    .reduce((sum, r) => sum + r.bonus, 0);
  return base + bonus;
}

/** Vitória: cumprir o próprio objetivo ou dominar todos os estados. */
function checkVictory(state: GameState, map: GameMap): GameState {
  const player = currentPlayer(state).id;
  const objective = state.objectives[player];
  const ownsAll = territoriesOf(state, player).length === map.territories.length;
  if (ownsAll || (objective && isObjectiveComplete(state, map, player, objective))) {
    state.winner = player;
    state.phase = "finished";
  }
  return state;
}

function assertPhase(state: GameState, phase: GameState["phase"]): void {
  if (state.phase !== phase) throw new Error(`Ação inválida na fase "${state.phase}"`);
}

function assertOwnedByCurrent(state: GameState, id: TerritoryId): void {
  const territory = state.territories[id];
  if (!territory) throw new Error(`Território desconhecido: ${id}`);
  if (territory.owner !== currentPlayer(state).id) {
    throw new Error("Território não pertence ao jogador da vez");
  }
}

export function placeArmies(
  state: GameState,
  map: GameMap,
  territory: TerritoryId,
  amount: number,
): GameState {
  assertPhase(state, "reinforce");
  assertOwnedByCurrent(state, territory);
  if (!Number.isInteger(amount) || amount < 1 || amount > state.pendingReinforcements) {
    throw new Error("Quantidade de exércitos inválida");
  }
  const next = structuredClone(state);
  next.territories[territory]!.armies += amount;
  next.pendingReinforcements -= amount;
  if (next.pendingReinforcements === 0) next.phase = "attack";
  return checkVictory(next, map);
}

/**
 * Penalidade nos dados para atacar `to` a partir de `from`:
 * 0 por terra (fronteira), 1–3 por mar (dois estados litorâneos sem fronteira),
 * ou null se não há rota de ataque.
 */
export function attackPenalty(map: GameMap, from: TerritoryId, to: TerritoryId): number | null {
  if (from === to) return null;
  if (areNeighbors(map, from, to)) return 0;
  const distance = coastDistance(map, from, to);
  return distance === null ? null : navalPenalty(distance);
}

export function canAttack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
): boolean {
  const source = state.territories[from];
  const target = state.territories[to];
  if (state.phase !== "attack" || !source || !target) return false;
  return (
    source.owner === currentPlayer(state).id &&
    target.owner !== source.owner &&
    source.armies > 1 &&
    attackPenalty(map, from, to) !== null
  );
}

export interface AttackOutcome {
  state: GameState;
  battle: BattleResult;
  conquered: boolean;
  naval: boolean;
}

/**
 * Um ataque: o atacante rola até 3 dados (deixando sempre 1 exército para trás),
 * o defensor até 3. Ataques navais sofrem penalidade nos dados do atacante.
 * Se conquistar, move os exércitos que sobreviveram ao ataque.
 */
export function attack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  rng: Rng = Math.random,
): AttackOutcome {
  if (!canAttack(state, map, from, to)) throw new Error("Ataque inválido");
  const penalty = attackPenalty(map, from, to)!;
  const next = structuredClone(state);
  const source = next.territories[from]!;
  const target = next.territories[to]!;

  const attackDice = Math.min(MAX_ATTACK_DICE, source.armies - 1);
  const defenseDice = Math.min(MAX_DEFENSE_DICE, target.armies);
  const battle = compareRolls(rollDice(attackDice, rng), rollDice(defenseDice, rng), penalty);

  source.armies -= battle.attackerLosses;
  target.armies -= battle.defenderLosses;

  let conquered = false;
  if (target.armies === 0) {
    conquered = true;
    const moving = attackDice - battle.attackerLosses;
    target.owner = source.owner;
    target.armies = moving;
    source.armies -= moving;
    checkVictory(next, map);
  }
  return { state: next, battle, conquered, naval: penalty > 0 };
}

export function endAttackPhase(state: GameState): GameState {
  assertPhase(state, "attack");
  return { ...state, phase: "fortify" };
}

/** Remanejamento: move exércitos entre dois estados vizinhos (por terra) do jogador da vez. */
export function fortify(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  amount: number,
): GameState {
  assertPhase(state, "fortify");
  assertOwnedByCurrent(state, from);
  assertOwnedByCurrent(state, to);
  if (!areNeighbors(map, from, to)) throw new Error("Estados não fazem fronteira");
  const source = state.territories[from]!;
  if (!Number.isInteger(amount) || amount < 1 || amount >= source.armies) {
    throw new Error("Quantidade de exércitos inválida");
  }
  const next = structuredClone(state);
  next.territories[from]!.armies -= amount;
  next.territories[to]!.armies += amount;
  return checkVictory(next, map);
}

/** Passa a vez para o próximo jogador que ainda tem estados. */
export function endTurn(state: GameState, map: GameMap): GameState {
  if (state.phase === "finished") throw new Error("A partida já terminou");
  if (state.phase === "reinforce") {
    throw new Error("Posicione todos os reforços antes de passar a vez");
  }
  const next = structuredClone(state);
  let index = state.currentPlayerIndex;
  do {
    index = (index + 1) % state.players.length;
    if (index === 0) next.turn++;
  } while (territoriesOf(next, state.players[index]!.id).length === 0);
  next.currentPlayerIndex = index;
  next.phase = "reinforce";
  next.pendingReinforcements = reinforcementsFor(next, map, state.players[index]!.id);
  return next;
}

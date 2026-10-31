import { compareRolls, rollDice, type BattleResult } from "./dice";
import { areNeighbors } from "./map";
import type { GameMap, GameState, Player, PlayerId, Rng, TerritoryId } from "./types";

export const MAX_ATTACK_DICE = 3;
export const MAX_DEFENSE_DICE = 3;
export const MIN_REINFORCEMENTS = 3;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Cria uma partida sorteando os territórios entre os jogadores (1 exército em cada). */
export function createGame(map: GameMap, players: Player[], rng: Rng = Math.random): GameState {
  if (players.length < 2) throw new Error("São necessários pelo menos 2 jogadores");
  const territories: GameState["territories"] = {};
  shuffle(map.territories, rng).forEach((t, i) => {
    territories[t.id] = { owner: players[i % players.length]!.id, armies: 1 };
  });
  const state: GameState = {
    players,
    territories,
    currentPlayerIndex: 0,
    phase: "reinforce",
    turn: 1,
    pendingReinforcements: 0,
    winner: null,
  };
  state.pendingReinforcements = reinforcementsFor(state, map, players[0]!.id);
  return state;
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

export function territoriesOf(state: GameState, player: PlayerId): TerritoryId[] {
  return Object.keys(state.territories).filter((id) => state.territories[id]!.owner === player);
}

export function controlsContinent(
  state: GameState,
  map: GameMap,
  player: PlayerId,
  continent: string,
): boolean {
  return map.territories
    .filter((t) => t.continent === continent)
    .every((t) => state.territories[t.id]?.owner === player);
}

/** Metade dos territórios (mínimo 3) + bônus de cada continente dominado. */
export function reinforcementsFor(state: GameState, map: GameMap, player: PlayerId): number {
  const base = Math.max(MIN_REINFORCEMENTS, Math.floor(territoriesOf(state, player).length / 2));
  const bonus = map.continents
    .filter((c) => controlsContinent(state, map, player, c.id))
    .reduce((sum, c) => sum + c.bonus, 0);
  return base + bonus;
}

function assertPhase(state: GameState, phase: GameState["phase"]): void {
  if (state.phase !== phase) throw new Error(`Ação inválida na fase "${state.phase}"`);
}

function assertOwnedByCurrent(state: GameState, id: TerritoryId): void {
  const territory = state.territories[id];
  if (!territory) throw new Error(`Território desconhecido: ${id}`);
  if (territory.owner !== currentPlayer(state).id)
    throw new Error("Território não pertence ao jogador da vez");
}

export function placeArmies(state: GameState, territory: TerritoryId, amount: number): GameState {
  assertPhase(state, "reinforce");
  assertOwnedByCurrent(state, territory);
  if (!Number.isInteger(amount) || amount < 1 || amount > state.pendingReinforcements) {
    throw new Error("Quantidade de exércitos inválida");
  }
  const next = structuredClone(state);
  next.territories[territory]!.armies += amount;
  next.pendingReinforcements -= amount;
  if (next.pendingReinforcements === 0) next.phase = "attack";
  return next;
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
    areNeighbors(map, from, to)
  );
}

export interface AttackOutcome {
  state: GameState;
  battle: BattleResult;
  conquered: boolean;
}

/**
 * Um ataque: o atacante rola até 3 dados (deixando sempre 1 exército para trás),
 * o defensor até 3. Se conquistar, move os exércitos que atacaram.
 */
export function attack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  rng: Rng = Math.random,
): AttackOutcome {
  if (!canAttack(state, map, from, to)) throw new Error("Ataque inválido");
  const next = structuredClone(state);
  const source = next.territories[from]!;
  const target = next.territories[to]!;

  const attackDice = Math.min(MAX_ATTACK_DICE, source.armies - 1);
  const defenseDice = Math.min(MAX_DEFENSE_DICE, target.armies);
  const battle = compareRolls(rollDice(attackDice, rng), rollDice(defenseDice, rng));

  source.armies -= battle.attackerLosses;
  target.armies -= battle.defenderLosses;

  let conquered = false;
  if (target.armies === 0) {
    conquered = true;
    const moving = attackDice - battle.attackerLosses;
    target.owner = source.owner;
    target.armies = moving;
    source.armies -= moving;
    if (territoriesOf(next, source.owner).length === map.territories.length) {
      next.winner = source.owner;
      next.phase = "finished";
    }
  }
  return { state: next, battle, conquered };
}

export function endAttackPhase(state: GameState): GameState {
  assertPhase(state, "attack");
  return { ...state, phase: "fortify" };
}

/** Remanejamento: move exércitos entre dois territórios vizinhos do jogador da vez. */
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
  if (!areNeighbors(map, from, to)) throw new Error("Territórios não são vizinhos");
  const source = state.territories[from]!;
  if (!Number.isInteger(amount) || amount < 1 || amount >= source.armies) {
    throw new Error("Quantidade de exércitos inválida");
  }
  const next = structuredClone(state);
  next.territories[from]!.armies -= amount;
  next.territories[to]!.armies += amount;
  return next;
}

/** Passa a vez para o próximo jogador que ainda tem territórios. */
export function endTurn(state: GameState, map: GameMap): GameState {
  if (state.phase === "finished") throw new Error("A partida já terminou");
  if (state.phase === "reinforce")
    throw new Error("Posicione todos os reforços antes de passar a vez");
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

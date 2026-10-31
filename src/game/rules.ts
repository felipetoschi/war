import { compareRolls, rollDice, type BattleResult } from "./dice";
import { areNeighbors, coastDistance } from "./map";
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

/**
 * Cria uma partida. `players` já deve vir na ordem de jogada (decidida nos dados).
 * A partida começa com a escolha de estados, todos ainda sem dono.
 */
export function createGame(players: Player[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`O jogo aceita de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores`);
  }
  return {
    players,
    territories: {},
    currentPlayerIndex: 0,
    phase: "claim",
    round: 0,
    pendingReinforcements: 0,
    pendingMove: null,
    fortified: {},
    winner: null,
  };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

export function territoriesOf(state: GameState, player: PlayerId): TerritoryId[] {
  return Object.keys(state.territories).filter((id) => state.territories[id]?.owner === player);
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => territoriesOf(state, p.id).length > 0);
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

/** Regra clássica: metade dos estados (mínimo 3) + bônus de cada região dominada. */
export function reinforcementsFor(state: GameState, map: GameMap, player: PlayerId): number {
  const base = Math.max(MIN_REINFORCEMENTS, Math.floor(territoriesOf(state, player).length / 2));
  const bonus = map.regions
    .filter((r) => controlsRegion(state, map, player, r.id))
    .reduce((sum, r) => sum + r.bonus, 0);
  return base + bonus;
}

function assertPhase(state: GameState, ...phases: GameState["phase"][]): void {
  if (!phases.includes(state.phase)) throw new Error(`Ação inválida na fase "${state.phase}"`);
  if (state.pendingMove)
    throw new Error("Escolha quantos soldados mover para o estado conquistado");
}

function assertOwnedByCurrent(state: GameState, id: TerritoryId): void {
  const territory = state.territories[id];
  if (!territory) throw new Error(`Estado sem dono: ${id}`);
  if (territory.owner !== currentPlayer(state).id) {
    throw new Error("Esse estado não é do jogador da vez");
  }
}

/** Começa o turno normal de um jogador, na fase de reforço. */
function startTurn(state: GameState, map: GameMap, index: number): GameState {
  state.currentPlayerIndex = index;
  state.phase = "reinforce";
  state.fortified = {};
  state.pendingReinforcements = reinforcementsFor(state, map, state.players[index]!.id);
  return state;
}

/** Escolha de estados: cada jogador, na sua vez, pega um estado livre (com 1 soldado). */
export function claimTerritory(state: GameState, map: GameMap, territory: TerritoryId): GameState {
  assertPhase(state, "claim");
  if (!map.territories.some((t) => t.id === territory)) {
    throw new Error(`Estado desconhecido: ${territory}`);
  }
  if (state.territories[territory]) throw new Error("Esse estado já foi escolhido");
  const next = structuredClone(state);
  next.territories[territory] = { owner: currentPlayer(state).id, armies: 1 };
  next.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;

  if (Object.keys(next.territories).length === map.territories.length) {
    next.phase = "placement";
    next.currentPlayerIndex = 0;
    next.pendingReinforcements = reinforcementsFor(next, map, next.players[0]!.id);
  }
  return next;
}

/** Posiciona soldados na rodada inicial ou no reforço do turno. */
export function placeArmies(
  state: GameState,
  map: GameMap,
  territory: TerritoryId,
  amount: number,
): GameState {
  assertPhase(state, "placement", "reinforce");
  assertOwnedByCurrent(state, territory);
  if (!Number.isInteger(amount) || amount < 1 || amount > state.pendingReinforcements) {
    throw new Error("Quantidade de soldados inválida");
  }
  const next = structuredClone(state);
  next.territories[territory]!.armies += amount;
  next.pendingReinforcements -= amount;
  if (next.pendingReinforcements > 0) return next;

  if (next.phase === "reinforce") {
    next.phase = "attack";
    return next;
  }
  // Rodada inicial: passa para o próximo; depois do último, começam os turnos normais.
  const following = state.currentPlayerIndex + 1;
  if (following < state.players.length) {
    next.currentPlayerIndex = following;
    next.pendingReinforcements = reinforcementsFor(next, map, next.players[following]!.id);
    return next;
  }
  next.round = 1;
  return startTurn(next, map, 0);
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
  if (state.phase !== "attack" || state.pendingMove || !source || !target) return false;
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
  /** Dono anterior, se foi eliminado com esta conquista. */
  eliminated: PlayerId | null;
}

/**
 * Um ataque: o atacante rola até 3 dados (deixando sempre 1 soldado para trás),
 * o defensor até 3. Ataques navais sofrem penalidade nos dados do atacante.
 * Ao conquistar, o atacante precisa escolher quantos soldados mover (`moveAfterConquest`).
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
  const defender = target.owner;

  const attackDice = Math.min(MAX_ATTACK_DICE, source.armies - 1);
  const defenseDice = Math.min(MAX_DEFENSE_DICE, target.armies);
  const battle = compareRolls(rollDice(attackDice, rng), rollDice(defenseDice, rng), penalty);

  source.armies -= battle.attackerLosses;
  target.armies -= battle.defenderLosses;

  const conquered = target.armies === 0;
  let eliminated: PlayerId | null = null;
  if (conquered) {
    target.owner = source.owner;
    const max = Math.min(attackDice, source.armies - 1);
    if (territoriesOf(next, defender).length === 0) eliminated = defender;
    if (alivePlayers(next).length === 1) {
      // Último vivo: fim de jogo, move o máximo automaticamente.
      target.armies = max;
      source.armies -= max;
      next.winner = source.owner;
      next.phase = "finished";
    } else {
      next.pendingMove = { from, to, max };
    }
  }
  return { state: next, battle, conquered, naval: penalty > 0, eliminated };
}

/** Depois de conquistar: move de 1 até `max` soldados (no máximo os que atacaram). */
export function moveAfterConquest(state: GameState, amount: number): GameState {
  const move = state.pendingMove;
  if (!move) throw new Error("Não há conquista pendente");
  if (!Number.isInteger(amount) || amount < 1 || amount > move.max) {
    throw new Error(`Mova de 1 a ${move.max} soldados`);
  }
  const next = structuredClone(state);
  next.territories[move.from]!.armies -= amount;
  next.territories[move.to]!.armies += amount;
  next.pendingMove = null;
  return next;
}

export function endAttackPhase(state: GameState): GameState {
  assertPhase(state, "attack");
  return { ...state, phase: "fortify" };
}

/** Soldados de um estado que ainda podem ser remanejados neste turno. */
export function movableArmies(state: GameState, territory: TerritoryId): number {
  const armies = state.territories[territory]?.armies ?? 0;
  return Math.max(0, armies - 1 - (state.fortified[territory] ?? 0));
}

/**
 * Remanejamento: move soldados entre estados vizinhos (por terra) do jogador da vez.
 * Fica sempre 1 soldado na origem, e quem já foi remanejado não se move de novo no turno.
 */
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
  if (!areNeighbors(map, from, to)) throw new Error("Os estados não fazem fronteira");
  if (!Number.isInteger(amount) || amount < 1 || amount > movableArmies(state, from)) {
    throw new Error("Esses soldados não podem ser remanejados");
  }
  const next = structuredClone(state);
  next.territories[from]!.armies -= amount;
  next.territories[to]!.armies += amount;
  next.fortified[to] = (next.fortified[to] ?? 0) + amount;
  return next;
}

/** Passa a vez para o próximo jogador ainda vivo. */
export function endTurn(state: GameState, map: GameMap): GameState {
  assertPhase(state, "attack", "fortify");
  const next = structuredClone(state);
  let index = state.currentPlayerIndex;
  do {
    index = (index + 1) % state.players.length;
    if (index === 0) next.round++;
  } while (territoriesOf(next, state.players[index]!.id).length === 0);
  return startTurn(next, map, index);
}

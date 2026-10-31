import { compareRolls, rollDice, rollDie, type BattleResult } from "./dice";
import { areNeighbors, coastDistance } from "./map";
import { resolveOrder } from "./order";
import type { GameMap, GameState, Player, PlayerId, Rng, TerritoryId } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MAX_ATTACK_DICE = 3;
export const MAX_DEFENSE_DICE = 3;
/** Soldados que cada jogador posiciona na rodada inicial, antes dos ataques. */
export const INITIAL_ARMIES = 3;
/** A cada quantos estados o jogador ganha 1 soldado no reforço. */
export const TERRITORIES_PER_REINFORCEMENT = 2;

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
 * Cria uma partida: os 27 estados são sorteados entre os jogadores (1 soldado em cada),
 * o mais igualmente possível. Em seguida, os dados decidem a ordem de jogada (`rollForOrder`).
 */
export function createGame(map: GameMap, players: Player[], rng: Rng = Math.random): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`O jogo aceita de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores`);
  }
  // Quem recebe os estados que sobram na divisão também é sorteado.
  const dealOrder = shuffle(players, rng);
  const territories: GameState["territories"] = {};
  shuffle(map.territories, rng).forEach((t, i) => {
    territories[t.id] = { owner: dealOrder[i % dealOrder.length]!.id, armies: 1 };
  });
  return {
    players,
    territories,
    orderRolls: {},
    currentPlayerIndex: 0,
    phase: "order",
    round: 0,
    pendingReinforcements: 0,
    fortified: {},
    winner: null,
  };
}

/** Jogadores que ainda precisam rolar o dado para decidir a ordem. */
export function playersToRollForOrder(state: GameState): PlayerId[] {
  if (state.phase !== "order") return [];
  return resolveOrder(
    state.players.map((p) => p.id),
    state.orderRolls,
  ).pending;
}

/**
 * Um jogador rola o dado para decidir a ordem de jogada. Quando a ordem fica definida,
 * os jogadores são reordenados e começa a rodada inicial (3 soldados para cada).
 */
export function rollForOrder(
  state: GameState,
  _map: GameMap,
  player: PlayerId,
  rng: Rng = Math.random,
): GameState {
  assertPhase(state, "order");
  if (!playersToRollForOrder(state).includes(player)) {
    throw new Error("Esse jogador não precisa rolar agora");
  }
  const next = structuredClone(state);
  next.orderRolls[player] = [...(next.orderRolls[player] ?? []), rollDie(rng)];
  const { order } = resolveOrder(
    next.players.map((p) => p.id),
    next.orderRolls,
  );
  if (order) {
    next.players = order.map((id) => next.players.find((p) => p.id === id)!);
    next.phase = "placement";
    next.currentPlayerIndex = 0;
    next.pendingReinforcements = INITIAL_ARMIES;
  }
  return next;
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

/** Reforço: 1 soldado a cada 2 estados + bônus de cada região dominada. */
export function reinforcementsFor(state: GameState, map: GameMap, player: PlayerId): number {
  const base = Math.floor(territoriesOf(state, player).length / TERRITORIES_PER_REINFORCEMENT);
  const bonus = map.regions
    .filter((r) => controlsRegion(state, map, player, r.id))
    .reduce((sum, r) => sum + r.bonus, 0);
  return base + bonus;
}

function assertPhase(state: GameState, ...phases: GameState["phase"][]): void {
  if (!phases.includes(state.phase)) throw new Error(`Ação inválida na fase "${state.phase}"`);
}

function assertOwnedByCurrent(state: GameState, id: TerritoryId): void {
  const territory = state.territories[id];
  if (!territory) throw new Error(`Estado desconhecido: ${id}`);
  if (territory.owner !== currentPlayer(state).id) {
    throw new Error("Esse estado não é do jogador da vez");
  }
}

/**
 * Começa o turno de um jogador. Na rodada 1 não há reforço (vai direto ao ataque);
 * a partir da rodada 2, começa pelo reforço.
 */
function startTurn(state: GameState, map: GameMap, index: number): GameState {
  state.currentPlayerIndex = index;
  state.fortified = {};
  state.pendingReinforcements =
    state.round >= 2 ? reinforcementsFor(state, map, state.players[index]!.id) : 0;
  state.phase = state.pendingReinforcements > 0 ? "reinforce" : "attack";
  return state;
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
  // Rodada inicial: passa para o próximo; depois do último, começa a rodada 1 (ataques).
  const following = state.currentPlayerIndex + 1;
  if (following < state.players.length) {
    next.currentPlayerIndex = following;
    next.pendingReinforcements = INITIAL_ARMIES;
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
  if (state.phase !== "attack" || !source || !target) return false;
  return (
    source.owner === currentPlayer(state).id &&
    target.owner !== source.owner &&
    source.armies > 1 &&
    attackPenalty(map, from, to) !== null
  );
}

/** Com quantos soldados (dados) dá para atacar a partir de um estado: até 3, deixando 1. */
export function maxAttackers(state: GameState, from: TerritoryId): number {
  return Math.min(MAX_ATTACK_DICE, (state.territories[from]?.armies ?? 0) - 1);
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
 * Um ataque com `soldiers` soldados (1 a 3, sempre deixando 1 na origem): cada soldado
 * é um dado. O defensor rola um dado por soldado, até 3. O maior vence; empate é da defesa.
 * Ataques navais sofrem penalidade nos dados do atacante.
 * Se conquistar, os soldados que atacaram e sobreviveram ocupam o estado.
 */
export function attack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  rng: Rng = Math.random,
  soldiers: number = maxAttackers(state, from),
): AttackOutcome {
  if (!canAttack(state, map, from, to)) throw new Error("Ataque inválido");
  if (!Number.isInteger(soldiers) || soldiers < 1 || soldiers > maxAttackers(state, from)) {
    throw new Error(`Ataque com 1 a ${maxAttackers(state, from)} soldados`);
  }
  const penalty = attackPenalty(map, from, to)!;
  const next = structuredClone(state);
  const source = next.territories[from]!;
  const target = next.territories[to]!;
  const defender = target.owner;

  const defenseDice = Math.min(MAX_DEFENSE_DICE, target.armies);
  const battle = compareRolls(rollDice(soldiers, rng), rollDice(defenseDice, rng), penalty);

  source.armies -= battle.attackerLosses;
  target.armies -= battle.defenderLosses;

  const conquered = target.armies === 0;
  let eliminated: PlayerId | null = null;
  if (conquered) {
    const survivors = soldiers - battle.attackerLosses;
    target.owner = source.owner;
    target.armies = survivors;
    source.armies -= survivors;
    if (territoriesOf(next, defender).length === 0) eliminated = defender;
    if (alivePlayers(next).length === 1) {
      next.winner = source.owner;
      next.phase = "finished";
    }
  }
  return { state: next, battle, conquered, naval: penalty > 0, eliminated };
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

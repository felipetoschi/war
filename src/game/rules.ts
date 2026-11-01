import {
  createDeck,
  hasValidSet,
  isValidSet,
  MAX_HAND,
  OWNED_CARD_BONUS,
  tradeValue,
} from "./cards";
import { compareRolls, rollDice, rollDie, type BattleResult } from "./dice";
import { areNeighbors } from "./map";
import { completedObjective, dealObjectives } from "./objectives";
import { resolveOrder } from "./order";
import type { Card, GameMap, GameState, Player, PlayerId, Rng, TerritoryId } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MAX_ATTACK_DICE = 3;
export const MAX_DEFENSE_DICE = 3;
/** Soldados que cada jogador posiciona na rodada inicial, antes dos ataques. */
export const INITIAL_ARMIES = 3;
/** A cada quantos estados o jogador ganha 1 soldado no reforço. */
export const TERRITORIES_PER_REINFORCEMENT = 2;
/** Mínimo de soldados no reforço, para quem tem poucos estados (antes do bônus de região). */
export const MIN_REINFORCEMENT = 3;
/** No remanejamento, no máximo quantos soldados vão de um estado para cada vizinho, por turno. */
export const MAX_FORTIFY_PER_NEIGHBOR = 3;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Cria uma partida: os 26 territórios são sorteados entre os jogadores (1 soldado em cada),
 * o mais igualmente possível, e o baralho de cartas é embaralhado.
 * Em seguida, os dados decidem a ordem de jogada (`rollForOrder`).
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
  const state: GameState = {
    players,
    objectives: {},
    eliminatedBy: {},
    winReason: null,
    hands: Object.fromEntries(players.map((p) => [p.id, []])),
    deck: shuffle(createDeck(map), rng),
    discard: [],
    trades: 0,
    battle: null,
    territories,
    orderRolls: {},
    currentPlayerIndex: 0,
    phase: "order",
    round: 0,
    pendingReinforcements: 0,
    placementLeft: {},
    fortified: {},
    fortifyMoves: {},
    conqueredThisTurn: false,
    winner: null,
  };
  dealObjectives(state, map, rng);
  return state;
}

// ---- ordem de jogada ----

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
    next.placementLeft = Object.fromEntries(next.players.map((p) => [p.id, INITIAL_ARMIES]));
  }
  return next;
}

// ---- consultas ----

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

/**
 * Reforço: 1 soldado a cada 2 estados (no mínimo 3) + bônus de cada região dominada.
 */
export function reinforcementsFor(state: GameState, map: GameMap, player: PlayerId): number {
  const base = Math.max(
    MIN_REINFORCEMENT,
    Math.floor(territoriesOf(state, player).length / TERRITORIES_PER_REINFORCEMENT),
  );
  const bonus = map.regions
    .filter((r) => controlsRegion(state, map, player, r.id))
    .reduce((sum, r) => sum + r.bonus, 0);
  return base + bonus;
}

/**
 * Vitória: o jogador vence ao cumprir qualquer um dos seus 2 objetivos (na sua vez)
 * ou ao ser o último jogador vivo.
 */
function checkVictory(state: GameState, map: GameMap, player: PlayerId): GameState {
  if (state.winner) return state;
  if (alivePlayers(state).length === 1 && territoriesOf(state, player).length > 0) {
    state.winner = player;
    state.winReason = "ultimo-vivo";
  } else {
    const objective = completedObjective(state, map, player);
    if (objective) {
      state.winner = player;
      state.winReason = objective.id;
    }
  }
  if (state.winner) {
    state.phase = "finished";
    state.battle = null;
    state.pendingReinforcements = 0;
  }
  return state;
}

function assertPhase(state: GameState, ...phases: GameState["phase"][]): void {
  if (!phases.includes(state.phase)) throw new Error(`Ação inválida na fase "${state.phase}"`);
  if (state.battle) throw new Error("Termine o ataque em andamento (rolar os dados)");
}

function assertOwnedByCurrent(state: GameState, id: TerritoryId): void {
  const territory = state.territories[id];
  if (!territory) throw new Error(`Estado desconhecido: ${id}`);
  if (territory.owner !== currentPlayer(state).id) {
    throw new Error("Esse estado não é do jogador da vez");
  }
}

// ---- turnos e reforço ----

/**
 * Começa o turno de um jogador. Na rodada 1 não há reforço (vai direto ao ataque);
 * a partir da rodada 2, começa pelo reforço (e pela troca de cartas, se houver).
 */
function startTurn(state: GameState, map: GameMap, index: number): GameState {
  const player = state.players[index]!.id;
  state.currentPlayerIndex = index;
  state.fortified = {};
  state.fortifyMoves = {};
  state.conqueredThisTurn = false;
  state.pendingReinforcements = state.round >= 2 ? reinforcementsFor(state, map, player) : 0;
  const canTrade = state.round >= 2 && hasValidSet(state.hands[player] ?? []);
  state.phase = state.pendingReinforcements > 0 || canTrade ? "reinforce" : "attack";
  return state;
}

export function mustTrade(state: GameState): boolean {
  return (state.hands[currentPlayer(state).id]?.length ?? 0) >= MAX_HAND;
}

/** Jogadores que ainda têm soldados a posicionar na rodada inicial. */
export function playersStillPlacing(state: GameState): PlayerId[] {
  if (state.phase !== "placement") return [];
  return state.players.filter((p) => (state.placementLeft[p.id] ?? 0) > 0).map((p) => p.id);
}

/**
 * Posiciona soldados na rodada inicial ou no reforço do turno.
 * Na rodada inicial todos posicionam ao mesmo tempo: o soldado vai para o dono do estado.
 * Quando o último termina, começa a rodada 1, na ordem sorteada.
 */
export function placeArmies(
  state: GameState,
  map: GameMap,
  territory: TerritoryId,
  amount: number,
): GameState {
  assertPhase(state, "placement", "reinforce");
  if (state.phase === "placement") return placeInitial(state, map, territory, amount);
  assertOwnedByCurrent(state, territory);
  if (state.phase === "reinforce" && mustTrade(state)) {
    throw new Error(`Com ${MAX_HAND} cartas ou mais, é obrigatório trocar antes`);
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > state.pendingReinforcements) {
    throw new Error("Quantidade de soldados inválida");
  }
  const next = structuredClone(state);
  next.territories[territory]!.armies += amount;
  next.pendingReinforcements -= amount;
  if (checkVictory(next, map, currentPlayer(next).id).winner) return next;
  if (next.pendingReinforcements === 0) next.phase = "attack";
  return next;
}

function placeInitial(
  state: GameState,
  map: GameMap,
  territory: TerritoryId,
  amount: number,
): GameState {
  const owner = state.territories[territory]?.owner;
  if (!owner) throw new Error(`Estado desconhecido: ${territory}`);
  const left = state.placementLeft[owner] ?? 0;
  if (left === 0) throw new Error("Esse jogador já colocou todos os seus soldados");
  if (!Number.isInteger(amount) || amount < 1 || amount > left) {
    throw new Error("Quantidade de soldados inválida");
  }
  const next = structuredClone(state);
  next.territories[territory]!.armies += amount;
  next.placementLeft[owner] = left - amount;
  if (playersStillPlacing(next).length > 0) return next;
  // Todos colocaram: começa a rodada 1 (ataques), na ordem sorteada.
  next.placementLeft = {};
  next.round = 1;
  return startTurn(next, map, 0);
}

/** Sem soldados a posicionar, o jogador pode dispensar a troca e ir para o ataque. */
export function skipReinforce(state: GameState): GameState {
  assertPhase(state, "reinforce");
  if (state.pendingReinforcements > 0) throw new Error("Posicione todos os soldados antes");
  if (mustTrade(state)) throw new Error(`Com ${MAX_HAND} cartas ou mais, é obrigatório trocar`);
  return { ...state, phase: "attack" };
}

export interface TradeOutcome {
  state: GameState;
  armies: number;
  /** Estados do jogador que estavam nas cartas e receberam +2 soldados. */
  bonusTerritories: TerritoryId[];
}

/**
 * Troca 3 cartas por soldados (no reforço). Cartas de estados que o jogador domina
 * dão +2 soldados direto nesses estados.
 */
export function tradeCards(state: GameState, map: GameMap, cardIds: string[]): TradeOutcome {
  assertPhase(state, "reinforce");
  const player = currentPlayer(state).id;
  const hand = state.hands[player] ?? [];
  const cards = cardIds.map((id) => hand.find((c) => c.id === id));
  if (new Set(cardIds).size !== 3 || cards.some((c) => !c)) {
    throw new Error("Escolha 3 cartas suas");
  }
  if (!isValidSet(cards as Card[])) {
    throw new Error("Troca inválida: 3 símbolos iguais ou 3 diferentes (coringa vale qualquer)");
  }
  const next = structuredClone(state);
  const armies = tradeValue(state.trades);
  next.trades++;
  next.pendingReinforcements += armies;
  next.hands[player] = hand.filter((c) => !cardIds.includes(c.id));
  next.discard.push(...(cards as Card[]));
  const bonusTerritories = (cards as Card[])
    .map((c) => c.territory)
    .filter((t): t is TerritoryId => t !== null && next.territories[t]?.owner === player);
  for (const t of bonusTerritories) next.territories[t]!.armies += OWNED_CARD_BONUS;
  checkVictory(next, map, player);
  return { state: next, armies, bonusTerritories };
}

// ---- ataque ----

/** Só dá para atacar estados que fazem divisa (fronteira terrestre). */
export function canAttack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
): boolean {
  const source = state.territories[from];
  const target = state.territories[to];
  if (state.phase !== "attack" || state.battle || !source || !target) return false;
  return (
    source.owner === currentPlayer(state).id &&
    target.owner !== source.owner &&
    source.armies > 1 &&
    areNeighbors(map, from, to)
  );
}

/** Com quantos soldados (dados) dá para atacar a partir de um estado: até 3, deixando 1. */
export function maxAttackers(state: GameState, from: TerritoryId): number {
  return Math.min(MAX_ATTACK_DICE, (state.territories[from]?.armies ?? 0) - 1);
}

/**
 * 1º passo do ataque: escolhe origem, alvo e com quantos soldados (1 a 3, deixando 1).
 * Depois o atacante rola (`rollAttack`) e o defensor rola (`rollDefense`).
 */
export function declareAttack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  soldiers: number,
): GameState {
  if (!canAttack(state, map, from, to)) throw new Error("Ataque inválido");
  const max = maxAttackers(state, from);
  if (!Number.isInteger(soldiers) || soldiers < 1 || soldiers > max) {
    throw new Error(`Ataque com 1 a ${max} soldados`);
  }
  const target = state.territories[to]!;
  return {
    ...state,
    battle: {
      from,
      to,
      attacker: currentPlayer(state).id,
      defender: target.owner,
      soldiers,
      defenseDice: Math.min(MAX_DEFENSE_DICE, target.armies),
      attackRolls: null,
    },
  };
}

/** Desiste do ataque declarado, antes de o atacante rolar. */
export function cancelAttack(state: GameState): GameState {
  if (!state.battle) throw new Error("Não há ataque em andamento");
  if (state.battle.attackRolls) throw new Error("O ataque já foi rolado");
  return { ...state, battle: null };
}

/** 2º passo: o atacante rola os dados vermelhos. */
export function rollAttack(state: GameState, rng: Rng = Math.random): GameState {
  const battle = state.battle;
  if (!battle) throw new Error("Não há ataque em andamento");
  if (battle.attackRolls) throw new Error("O ataque já foi rolado");
  return { ...state, battle: { ...battle, attackRolls: rollDice(battle.soldiers, rng) } };
}

export interface AttackOutcome {
  state: GameState;
  battle: BattleResult;
  conquered: boolean;
  /** Dono anterior, se foi eliminado com esta conquista. */
  eliminated: PlayerId | null;
}

/** Compra uma carta para o jogador; se o monte acabar, as cartas trocadas voltam embaralhadas. */
function drawCard(state: GameState, player: PlayerId, rng: Rng): Card | null {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffle(state.discard, rng);
    state.discard = [];
  }
  const card = state.deck.shift() ?? null;
  if (card) state.hands[player] = [...(state.hands[player] ?? []), card];
  return card;
}

/**
 * 3º passo: o defensor rola os dados amarelos e o combate é resolvido.
 * O maior dado vence; empate é da defesa. Ao conquistar, os soldados que atacaram e
 * sobreviveram ocupam o estado (e o atacante ganha uma carta no fim do turno).
 */
export function rollDefense(state: GameState, map: GameMap, rng: Rng = Math.random): AttackOutcome {
  const pending = state.battle;
  if (!pending?.attackRolls) throw new Error("O atacante precisa rolar primeiro");
  const next = structuredClone(state);
  next.battle = null;
  const source = next.territories[pending.from]!;
  const target = next.territories[pending.to]!;

  const battle = compareRolls(pending.attackRolls, rollDice(pending.defenseDice, rng));
  source.armies -= battle.attackerLosses;
  target.armies -= battle.defenderLosses;

  const conquered = target.armies === 0;
  let eliminated: PlayerId | null = null;
  if (conquered) {
    const survivors = pending.soldiers - battle.attackerLosses;
    target.owner = pending.attacker;
    target.armies = survivors;
    source.armies -= survivors;
    next.conqueredThisTurn = true;
    if (territoriesOf(next, pending.defender).length === 0) {
      eliminated = pending.defender;
      next.eliminatedBy[pending.defender] = pending.attacker;
      // Quem elimina um jogador fica com as cartas dele.
      next.hands[pending.attacker] = [
        ...(next.hands[pending.attacker] ?? []),
        ...(next.hands[pending.defender] ?? []),
      ];
      next.hands[pending.defender] = [];
    }
    checkVictory(next, map, pending.attacker);
  }
  return { state: next, battle, conquered, eliminated };
}

/** Ataque completo de uma vez (declara, rola ataque e defesa). Útil para testes. */
export function attack(
  state: GameState,
  map: GameMap,
  from: TerritoryId,
  to: TerritoryId,
  rng: Rng = Math.random,
  soldiers: number = maxAttackers(state, from),
): AttackOutcome {
  return rollDefense(rollAttack(declareAttack(state, map, from, to, soldiers), rng), map, rng);
}

export function endAttackPhase(state: GameState): GameState {
  assertPhase(state, "attack");
  return { ...state, phase: "fortify" };
}

// ---- remanejamento ----

/** Soldados de um estado que ainda podem ser remanejados neste turno. */
export function movableArmies(state: GameState, territory: TerritoryId): number {
  const armies = state.territories[territory]?.armies ?? 0;
  return Math.max(0, armies - 1 - (state.fortified[territory] ?? 0));
}

/** Quantos soldados ainda podem ir de `from` para o vizinho `to` neste turno (máx. 3). */
export function movableTo(state: GameState, from: TerritoryId, to: TerritoryId): number {
  const sent = state.fortifyMoves[`${from}>${to}`] ?? 0;
  return Math.max(0, Math.min(MAX_FORTIFY_PER_NEIGHBOR - sent, movableArmies(state, from)));
}

/**
 * Remanejamento: move soldados entre estados vizinhos do jogador da vez.
 * No máximo 3 soldados de um estado para cada vizinho por turno; fica sempre 1 soldado
 * na origem; e quem já foi remanejado não se move de novo no turno.
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
    throw new Error("Esses soldados não podem ser remanejados (fica pelo menos 1)");
  }
  if (amount > movableTo(state, from, to)) {
    throw new Error(`No máximo ${MAX_FORTIFY_PER_NEIGHBOR} soldados para cada vizinho por turno`);
  }
  const next = structuredClone(state);
  next.territories[from]!.armies -= amount;
  next.territories[to]!.armies += amount;
  next.fortified[to] = (next.fortified[to] ?? 0) + amount;
  next.fortifyMoves[`${from}>${to}`] = (next.fortifyMoves[`${from}>${to}`] ?? 0) + amount;
  return checkVictory(next, map, currentPlayer(next).id);
}

/**
 * Passa a vez para o próximo jogador ainda vivo. Como no War, quem conquistou pelo menos
 * um estado no turno ganha uma carta (no máximo uma por turno).
 */
export function endTurn(state: GameState, map: GameMap, rng: Rng = Math.random): GameState {
  assertPhase(state, "attack", "fortify");
  const next = structuredClone(state);
  if (next.conqueredThisTurn) drawCard(next, currentPlayer(next).id, rng);
  let index = state.currentPlayerIndex;
  do {
    index = (index + 1) % state.players.length;
    if (index === 0) next.round++;
  } while (territoriesOf(next, state.players[index]!.id).length === 0);
  return startTurn(next, map, index);
}

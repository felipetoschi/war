export type PlayerId = string;
export type TerritoryId = string;
export type RegionId = string;

/** Função que devolve um número em [0, 1). Injetável para testes determinísticos. */
export type Rng = () => number;

export interface Region {
  id: RegionId;
  name: string;
  /** Exércitos extras recebidos por quem domina a região inteira. */
  bonus: number;
  color: string;
}

export interface Territory {
  /** Sigla do estado em minúsculas (ex.: "sp"). */
  id: TerritoryId;
  name: string;
  region: RegionId;
  /** Estados com fronteira terrestre. */
  neighbors: TerritoryId[];
  /**
   * Posição do estado ao longo do litoral, de norte (AP = 0) a sul (RS = 16).
   * Ausente para estados sem litoral.
   */
  coastIndex?: number;
}

export interface GameMap {
  regions: Region[];
  territories: Territory[];
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
}

export interface TerritoryState {
  owner: PlayerId;
  armies: number;
}

/**
 * - order: estados já sorteados; cada jogador rola um dado para decidir quem começa
 * - placement: rodada inicial, cada jogador posiciona 3 soldados (sem ataques)
 * - reinforce / attack / fortify: fases de um turno (sem reforço na rodada 1)
 */
export type Phase = "order" | "placement" | "reinforce" | "attack" | "fortify" | "finished";

export type CardSymbol = "square" | "triangle" | "circle" | "joker";

export interface Card {
  id: string;
  /** Estado da carta (null no coringa). */
  territory: TerritoryId | null;
  symbol: CardSymbol;
}

/** Ataque declarado: o atacante rola os dados vermelhos, depois o defensor os amarelos. */
export interface PendingBattle {
  from: TerritoryId;
  to: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  /** Soldados (dados) do ataque: 1 a 3. */
  soldiers: number;
  /** Dados da defesa: 1 por soldado no estado atacado, até 3. */
  defenseDice: number;
  /** Dados do ataque, depois que o atacante rolou. */
  attackRolls: number[] | null;
}

export interface GameState {
  /** Jogadores na ordem de jogada (definida pelos dados na fase "order"). */
  players: Player[];
  /** Cartas de cada jogador — visíveis para todos. */
  hands: Record<PlayerId, Card[]>;
  /** Monte de compra (já embaralhado) e cartas já trocadas. */
  deck: Card[];
  discard: Card[];
  /** Quantas trocas já foram feitas na partida (o valor da troca cresce). */
  trades: number;
  battle: PendingBattle | null;
  territories: Partial<Record<TerritoryId, TerritoryState>>;
  /** Dados rolados por cada jogador para decidir a ordem (inclui desempates). */
  orderRolls: Partial<Record<PlayerId, number[]>>;
  currentPlayerIndex: number;
  phase: Phase;
  /** 0 durante a decisão da ordem e a rodada inicial; depois 1, 2, 3… */
  round: number;
  /** Soldados ainda a posicionar (rodada inicial ou reforço). */
  pendingReinforcements: number;
  /** Soldados que chegaram por remanejamento neste turno (não podem se mover de novo). */
  fortified: Partial<Record<TerritoryId, number>>;
  /** Soldados remanejados neste turno por par "origem>destino" (máximo 3 por vizinho). */
  fortifyMoves: Partial<Record<string, number>>;
  /** Conquistou algum estado neste turno? (dá direito a 1 carta no fim do turno) */
  conqueredThisTurn: boolean;
  winner: PlayerId | null;
}

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
 * - placement: rodada inicial, cada jogador posiciona seus soldados (sem ataques)
 * - reinforce / attack / fortify: fases de um turno normal
 */
export type Phase = "order" | "placement" | "reinforce" | "attack" | "fortify" | "finished";

/** Movimento obrigatório depois de conquistar um estado. */
export interface PendingMove {
  from: TerritoryId;
  to: TerritoryId;
  max: number;
}

export interface GameState {
  /** Jogadores na ordem de jogada (definida pelos dados na fase "order"). */
  players: Player[];
  territories: Partial<Record<TerritoryId, TerritoryState>>;
  /** Dados rolados por cada jogador para decidir a ordem (inclui desempates). */
  orderRolls: Partial<Record<PlayerId, number[]>>;
  currentPlayerIndex: number;
  phase: Phase;
  /** 0 durante a decisão da ordem e a rodada inicial; depois 1, 2, 3… */
  round: number;
  /** Soldados ainda a posicionar (rodada inicial ou reforço). */
  pendingReinforcements: number;
  pendingMove: PendingMove | null;
  /** Soldados que chegaram por remanejamento neste turno (não podem se mover de novo). */
  fortified: Partial<Record<TerritoryId, number>>;
  winner: PlayerId | null;
}

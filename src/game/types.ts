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

export type Objective =
  | { id: string; kind: "regions"; regions: RegionId[]; description: string }
  | {
      id: string;
      kind: "territories";
      count: number;
      minArmies: number;
      description: string;
    };

export interface TerritoryState {
  owner: PlayerId;
  armies: number;
}

export type Phase = "reinforce" | "attack" | "fortify" | "finished";

export interface GameState {
  players: Player[];
  /** Objetivo de cada jogador — abertos, todos podem ver. */
  objectives: Record<PlayerId, Objective>;
  territories: Record<TerritoryId, TerritoryState>;
  currentPlayerIndex: number;
  phase: Phase;
  turn: number;
  /** Exércitos ainda a posicionar na fase de reforço. */
  pendingReinforcements: number;
  winner: PlayerId | null;
}

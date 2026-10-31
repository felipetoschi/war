export type PlayerId = string;
export type TerritoryId = string;
export type ContinentId = string;

/** Função que devolve um número em [0, 1). Injetável para testes determinísticos. */
export type Rng = () => number;

export interface Continent {
  id: ContinentId;
  name: string;
  /** Exércitos extras recebidos por quem domina o continente inteiro. */
  bonus: number;
  color: string;
}

export interface Territory {
  id: TerritoryId;
  name: string;
  continent: ContinentId;
  neighbors: TerritoryId[];
  /** Posição no tabuleiro (coordenadas do SVG, 0–1000 x 0–600). */
  x: number;
  y: number;
}

export interface GameMap {
  continents: Continent[];
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

export type Phase = "reinforce" | "attack" | "fortify" | "finished";

export interface GameState {
  players: Player[];
  territories: Record<TerritoryId, TerritoryState>;
  currentPlayerIndex: number;
  phase: Phase;
  turn: number;
  /** Exércitos ainda a posicionar na fase de reforço. */
  pendingReinforcements: number;
  winner: PlayerId | null;
}

import type { GameMap, Territory } from "./types";

/**
 * Mapa do Brasil: 26 estados + Distrito Federal, agrupados nas 5 regiões.
 * `neighbors` são as fronteiras terrestres reais.
 * `coastIndex` ordena os 17 estados litorâneos de norte a sul.
 */
const territories: Territory[] = [
  // Norte
  { id: "ac", name: "Acre", region: "norte", neighbors: ["am", "ro"] },
  { id: "am", name: "Amazonas", region: "norte", neighbors: ["ac", "ro", "mt", "pa", "rr"] },
  { id: "rr", name: "Roraima", region: "norte", neighbors: ["am", "pa"] },
  { id: "ro", name: "Rondônia", region: "norte", neighbors: ["ac", "am", "mt"] },
  {
    id: "pa",
    name: "Pará",
    region: "norte",
    neighbors: ["am", "rr", "ap", "ma", "to", "mt"],
    coastIndex: 1,
  },
  { id: "ap", name: "Amapá", region: "norte", neighbors: ["pa"], coastIndex: 0 },
  { id: "to", name: "Tocantins", region: "norte", neighbors: ["pa", "ma", "pi", "ba", "go", "mt"] },

  // Nordeste
  { id: "ma", name: "Maranhão", region: "nordeste", neighbors: ["pa", "to", "pi"], coastIndex: 2 },
  {
    id: "pi",
    name: "Piauí",
    region: "nordeste",
    neighbors: ["ma", "to", "ba", "pe", "ce"],
    coastIndex: 3,
  },
  {
    id: "ce",
    name: "Ceará",
    region: "nordeste",
    neighbors: ["pi", "pe", "pb", "rn"],
    coastIndex: 4,
  },
  {
    id: "rn",
    name: "Rio Grande do Norte",
    region: "nordeste",
    neighbors: ["ce", "pb"],
    coastIndex: 5,
  },
  { id: "pb", name: "Paraíba", region: "nordeste", neighbors: ["rn", "ce", "pe"], coastIndex: 6 },
  {
    id: "pe",
    name: "Pernambuco",
    region: "nordeste",
    neighbors: ["pb", "ce", "pi", "ba", "al"],
    coastIndex: 7,
  },
  { id: "al", name: "Alagoas", region: "nordeste", neighbors: ["pe", "ba", "se"], coastIndex: 8 },
  { id: "se", name: "Sergipe", region: "nordeste", neighbors: ["al", "ba"], coastIndex: 9 },
  {
    id: "ba",
    name: "Bahia",
    region: "nordeste",
    neighbors: ["se", "al", "pe", "pi", "to", "go", "mg", "es"],
    coastIndex: 10,
  },

  // Centro-Oeste
  {
    id: "mt",
    name: "Mato Grosso",
    region: "centro-oeste",
    neighbors: ["ro", "am", "pa", "to", "go", "ms"],
  },
  {
    id: "ms",
    name: "Mato Grosso do Sul",
    region: "centro-oeste",
    neighbors: ["mt", "go", "mg", "sp", "pr"],
  },
  {
    id: "go",
    name: "Goiás",
    region: "centro-oeste",
    neighbors: ["mt", "to", "ba", "mg", "ms", "df"],
  },
  { id: "df", name: "Distrito Federal", region: "centro-oeste", neighbors: ["go", "mg"] },

  // Sudeste
  {
    id: "mg",
    name: "Minas Gerais",
    region: "sudeste",
    neighbors: ["ba", "go", "df", "ms", "sp", "rj", "es"],
  },
  {
    id: "es",
    name: "Espírito Santo",
    region: "sudeste",
    neighbors: ["ba", "mg", "rj"],
    coastIndex: 11,
  },
  {
    id: "rj",
    name: "Rio de Janeiro",
    region: "sudeste",
    neighbors: ["es", "mg", "sp"],
    coastIndex: 12,
  },
  {
    id: "sp",
    name: "São Paulo",
    region: "sudeste",
    neighbors: ["mg", "rj", "ms", "pr"],
    coastIndex: 13,
  },

  // Sul
  { id: "pr", name: "Paraná", region: "sul", neighbors: ["sp", "ms", "sc"], coastIndex: 14 },
  { id: "sc", name: "Santa Catarina", region: "sul", neighbors: ["pr", "rs"], coastIndex: 15 },
  { id: "rs", name: "Rio Grande do Sul", region: "sul", neighbors: ["sc"], coastIndex: 16 },
];

export const BRASIL_MAP: GameMap = {
  regions: [
    { id: "norte", name: "Norte", bonus: 5, color: "#4f9d69" },
    { id: "nordeste", name: "Nordeste", bonus: 5, color: "#e0a83a" },
    { id: "centro-oeste", name: "Centro-Oeste", bonus: 3, color: "#c7703a" },
    { id: "sudeste", name: "Sudeste", bonus: 3, color: "#5b7fc7" },
    { id: "sul", name: "Sul", bonus: 2, color: "#9b6fc0" },
  ],
  territories,
};

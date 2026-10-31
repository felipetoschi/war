import type { GameMap, Territory } from "./types";

/**
 * Mapa original do jogo: o arquipélago fictício de Aurora,
 * com 4 continentes e 20 territórios.
 */
const territories: Territory[] = [
  // Boreal (norte)
  {
    id: "geleira",
    name: "Geleira",
    continent: "boreal",
    x: 150,
    y: 80,
    neighbors: ["fiorde", "taiga"],
  },
  {
    id: "fiorde",
    name: "Fiorde",
    continent: "boreal",
    x: 300,
    y: 70,
    neighbors: ["geleira", "taiga", "aurora", "porto-sal"],
  },
  {
    id: "taiga",
    name: "Taiga",
    continent: "boreal",
    x: 210,
    y: 170,
    neighbors: ["geleira", "fiorde", "aurora", "planalto"],
  },
  {
    id: "aurora",
    name: "Aurora",
    continent: "boreal",
    x: 350,
    y: 180,
    neighbors: ["fiorde", "taiga", "planalto", "vale-verde"],
  },
  {
    id: "planalto",
    name: "Planalto",
    continent: "boreal",
    x: 260,
    y: 270,
    neighbors: ["taiga", "aurora", "vale-verde", "mangue"],
  },

  // Verdejante (leste)
  {
    id: "porto-sal",
    name: "Porto Sal",
    continent: "verdejante",
    x: 560,
    y: 90,
    neighbors: ["fiorde", "vale-verde", "bosque"],
  },
  {
    id: "vale-verde",
    name: "Vale Verde",
    continent: "verdejante",
    x: 520,
    y: 210,
    neighbors: ["aurora", "planalto", "porto-sal", "bosque", "cascata"],
  },
  {
    id: "bosque",
    name: "Bosque",
    continent: "verdejante",
    x: 680,
    y: 160,
    neighbors: ["porto-sal", "vale-verde", "cascata", "colinas"],
  },
  {
    id: "cascata",
    name: "Cascata",
    continent: "verdejante",
    x: 640,
    y: 290,
    neighbors: ["vale-verde", "bosque", "duna", "colinas"],
  },
  {
    id: "colinas",
    name: "Colinas",
    continent: "verdejante",
    x: 800,
    y: 240,
    neighbors: ["bosque", "cascata", "recife"],
  },

  // Árido (sul)
  {
    id: "mangue",
    name: "Mangue",
    continent: "arido",
    x: 230,
    y: 400,
    neighbors: ["planalto", "canion", "oasis"],
  },
  {
    id: "canion",
    name: "Cânion",
    continent: "arido",
    x: 360,
    y: 450,
    neighbors: ["mangue", "oasis", "duna", "salina"],
  },
  {
    id: "oasis",
    name: "Oásis",
    continent: "arido",
    x: 200,
    y: 520,
    neighbors: ["mangue", "canion", "salina"],
  },
  {
    id: "duna",
    name: "Duna",
    continent: "arido",
    x: 500,
    y: 400,
    neighbors: ["cascata", "canion", "salina", "laguna"],
  },
  {
    id: "salina",
    name: "Salina",
    continent: "arido",
    x: 400,
    y: 550,
    neighbors: ["canion", "oasis", "duna"],
  },

  // Coralina (sudeste)
  {
    id: "recife",
    name: "Recife",
    continent: "coralina",
    x: 880,
    y: 360,
    neighbors: ["colinas", "atol", "farol"],
  },
  {
    id: "laguna",
    name: "Laguna",
    continent: "coralina",
    x: 640,
    y: 450,
    neighbors: ["duna", "atol", "baia"],
  },
  {
    id: "atol",
    name: "Atol",
    continent: "coralina",
    x: 770,
    y: 420,
    neighbors: ["recife", "laguna", "baia", "farol"],
  },
  {
    id: "baia",
    name: "Baía",
    continent: "coralina",
    x: 700,
    y: 550,
    neighbors: ["laguna", "atol", "farol"],
  },
  {
    id: "farol",
    name: "Farol",
    continent: "coralina",
    x: 870,
    y: 520,
    neighbors: ["recife", "atol", "baia"],
  },
];

export const AURORA_MAP: GameMap = {
  continents: [
    { id: "boreal", name: "Boreal", bonus: 4, color: "#7fb3d5" },
    { id: "verdejante", name: "Verdejante", bonus: 4, color: "#82c99a" },
    { id: "arido", name: "Árido", bonus: 3, color: "#e3c07a" },
    { id: "coralina", name: "Coralina", bonus: 3, color: "#e89c9c" },
  ],
  territories,
};

export function getTerritory(map: GameMap, id: string): Territory {
  const territory = map.territories.find((t) => t.id === id);
  if (!territory) throw new Error(`Território desconhecido: ${id}`);
  return territory;
}

export function areNeighbors(map: GameMap, a: string, b: string): boolean {
  return getTerritory(map, a).neighbors.includes(b);
}

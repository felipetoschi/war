import brazil from "@svg-maps/brazil";

/**
 * Contornos dos estados: pacote @svg-maps/brazil, de Victor Cazanave (CC BY 4.0).
 * https://github.com/VictorCazanave/svg-maps
 */
interface SvgMap {
  viewBox: string;
  locations: { id: string; name: string; path: string }[];
}

const svgMap = brazil as SvgMap;

export const STATE_PATHS: Record<string, string> = Object.fromEntries(
  svgMap.locations.map((l) => [l.id, l.path]),
);

/** Área visível: o mapa original (613×639) com margem à direita para as legendas do Nordeste. */
export const VIEW_BOX = "0 0 690 639";

export interface Label {
  /** Onde fica o marcador de exércitos. */
  x: number;
  y: number;
  /** Se definido, o marcador fica fora do estado (no mar) e uma linha liga ao estado. */
  anchor?: { x: number; y: number };
}

export const LABELS: Record<string, Label> = {
  ac: { x: 62, y: 226 },
  am: { x: 150, y: 150 },
  rr: { x: 195, y: 62 },
  ap: { x: 345, y: 62 },
  pa: { x: 345, y: 160 },
  ro: { x: 170, y: 258 },
  to: { x: 405, y: 240 },
  ma: { x: 452, y: 168 },
  pi: { x: 486, y: 205 },
  ce: { x: 548, y: 160 },
  rn: { x: 650, y: 150, anchor: { x: 592, y: 172 } },
  pb: { x: 655, y: 188, anchor: { x: 600, y: 193 } },
  pe: { x: 655, y: 226, anchor: { x: 590, y: 212 } },
  al: { x: 650, y: 264, anchor: { x: 594, y: 234 } },
  se: { x: 630, y: 300, anchor: { x: 578, y: 250 } },
  ba: { x: 505, y: 300 },
  mt: { x: 285, y: 285 },
  ms: { x: 300, y: 410 },
  go: { x: 372, y: 350 },
  mg: { x: 455, y: 385 },
  es: { x: 580, y: 395, anchor: { x: 528, y: 390 } },
  rj: { x: 545, y: 470, anchor: { x: 500, y: 440 } },
  sp: { x: 395, y: 450 },
  pr: { x: 350, y: 480 },
  sc: { x: 365, y: 530 },
  rs: { x: 315, y: 585 },
};

/** Onde fica a etiqueta de cada região (nome e bônus), em áreas de mar ou fora do país. */
export const REGION_LABELS: Record<string, { x: number; y: number }> = {
  norte: { x: 75, y: 40 },
  nordeste: { x: 610, y: 100 },
  "centro-oeste": { x: 150, y: 420 },
  sudeste: { x: 615, y: 515 },
  sul: { x: 205, y: 572 },
};

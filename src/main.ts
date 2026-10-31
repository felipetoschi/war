import "./style.css";
import { AURORA_MAP, getTerritory } from "./game/map";
import {
  attack,
  canAttack,
  createGame,
  currentPlayer,
  endAttackPhase,
  endTurn,
  fortify,
  placeArmies,
  territoriesOf,
} from "./game/rules";
import type { GameState, Player, TerritoryId } from "./game/types";

const PLAYERS: Player[] = [
  { id: "p1", name: "Vermelho", color: "#c0392b" },
  { id: "p2", name: "Azul", color: "#2471a3" },
  { id: "p3", name: "Verde", color: "#1e8449" },
];

const PHASE_LABEL: Record<GameState["phase"], string> = {
  reinforce: "Reforço",
  attack: "Ataque",
  fortify: "Remanejamento",
  finished: "Fim de jogo",
};

let state = createGame(AURORA_MAP, PLAYERS);
let selected: TerritoryId | null = null;
const log: string[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;
const name = (id: TerritoryId) => getTerritory(AURORA_MAP, id).name;
const playerById = (id: string) => state.players.find((p) => p.id === id)!;

function addLog(message: string) {
  log.unshift(message);
  if (log.length > 50) log.pop();
}

function onTerritoryClick(id: TerritoryId) {
  const me = currentPlayer(state).id;
  const owner = state.territories[id]!.owner;
  try {
    switch (state.phase) {
      case "reinforce":
        state = placeArmies(state, id, 1);
        break;
      case "attack":
        if (owner === me) {
          selected = selected === id ? null : id;
        } else if (selected && canAttack(state, AURORA_MAP, selected, id)) {
          const result = attack(state, AURORA_MAP, selected, id);
          state = result.state;
          const { attackRolls, defenseRolls } = result.battle;
          addLog(
            `${name(selected)} ⚔ ${name(id)}: [${attackRolls.join(", ")}] x [${defenseRolls.join(", ")}]` +
              (result.conquered ? " — conquistado!" : ""),
          );
          if (result.conquered || state.territories[selected]!.armies < 2) selected = null;
        }
        break;
      case "fortify":
        if (owner !== me) break;
        if (selected && selected !== id) {
          state = fortify(state, AURORA_MAP, selected, id, 1);
          if (state.territories[selected]!.armies < 2) selected = null;
        } else {
          selected = selected === id ? null : id;
        }
        break;
      case "finished":
        break;
    }
  } catch (error) {
    addLog(`⚠ ${(error as Error).message}`);
  }
  render();
}

function renderBoard(): string {
  const drawn = new Set<string>();
  const links = AURORA_MAP.territories
    .flatMap((t) =>
      t.neighbors.map((n) => {
        const key = [t.id, n].sort().join("|");
        if (drawn.has(key)) return "";
        drawn.add(key);
        const o = getTerritory(AURORA_MAP, n);
        return `<line class="link" x1="${t.x}" y1="${t.y}" x2="${o.x}" y2="${o.y}" />`;
      }),
    )
    .join("");

  const nodes = AURORA_MAP.territories
    .map((t) => {
      const ts = state.territories[t.id]!;
      const continent = AURORA_MAP.continents.find((c) => c.id === t.continent)!;
      return `
        <g class="territory ${selected === t.id ? "selected" : ""}" data-id="${t.id}">
          <circle class="land" cx="${t.x}" cy="${t.y}" r="30" fill="${playerById(ts.owner).color}" stroke="${continent.color}" />
          <text x="${t.x}" y="${t.y + 6}" font-size="18">${ts.armies}</text>
          <text class="name" x="${t.x}" y="${t.y + 50}">${t.name}</text>
        </g>`;
    })
    .join("");

  return `<svg class="board" viewBox="0 0 1000 620" role="img" aria-label="Tabuleiro">${links}${nodes}</svg>`;
}

function renderPanel(): string {
  const player = currentPlayer(state);
  const hint = {
    reinforce: `Clique nos seus territórios para posicionar ${state.pendingReinforcements} exército(s).`,
    attack: "Selecione um território seu e depois um vizinho inimigo para atacar.",
    fortify: "Selecione a origem e clique num vizinho seu para mover 1 exército.",
    finished: `🏆 ${state.winner ? playerById(state.winner).name : ""} dominou o mundo!`,
  }[state.phase];

  const scoreboard = state.players
    .map(
      (p) =>
        `<div class="player"><span class="swatch" style="background:${p.color}"></span>${p.name}: ${territoriesOf(state, p.id).length} territórios</div>`,
    )
    .join("");

  return `
    <aside class="panel">
      <h1>Domínio</h1>
      <div class="player"><span class="swatch" style="background:${player.color}"></span>Vez de ${player.name} · rodada ${state.turn}</div>
      <strong>Fase: ${PHASE_LABEL[state.phase]}</strong>
      <p>${hint}</p>
      <button id="next" ${state.phase === "reinforce" || state.phase === "finished" ? "disabled" : ""}>
        ${state.phase === "attack" ? "Encerrar ataques" : "Passar a vez"}
      </button>
      <button id="restart">Nova partida</button>
      ${scoreboard}
      <ul class="log">${log.map((l) => `<li>${l}</li>`).join("")}</ul>
    </aside>`;
}

function render() {
  app.innerHTML = `<main>${renderBoard()}</main>${renderPanel()}`;
  app
    .querySelectorAll<SVGGElement>(".territory")
    .forEach((el) => el.addEventListener("click", () => onTerritoryClick(el.dataset.id!)));
  app.querySelector("#next")?.addEventListener("click", () => {
    selected = null;
    state = state.phase === "attack" ? endAttackPhase(state) : endTurn(state, AURORA_MAP);
    render();
  });
  app.querySelector("#restart")?.addEventListener("click", () => {
    state = createGame(AURORA_MAP, PLAYERS);
    selected = null;
    log.length = 0;
    render();
  });
}

render();

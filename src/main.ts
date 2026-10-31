import "./style.css";
import { BRASIL_MAP } from "./game/brasil";
import { getTerritory } from "./game/map";
import { objectiveProgress } from "./game/objectives";
import {
  attack,
  attackPenalty,
  canAttack,
  createGame,
  currentPlayer,
  endAttackPhase,
  endTurn,
  fortify,
  MAX_PLAYERS,
  MIN_PLAYERS,
  placeArmies,
  territoriesOf,
} from "./game/rules";
import type { GameState, Player, TerritoryId } from "./game/types";
import { LABELS, STATE_PATHS, VIEW_BOX } from "./ui/brasil-svg";

const ALL_PLAYERS: Player[] = [
  { id: "p1", name: "Vermelho", color: "#d63c31" },
  { id: "p2", name: "Azul", color: "#2f6fd6" },
  { id: "p3", name: "Verde", color: "#1f9a52" },
  { id: "p4", name: "Amarelo", color: "#e3b021" },
  { id: "p5", name: "Roxo", color: "#8e44ad" },
];

const PHASE_LABEL: Record<GameState["phase"], string> = {
  reinforce: "Reforço",
  attack: "Ataque",
  fortify: "Remanejamento",
  finished: "Fim de jogo",
};

const map = BRASIL_MAP;
let playerCount = 3;
let state = createGame(map, ALL_PLAYERS.slice(0, playerCount));
let selected: TerritoryId | null = null;
const log: string[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;
const sigla = (id: TerritoryId) => id.toUpperCase();
const playerById = (id: string) => state.players.find((p) => p.id === id)!;

function addLog(message: string) {
  log.unshift(message);
  if (log.length > 50) log.pop();
}

function newGame() {
  state = createGame(map, ALL_PLAYERS.slice(0, playerCount));
  selected = null;
  log.length = 0;
  render();
}

function onTerritoryClick(id: TerritoryId) {
  const me = currentPlayer(state).id;
  const owner = state.territories[id]!.owner;
  try {
    switch (state.phase) {
      case "reinforce":
        state = placeArmies(state, map, id, 1);
        break;
      case "attack":
        if (owner === me) {
          selected = selected === id ? null : id;
        } else if (selected && canAttack(state, map, selected, id)) {
          const from = selected;
          const result = attack(state, map, from, id);
          state = result.state;
          const { attackRolls, effectiveAttackRolls, defenseRolls, attackPenalty } = result.battle;
          const dice =
            attackPenalty > 0
              ? `[${attackRolls.join(", ")}] −${attackPenalty} → [${effectiveAttackRolls.join(", ")}]`
              : `[${attackRolls.join(", ")}]`;
          addLog(
            `${sigla(from)} ${result.naval ? "⚓" : "⚔"} ${sigla(id)}: ${dice} x [${defenseRolls.join(", ")}]` +
              (result.conquered ? " — conquistado!" : ""),
          );
          if (result.conquered || state.territories[from]!.armies < 2) selected = null;
        }
        break;
      case "fortify":
        if (owner !== me) break;
        if (selected && selected !== id) {
          state = fortify(state, map, selected, id, 1);
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
  const targets = new Map<TerritoryId, number>();
  if (selected && state.phase === "attack") {
    for (const t of map.territories) {
      if (canAttack(state, map, selected, t.id))
        targets.set(t.id, attackPenalty(map, selected, t.id)!);
    }
  }

  const states = map.territories
    .map((t) => {
      const ts = state.territories[t.id]!;
      const classes = ["state"];
      if (selected === t.id) classes.push("selected");
      if (targets.has(t.id)) classes.push(targets.get(t.id)! > 0 ? "target-naval" : "target");
      return `<path class="${classes.join(" ")}" data-id="${t.id}" d="${STATE_PATHS[t.id]}" fill="${playerById(ts.owner).color}"><title>${t.name}</title></path>`;
    })
    .join("");

  const labels = map.territories
    .map((t) => {
      const { x, y, anchor } = LABELS[t.id]!;
      const ts = state.territories[t.id]!;
      const penalty = targets.get(t.id);
      const leader = anchor
        ? `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${x}" y2="${y}" /><circle class="anchor" cx="${anchor.x}" cy="${anchor.y}" r="2" />`
        : "";
      const penaltyTag = penalty
        ? `<text class="penalty" x="${x + 14}" y="${y - 10}">−${penalty}</text>`
        : "";
      return `
        <g class="label" data-id="${t.id}">
          ${leader}
          <circle class="badge" cx="${x}" cy="${y}" r="11" fill="${playerById(ts.owner).color}" />
          <text class="armies" x="${x}" y="${y + 4}">${ts.armies}</text>
          <text class="sigla" x="${x}" y="${y + 22}">${sigla(t.id)}</text>
          ${penaltyTag}
        </g>`;
    })
    .join("");

  return `<svg class="board" viewBox="${VIEW_BOX}" role="img" aria-label="Mapa do Brasil">${states}${labels}</svg>`;
}

function renderPanel(): string {
  const player = currentPlayer(state);
  const hint = {
    reinforce: `Clique nos seus estados para posicionar ${state.pendingReinforcements} exército(s).`,
    attack:
      "Selecione um estado seu e clique num inimigo. Por terra: estados vizinhos. Por mar (⚓): litoral com litoral, com penalidade nos dados.",
    fortify: "Selecione a origem e clique num vizinho seu para mover 1 exército.",
    finished: `🏆 ${state.winner ? playerById(state.winner).name : ""} venceu!`,
  }[state.phase];

  const players = state.players
    .map((p) => {
      const objective = state.objectives[p.id]!;
      const { done, total } = objectiveProgress(state, map, p.id, objective);
      const count = territoriesOf(state, p.id).length;
      return `
        <li class="${p.id === player.id ? "current" : ""} ${count === 0 ? "out" : ""}">
          <div class="player"><span class="swatch" style="background:${p.color}"></span>${p.name} · ${count} estados</div>
          <div class="objective">🎯 ${objective.description} <b>${done}/${total}</b></div>
        </li>`;
    })
    .join("");

  const regions = map.regions
    .map((r) => `<li><span>${r.name}</span><b>+${r.bonus}</b></li>`)
    .join("");

  const selectedInfo = selected
    ? `<p>Selecionado: <b>${getTerritory(map, selected).name}</b></p>`
    : "";

  return `
    <aside class="panel">
      <h1>Domínio · Brasil</h1>
      <div class="player"><span class="swatch" style="background:${player.color}"></span>Vez de ${player.name} · rodada ${state.turn}</div>
      <strong>Fase: ${PHASE_LABEL[state.phase]}</strong>
      <p>${hint}</p>
      ${selectedInfo}
      <button id="next" ${state.phase === "reinforce" || state.phase === "finished" ? "disabled" : ""}>
        ${state.phase === "attack" ? "Encerrar ataques" : "Passar a vez"}
      </button>
      <h2>Objetivos (abertos)</h2>
      <ul class="players">${players}</ul>
      <h2>Bônus por região</h2>
      <ul class="regions">${regions}</ul>
      <div class="new-game">
        <label>Jogadores
          <select id="player-count">
            ${Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
              .map((n) => `<option ${n === playerCount ? "selected" : ""}>${n}</option>`)
              .join("")}
          </select>
        </label>
        <button id="restart">Nova partida</button>
      </div>
      <ul class="log">${log.map((l) => `<li>${l}</li>`).join("")}</ul>
      <p class="credits">Mapa: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps</a> (CC BY 4.0)</p>
    </aside>`;
}

function render() {
  app.innerHTML = `<main>${renderBoard()}</main>${renderPanel()}`;
  app
    .querySelectorAll<SVGElement>("[data-id]")
    .forEach((el) => el.addEventListener("click", () => onTerritoryClick(el.dataset.id!)));
  app.querySelector("#next")?.addEventListener("click", () => {
    selected = null;
    state = state.phase === "attack" ? endAttackPhase(state) : endTurn(state, map);
    render();
  });
  app.querySelector<HTMLSelectElement>("#player-count")?.addEventListener("change", (e) => {
    playerCount = Number((e.target as HTMLSelectElement).value);
  });
  app.querySelector("#restart")?.addEventListener("click", newGame);
}

render();

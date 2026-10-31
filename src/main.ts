import "./style.css";
import { BRASIL_MAP } from "./game/brasil";
import type { BattleResult } from "./game/dice";
import { rollDie } from "./game/dice";
import { getTerritory } from "./game/map";
import { resolveOrder, type OrderRolls } from "./game/order";
import {
  alivePlayers,
  attack,
  attackPenalty,
  canAttack,
  claimTerritory,
  createGame,
  currentPlayer,
  endAttackPhase,
  endTurn,
  fortify,
  MAX_PLAYERS,
  MIN_PLAYERS,
  movableArmies,
  moveAfterConquest,
  placeArmies,
  territoriesOf,
} from "./game/rules";
import type { GameState, Player, TerritoryId } from "./game/types";
import {
  toggleFullscreen,
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
} from "./ui/fullscreen";
import { LABELS, STATE_PATHS, VIEW_BOX } from "./ui/brasil-svg";

const map = BRASIL_MAP;
const COLORS = ["#d63c31", "#2f6fd6", "#1f9a52", "#e3b021", "#8e44ad"];
const UNCLAIMED = "#c9d3dd";
const CREDITS = `<p class="credits">Mapa: <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener">svg-maps</a> (CC BY 4.0)</p>`;

type Screen = "players" | "order" | "game";

interface LastBattle {
  from: TerritoryId;
  to: TerritoryId;
  battle: BattleResult;
  naval: boolean;
}

// ---- estado da interface ----
let screen: Screen = "players";
let playerCount = 3;
const names: string[] = Array.from({ length: MAX_PLAYERS }, () => "");
let setupPlayers: Player[] = [];
let orderRolls: OrderRolls = {};
let state: GameState | null = null;
let selected: TerritoryId | null = null;
let placeAmount: number | "all" = 1;
let lastBattle: LastBattle | null = null;
const log: string[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;

// ---- utilitários ----
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const sigla = (id: TerritoryId) => id.toUpperCase();
const stateName = (id: TerritoryId) => getTerritory(map, id).name;
const playerById = (id: string) => setupPlayers.find((p) => p.id === id)!;
const swatch = (p: Player) => `<span class="swatch" style="background:${p.color}"></span>`;
const playerTag = (p: Player) => `${swatch(p)}<b>${escapeHtml(p.name)}</b>`;
const die = (value: number, kind: "attack" | "defense" | "neutral", note = "") =>
  `<span class="die ${kind}" ${note ? `title="${note}"` : ""}>${value}</span>`;

function addLog(message: string) {
  log.unshift(message);
  if (log.length > 60) log.pop();
}

function resetToSetup() {
  screen = "players";
  state = null;
  selected = null;
  lastBattle = null;
  orderRolls = {};
  log.length = 0;
}

// ---- telas de preparação ----
function renderPlayersScreen(): string {
  const options = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS)
    .map(
      (n) =>
        `<button class="chip ${n === playerCount ? "active" : ""}" data-count="${n}">${n}</button>`,
    )
    .join("");
  const inputs = Array.from({ length: playerCount }, (_, i) => {
    return `
      <label class="name-input">
        <span class="swatch" style="background:${COLORS[i]}"></span>
        <input data-name="${i}" maxlength="16" placeholder="Jogador ${i + 1}" value="${escapeHtml(names[i]!)}" />
      </label>`;
  }).join("");

  return `
    <section class="card setup">
      <h2>1. Quantos jogadores?</h2>
      <div class="chips">${options}</div>
      <h2>2. Nome dos jogadores</h2>
      <div class="names">${inputs}</div>
      <button id="to-order" class="primary">Continuar: sortear a ordem 🎲</button>
    </section>`;
}

function renderOrderScreen(): string {
  const ids = setupPlayers.map((p) => p.id);
  const { pending, order } = resolveOrder(ids, orderRolls);
  const position = order ? new Map(order.map((id, i) => [id, i + 1])) : null;
  const tiebreak = pending.some((id) => (orderRolls[id]?.length ?? 0) > 0);

  const rows = setupPlayers
    .map((p) => {
      const rolls = orderRolls[p.id] ?? [];
      const dice = rolls.map((v, i) => die(v, "neutral", i > 0 ? "desempate" : "")).join("");
      const action = pending.includes(p.id)
        ? `<button class="roll" data-roll="${p.id}">🎲 Rolar</button>`
        : "";
      const place = position ? `<span class="place">${position.get(p.id)}º</span>` : "";
      return `<li>${place}<span class="who">${playerTag(p)}</span><span class="dice">${dice}</span>${action}</li>`;
    })
    .join("");

  const message = order
    ? `Ordem definida! ${playerTag(playerById(order[0]!))} começa.`
    : tiebreak
      ? "Empate! Os jogadores empatados rolam de novo."
      : "Cada jogador rola um dado. Quem tirar o maior número começa.";

  return `
    <section class="card setup">
      <h2>3. Quem começa?</h2>
      <p>${message}</p>
      <ul class="order">${rows}</ul>
      ${
        order
          ? `<button id="start" class="primary">Começar: escolher os estados</button>`
          : `<button id="roll-all">🎲 Rolar para todos</button>`
      }
      <button id="back" class="link">← Voltar</button>
    </section>`;
}

// ---- jogo ----
function onTerritoryClick(id: TerritoryId) {
  if (!state) return;
  const owner = state.territories[id]?.owner;
  const me = currentPlayer(state).id;
  try {
    switch (state.phase) {
      case "claim": {
        const player = currentPlayer(state);
        state = claimTerritory(state, map, id);
        addLog(`${escapeHtml(player.name)} escolheu ${stateName(id)}`);
        break;
      }
      case "placement":
      case "reinforce": {
        const amount =
          placeAmount === "all"
            ? state.pendingReinforcements
            : Math.min(placeAmount, state.pendingReinforcements);
        state = placeArmies(state, map, id, amount);
        break;
      }
      case "attack":
        if (state.pendingMove) break;
        if (owner === me) {
          if (selected === id) selected = null;
          else if (state.territories[id]!.armies > 1) selected = id;
          else addLog("⚠ Para atacar, o estado precisa de pelo menos 2 soldados");
        } else if (selected && canAttack(state, map, selected, id)) {
          doAttack(selected, id);
        }
        break;
      case "fortify":
        if (owner !== me) break;
        if (selected && selected !== id && getTerritory(map, selected).neighbors.includes(id)) {
          state = fortify(state, map, selected, id, 1);
          if (movableArmies(state, selected) === 0) selected = null;
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

function doAttack(from: TerritoryId, to: TerritoryId) {
  if (!state) return;
  const attacker = currentPlayer(state);
  const defender = playerById(state.territories[to]!.owner);
  const result = attack(state, map, from, to);
  state = result.state;
  lastBattle = { from, to, battle: result.battle, naval: result.naval };
  const { attackerLosses, defenderLosses } = result.battle;
  addLog(
    `${sigla(from)} ${result.naval ? "⚓" : "⚔"} ${sigla(to)}: ataque perdeu ${attackerLosses}, defesa perdeu ${defenderLosses}` +
      (result.conquered ? ` — ${stateName(to)} conquistado!` : ""),
  );
  if (result.eliminated) {
    addLog(`☠ ${escapeHtml(defender.name)} foi eliminado por ${escapeHtml(attacker.name)}!`);
  }
  if (result.conquered || state.territories[from]!.armies < 2) selected = null;
}

function renderBoard(game: GameState): string {
  const targets = new Map<TerritoryId, number>();
  if (selected && game.phase === "attack") {
    for (const t of map.territories) {
      if (canAttack(game, map, selected, t.id)) {
        targets.set(t.id, attackPenalty(map, selected, t.id)!);
      }
    }
  }
  const fortifyTargets = new Set<TerritoryId>();
  if (selected && game.phase === "fortify" && movableArmies(game, selected) > 0) {
    for (const n of getTerritory(map, selected).neighbors) {
      if (game.territories[n]?.owner === currentPlayer(game).id) fortifyTargets.add(n);
    }
  }

  const states = map.territories
    .map((t) => {
      const ts = game.territories[t.id];
      const classes = ["state"];
      if (!ts) classes.push(game.phase === "claim" ? "free" : "unclaimed");
      if (selected === t.id) classes.push("selected");
      if (targets.has(t.id)) classes.push(targets.get(t.id)! > 0 ? "target-naval" : "target");
      if (fortifyTargets.has(t.id)) classes.push("target");
      const fill = ts ? playerById(ts.owner).color : UNCLAIMED;
      return `<path class="${classes.join(" ")}" data-id="${t.id}" d="${STATE_PATHS[t.id]}" fill="${fill}"><title>${t.name}</title></path>`;
    })
    .join("");

  const labels = map.territories
    .map((t) => {
      const { x, y, anchor } = LABELS[t.id]!;
      const ts = game.territories[t.id];
      const penalty = targets.get(t.id);
      const leader = anchor
        ? `<line class="leader" x1="${anchor.x}" y1="${anchor.y}" x2="${x}" y2="${y}" /><circle class="anchor" cx="${anchor.x}" cy="${anchor.y}" r="2" />`
        : "";
      const badge = ts
        ? `<circle class="badge" cx="${x}" cy="${y}" r="13" fill="${playerById(ts.owner).color}" />
           <text class="armies" x="${x}" y="${y + 4.5}">${ts.armies}</text>`
        : `<circle class="badge empty" cx="${x}" cy="${y}" r="9" />`;
      const penaltyTag = penalty
        ? `<text class="penalty" x="${x + 15}" y="${y + 4}">−${penalty}</text>`
        : "";
      return `
        <g class="label" data-id="${t.id}">
          <circle class="hit" cx="${x}" cy="${y + 6}" r="20" />
          ${leader}${badge}
          <text class="sigla" x="${x}" y="${y + 24}">${sigla(t.id)}</text>
          ${penaltyTag}
        </g>`;
    })
    .join("");

  return `<svg class="board" viewBox="${VIEW_BOX}" role="img" aria-label="Mapa do Brasil">${states}${labels}</svg>`;
}

function renderPhase(game: GameState): string {
  const player = currentPlayer(game);
  const who = playerTag(player);
  const amountChips = () => {
    const options: (number | "all")[] = [1, 3, "all"];
    return `<div class="chips small">Colocar por clique:
      ${options
        .map(
          (o) =>
            `<button class="chip ${o === placeAmount ? "active" : ""}" data-amount="${o}">${o === "all" ? "Todos" : o}</button>`,
        )
        .join("")}</div>`;
  };

  switch (game.phase) {
    case "claim": {
      const left = map.territories.length - Object.keys(game.territories).length;
      return `
        <h2>Escolha dos estados</h2>
        <p>${who}, escolha um estado livre no mapa.</p>
        <p class="muted">Faltam ${left} estados. Cada estado escolhido recebe 1 soldado.</p>`;
    }
    case "placement":
      return `
        <h2>Rodada inicial</h2>
        <p>${who}, posicione <b>${game.pendingReinforcements}</b> soldado(s) nos seus estados.</p>
        <p class="muted">Metade dos seus estados (mínimo 3) + bônus de região. Nesta rodada ninguém ataca.</p>
        ${amountChips()}`;
    case "reinforce":
      return `
        <h2>Rodada ${game.round} · Reforço</h2>
        <p>${who}, posicione <b>${game.pendingReinforcements}</b> soldado(s) nos seus estados.</p>
        ${amountChips()}`;
    case "attack": {
      if (game.pendingMove) {
        const { to, max } = game.pendingMove;
        const buttons = Array.from(
          { length: max },
          (_, i) => `<button class="chip" data-move="${i + 1}">${i + 1}</button>`,
        ).join("");
        return `
          <h2>Rodada ${game.round} · Conquista!</h2>
          <p>${who}, quantos soldados mover para <b>${stateName(to)}</b>?</p>
          <div class="chips">${buttons}</div>`;
      }
      const info = selected
        ? `<p>Atacando de <b>${stateName(selected)}</b> (${game.territories[selected]!.armies} soldados). Clique num inimigo destacado.</p>`
        : `<p class="muted">Selecione um estado seu com 2+ soldados. Por terra: vizinhos. Por mar ⚓: litoral com litoral, com penalidade nos dados.</p>`;
      return `
        <h2>Rodada ${game.round} · Ataque</h2>
        <p>Vez de ${who}.</p>
        ${info}
        <button id="end-attack" class="primary">Encerrar ataques</button>`;
    }
    case "fortify": {
      const info = selected
        ? `<p>Remanejando de <b>${stateName(selected)}</b> (${movableArmies(game, selected)} disponível). Clique num vizinho seu.</p>`
        : `<p class="muted">Selecione um estado seu e clique num vizinho seu para mover 1 soldado. Soldado remanejado não se move de novo neste turno.</p>`;
      return `
        <h2>Rodada ${game.round} · Remanejamento</h2>
        <p>Vez de ${who}.</p>
        ${info}
        <button id="end-turn" class="primary">Passar a vez</button>`;
    }
    case "finished":
      return `
        <h2>🏆 Fim de jogo</h2>
        <p>${playerTag(playerById(game.winner!))} é o último jogador vivo e venceu!</p>
        <button id="new-game" class="primary">Nova partida</button>`;
  }
}

function renderBattle(): string {
  if (!lastBattle) return "";
  const { from, to, battle, naval } = lastBattle;
  const attackDice = battle.attackRolls
    .map((v, i) => {
      const eff = battle.effectiveAttackRolls[i]!;
      return eff !== v ? `${die(eff, "attack", `tirou ${v}`)}<sub>${v}</sub>` : die(v, "attack");
    })
    .join("");
  const defenseDice = battle.defenseRolls.map((v) => die(v, "defense")).join("");
  return `
    <div class="battle">
      <div class="battle-title">${sigla(from)} ${naval ? "⚓" : "⚔"} ${sigla(to)}${naval ? ` <span class="muted">(−${battle.attackPenalty} por mar)</span>` : ""}</div>
      <div class="battle-row"><span>Ataque</span>${attackDice}</div>
      <div class="battle-row"><span>Defesa</span>${defenseDice}</div>
    </div>`;
}

function renderPanel(game: GameState): string {
  const alive = new Set(alivePlayers(game).map((p) => p.id));
  const current = currentPlayer(game).id;
  const players = game.players
    .map((p) => {
      const owned = territoriesOf(game, p.id);
      const armies = owned.reduce((sum, id) => sum + game.territories[id]!.armies, 0);
      const out = game.phase !== "claim" && !alive.has(p.id);
      return `<li class="${p.id === current && game.phase !== "finished" ? "current" : ""} ${out ? "out" : ""}">
        ${playerTag(p)} <span class="muted">${owned.length} estados · ${armies} soldados</span></li>`;
    })
    .join("");
  const regions = map.regions
    .map((r) => `<li><span>${r.name}</span><b>+${r.bonus}</b></li>`)
    .join("");

  return `
    <aside class="panel">
      <section class="panel-main">
        ${renderPhase(game)}
        ${renderBattle()}
      </section>
      <section class="panel-side">
      <h3>Jogadores <span class="muted">(ordem de jogada)</span></h3>
      <ul class="players">${players}</ul>
      <p class="muted">🎯 Objetivo: ser o último jogador vivo.</p>
      <h3>Bônus por região</h3>
      <ul class="regions">${regions}</ul>
      <ul class="log">${log.map((l) => `<li>${l}</li>`).join("")}</ul>
      <button id="quit" class="link">Nova partida</button>
      ${CREDITS}
      </section>
    </aside>`;
}

// ---- render principal ----
function renderHeader(): string {
  const fsButton = fullscreenSupported()
    ? `<button id="fullscreen" class="icon" title="Tela cheia">${isFullscreen() ? "🗗 Sair da tela cheia" : "⛶ Tela cheia"}</button>`
    : "";
  return `<header class="topbar"><h1>Domínio · Brasil</h1>${fsButton}</header>`;
}

function render() {
  let body: string;
  if (screen === "players") body = `<div class="center">${renderPlayersScreen()}</div>`;
  else if (screen === "order") body = `<div class="center">${renderOrderScreen()}</div>`;
  else body = `<div class="layout"><main>${renderBoard(state!)}</main>${renderPanel(state!)}</div>`;

  app.className = screen === "game" ? "in-game" : "";
  app.innerHTML = renderHeader() + body + (screen === "game" ? "" : CREDITS);
  bindEvents();
}

function on(selector: string, handler: (el: HTMLElement) => void) {
  app
    .querySelectorAll<HTMLElement>(selector)
    .forEach((el) => el.addEventListener("click", () => handler(el)));
}

function bindEvents() {
  on("#fullscreen", () => void toggleFullscreen());

  // tela de jogadores
  on("[data-count]", (el) => {
    playerCount = Number(el.dataset.count);
    render();
  });
  app
    .querySelectorAll<HTMLInputElement>("[data-name]")
    .forEach((input) =>
      input.addEventListener("input", () => (names[Number(input.dataset.name)] = input.value)),
    );
  on("#to-order", () => {
    setupPlayers = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: names[i]!.trim() || `Jogador ${i + 1}`,
      color: COLORS[i]!,
    }));
    orderRolls = {};
    screen = "order";
    render();
  });

  // tela de ordem
  const roll = (id: string) => (orderRolls[id] = [...(orderRolls[id] ?? []), rollDie(Math.random)]);
  on("[data-roll]", (el) => {
    roll(el.dataset.roll!);
    render();
  });
  on("#roll-all", () => {
    resolveOrder(
      setupPlayers.map((p) => p.id),
      orderRolls,
    ).pending.forEach(roll);
    render();
  });
  on("#back", () => {
    screen = "players";
    render();
  });
  on("#start", () => {
    const { order } = resolveOrder(
      setupPlayers.map((p) => p.id),
      orderRolls,
    );
    state = createGame(order!.map(playerById));
    screen = "game";
    addLog(`Ordem de jogada: ${state.players.map((p) => escapeHtml(p.name)).join(" → ")}`);
    render();
  });

  // jogo
  on("[data-id]", (el) => onTerritoryClick(el.dataset.id!));
  on("[data-amount]", (el) => {
    placeAmount = el.dataset.amount === "all" ? "all" : Number(el.dataset.amount);
    render();
  });
  on("[data-move]", (el) => {
    state = moveAfterConquest(state!, Number(el.dataset.move));
    render();
  });
  on("#end-attack", () => {
    selected = null;
    state = endAttackPhase(state!);
    render();
  });
  on("#end-turn", () => {
    selected = null;
    lastBattle = null;
    state = endTurn(state!, map);
    render();
  });
  on("#new-game", () => {
    resetToSetup();
    render();
  });
  on("#quit", () => {
    if (confirm("Abandonar a partida atual e começar outra?")) {
      resetToSetup();
      render();
    }
  });
}

onFullscreenChange(render);
render();

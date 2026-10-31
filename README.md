# Domínio

Jogo de estratégia por turnos, de conquista de territórios, que roda no navegador.
Os jogadores disputam o arquipélago fictício de **Aurora** — 4 continentes e 20 territórios —
reforçando exércitos, atacando vizinhos com dados e remanejando tropas até que alguém domine o mapa.

## Como jogar

Cada turno tem três fases:

1. **Reforço** — você recebe metade do número de territórios que possui (mínimo 3), mais o
   bônus de cada continente que dominar por inteiro. Clique nos seus territórios para posicioná-los.
2. **Ataque** — selecione um território seu com 2+ exércitos e clique num vizinho inimigo.
   O atacante rola até 3 dados (sempre deixando 1 exército para trás) e o defensor até 3.
   Os dados são comparados do maior para o menor; **empate favorece a defesa**.
3. **Remanejamento** — mova exércitos entre territórios vizinhos seus.

Vence quem conquistar todos os territórios.

| Continente | Territórios | Bônus |
| ---------- | ----------- | ----- |
| Boreal     | 5           | +4    |
| Verdejante | 5           | +4    |
| Árido      | 5           | +3    |
| Coralina   | 5           | +3    |

## Desenvolvimento

Requer Node.js 20+ (veja `.nvmrc`).

```bash
npm install
npm run dev        # servidor local em http://localhost:5173
npm test           # testes das regras (Vitest)
npm run typecheck  # checagem de tipos
npm run format     # formata o código com Prettier
npm run build      # build de produção em dist/
```

### Estrutura

```
src/
  game/          # motor do jogo: lógica pura, sem DOM, totalmente testada
    types.ts     # tipos do estado da partida
    map.ts       # mapa de Aurora (territórios, vizinhanças, continentes)
    dice.ts      # rolagem e comparação de dados
    rules.ts     # regras: reforço, ataque, remanejamento, turnos
  main.ts        # interface (tabuleiro em SVG)
  style.css
```

O motor de regras é composto por funções puras que recebem um estado e devolvem um novo estado.
A aleatoriedade é injetada (`rng`), o que torna os testes determinísticos e facilita, no futuro,
partidas online e jogadores controlados por IA.

## GitHub

- **CI** (`.github/workflows/ci.yml`): formatação, tipos, testes e build em todo push na `main` e em PRs.
- **Deploy** (`.github/workflows/deploy.yml`): publica o jogo no GitHub Pages a cada push na `main`.
  Ative em _Settings → Pages → Build and deployment → Source: **GitHub Actions**_.
- **Dependabot**: atualizações semanais de dependências e mensais das Actions.
- Templates de issue (bug / ideia) e de pull request.

## Próximos passos

- [ ] Tela de configuração da partida (número de jogadores, nomes, cores)
- [ ] Escolher quantos exércitos mover após uma conquista
- [ ] Objetivos secretos alternativos à conquista total
- [ ] Jogadores controlados por IA
- [ ] Salvar/carregar partida
- [ ] Multijogador online

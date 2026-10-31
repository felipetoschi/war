# Domínio · Brasil

Jogo de estratégia por turnos, de conquista de territórios, para jogar **no tablet, sobre a mesa**,
no **mapa do Brasil** — 26 estados + Distrito Federal, agrupados nas 5 regiões.

- De **2 a 4 jogadores**, cada um num canto do tablet (os de cima veem o seu canto virado para eles).
- Os 27 estados são **sorteados**; depois, **dados** decidem a ordem de jogo.
- Rodada inicial com **3 soldados** para cada; ataque escolhendo origem, alvo e quantos soldados.
- **Dados como se fossem físicos** (vermelho ataca, amarelo defende): cada jogador rola o seu, no seu canto.
- **Cartas de troca** (■ ▲ ● e coringa ★), visíveis para todos: uma por conquista, trocadas por soldados.
- **Soldadinhos** na borda de cada jogador. Só se ataca estado que faz divisa.
- Reforço: 1 soldado a cada 2 estados, a partir da rodada 2. **Vence o último vivo.**

📖 As regras completas, e o que ainda está em aberto, estão em [docs/REGRAS.md](docs/REGRAS.md).

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
    types.ts       # tipos do estado da partida
    brasil.ts      # estados, fronteiras, litoral e regiões
    map.ts         # consultas ao mapa (vizinhança)
    cards.ts       # cartas de troca: baralho, trocas válidas e valor da troca
    dice.ts        # rolagem e comparação de dados
    order.ts       # dados para decidir a ordem de jogada (com desempate)
    rules.ts       # regras: sorteio dos estados, ordem de jogada, reforço, trocas, ataque em
                   # 3 passos (declarar, rolar ataque, rolar defesa), conquista,
                   # remanejamento, turnos, vitória
  ui/
    brasil-svg.ts  # contornos dos estados e posição dos marcadores
    dice.ts        # dados com pontinhos e animação de rolagem
    fullscreen.ts  # botão de tela cheia
    pieces.ts      # soldadinhos (peças) na borda de cada jogador
  main.ts          # interface (mapa em SVG)
  style.css
```

O motor de regras é composto por funções puras que recebem um estado e devolvem um novo estado.
A aleatoriedade é injetada (`rng`), o que torna os testes determinísticos e facilita, no futuro,
partidas online e jogadores controlados por IA.

## GitHub

- **CI** (`.github/workflows/ci.yml`): formatação, tipos, testes e build em todo push na `main` e em PRs.
- **Deploy** (`.github/workflows/deploy.yml`): publica o jogo no GitHub Pages a cada push na `main`.
- **Dependabot**: PRs semanais de dependências npm e mensais das Actions, sempre contra a `main`.
- **CODEOWNERS**: @felipetoschi é o revisor padrão.
- Templates de issue (bug / ideia) e de pull request.

### Configuração manual do repositório

Ajustes que só o dono do repositório faz em _Settings_:

1. **General → Default branch:** `main`.
2. **Pages → Build and deployment → Source:** `GitHub Actions`.
   O jogo fica em https://felipetoschi.github.io/war/.
3. **Rules → Rulesets** (opcional): proteger a `main` exigindo PR e o check `check` do CI.
4. **General → About** (engrenagem na página inicial): descrição, site e tópicos.

## Próximos passos

- [ ] Decidir os pontos em aberto de [docs/REGRAS.md](docs/REGRAS.md)
- [ ] Jogadores controlados por IA
- [ ] Salvar/carregar partida
- [ ] Multijogador online

## Créditos

Contornos dos estados: [svg-maps](https://github.com/VictorCazanave/svg-maps), de Victor Cazanave,
sob licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

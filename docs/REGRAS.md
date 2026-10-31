# Regras do Domínio · Brasil

Documento de design do jogo: o que já está decidido e o que ainda está em aberto.
Valores marcados com ⚙️ são configuráveis no código e podem ser ajustados com o tempo.

## Visão geral

- Jogo de estratégia por turnos, simples, no estilo dos clássicos de conquista de territórios.
- **Mapa:** somente o Brasil, com os **26 estados + Distrito Federal** (27 territórios).
- **Jogadores:** de **2 a 5**.
- **Objetivos abertos:** cada jogador recebe um objetivo sorteado, e **todos veem o objetivo de todos**.
- **Combate com dados virtuais**, no esquema tradicional (até 3 dados de ataque contra até 3 de defesa).
- **Diferencial — ataque naval:** estados do litoral podem atacar outros estados do litoral,
  mesmo sem fazer fronteira com eles, mas com **penalidade nos dados proporcional à distância**.

## Regiões e bônus

As regiões do IBGE fazem o papel de "continentes". Quem domina uma região inteira recebe
exércitos extras em todo reforço.

| Região       | Estados                            | Qtde | Bônus ⚙️ |
| ------------ | ---------------------------------- | ---- | -------- |
| Norte        | AC, AM, AP, PA, RO, RR, TO         | 7    | +5       |
| Nordeste     | AL, BA, CE, MA, PB, PE, PI, RN, SE | 9    | +5       |
| Centro-Oeste | DF, GO, MS, MT                     | 4    | +3       |
| Sudeste      | ES, MG, RJ, SP                     | 4    | +3       |
| Sul          | PR, RS, SC                         | 3    | +2       |

## Preparação

1. Escolhe-se o número de jogadores (2 a 5). A ordem de jogada é sorteada.
2. Cada jogador recebe **um objetivo sorteado** (nunca dois jogadores com o mesmo), visível a todos.
3. Os 27 estados são sorteados entre os jogadores, o mais igualmente possível,
   com **1 exército** em cada.

## O turno

Cada turno tem três fases, nesta ordem:

### 1. Reforço

O jogador recebe exércitos e os distribui como quiser entre os seus estados:

- **metade do número de estados que possui** (arredondado para baixo), **mínimo 3**; ⚙️
- **mais o bônus** de cada região que domina por inteiro.

### 2. Ataque (opcional, quantas vezes quiser)

- Ataca-se a partir de um estado próprio com **pelo menos 2 exércitos** (1 sempre fica para trás).
- O atacante rola **até 3 dados** (no máximo exércitos − 1); o defensor rola **até 3 dados**
  (no máximo o número de exércitos que tem).
- Os dados são ordenados do maior para o menor e comparados em pares:
  o maior do ataque contra o maior da defesa, e assim por diante.
- Em cada par, quem tirar menos perde 1 exército. **Empate: vence a defesa.**
- Se o estado defensor ficar sem exércitos, ele é conquistado e os exércitos atacantes
  que sobreviveram ao combate passam para ele.

#### Rotas de ataque

- **Por terra:** contra estados que fazem fronteira. Sem penalidade.
- **Por mar ⚓:** de um estado litorâneo para **qualquer outro estado litorâneo**, mesmo sem fronteira.
  Estados sem litoral (AC, AM, RR, RO, TO, MT, MS, GO, DF, MG) não atacam nem são atacados pelo mar.

#### Penalidade do ataque naval

Os 17 estados litorâneos são numerados ao longo da costa, de norte a sul:

```
AP(0) PA(1) MA(2) PI(3) CE(4) RN(5) PB(6) PE(7) AL(8) SE(9)
BA(10) ES(11) RJ(12) SP(13) PR(14) SC(15) RS(16)
```

A **distância** é a diferença entre os números. Cada dado do **atacante** perde pontos
conforme a distância (o dado nunca fica abaixo de 1): ⚙️

| Distância no litoral | Penalidade em cada dado | Exemplo                    |
| -------------------- | ----------------------- | -------------------------- |
| 2 a 4                | −1                      | RJ → PR (2), BA → AL (2)   |
| 5 a 8                | −2                      | BA → RS (6), CE → BA (6)   |
| 9 ou mais            | −3                      | RN → RS (11), AP → SP (13) |

A penalidade vale nos dois sentidos: RN → RS e RS → RN sofrem os mesmos −3.
Com −3, um 6 vira 3. Como o empate favorece a defesa, um ataque de um extremo a outro
do país só funciona contra estados mal defendidos — é um recurso para surpreender,
não para substituir o avanço por terra.

### 3. Remanejamento (opcional)

Move exércitos entre **estados próprios que fazem fronteira** (só por terra),
deixando sempre pelo menos 1 exército no estado de origem.

## Vitória

Vence quem, **durante o próprio turno**, cumprir o seu objetivo — ou dominar os 27 estados.
Como os objetivos são abertos, todos sabem o que cada adversário precisa e podem se defender.

### Objetivos ⚙️

| Objetivo                                             | Estados necessários |
| ---------------------------------------------------- | ------------------- |
| Conquistar o Nordeste e o Sul                        | 12                  |
| Conquistar o Norte e o Sul                           | 10                  |
| Conquistar o Norte e o Centro-Oeste                  | 11                  |
| Conquistar o Nordeste e o Centro-Oeste               | 13                  |
| Conquistar o Sudeste e o Nordeste                    | 13                  |
| Conquistar o Sudeste, o Centro-Oeste e o Sul         | 11                  |
| Ocupar 18 estados                                    | 18                  |
| Ocupar 14 estados com pelo menos 2 exércitos em cada | 14                  |

## Eliminação

Um jogador sem estados está fora da partida e sua vez é pulada.

## Em aberto (para decidir)

- [ ] **Penalidade naval:** as faixas −1 / −2 / −3 estão boas? Alternativa: em vez de tirar pontos,
      o atacante rolaria **menos dados** em ataques longos.
- [ ] **Limite de ataques navais** por turno (ex.: 1 conquista pelo mar por turno)?
- [ ] **Movimento após conquista:** hoje passam automaticamente os exércitos que atacaram.
      Deixar o jogador escolher quantos mover?
- [ ] **Partidas com 2 jogadores:** cada um começa com 13–14 estados, então "ocupar 14 estados
      com 2 exércitos" fica fácil. Usar objetivos mais difíceis, ou só a conquista total?
- [ ] **Bônus da capital:** quem tiver o DF ganha +1 exército por reforço?
- [ ] **Primeira rodada sem ataques**, para ninguém começar com vantagem por jogar primeiro?

# Regras do Domínio · Brasil

Documento de design do jogo: o que já está decidido e o que ainda está em aberto.
Valores marcados com ⚙️ são configuráveis no código e podem ser ajustados com o tempo.

## Visão geral

- Jogo de estratégia por turnos, no estilo do War clássico.
- **Mapa:** somente o Brasil, com os **26 estados + Distrito Federal** (27 territórios).
- **Jogadores:** de **2 a 5**, no mesmo aparelho, revezando a vez.
- **Objetivo:** ser o **último jogador vivo** (por enquanto é o único objetivo).
- **Combate com dados virtuais**, como no War clássico (até 3 dados de ataque contra até 3 de defesa).
- **Diferencial — ataque naval:** estados do litoral podem atacar outros estados do litoral,
  mesmo sem fazer fronteira com eles, mas com **penalidade nos dados proporcional à distância**.
- Botão de **tela cheia** no canto superior direito.

## Regiões e bônus

As regiões do IBGE fazem o papel de "continentes". Quem domina uma região inteira recebe
soldados extras sempre que for posicionar soldados.

| Região       | Estados                            | Qtde | Bônus ⚙️ |
| ------------ | ---------------------------------- | ---- | -------- |
| Norte        | AC, AM, AP, PA, RO, RR, TO         | 7    | +5       |
| Nordeste     | AL, BA, CE, MA, PB, PE, PI, RN, SE | 9    | +5       |
| Centro-Oeste | DF, GO, MS, MT                     | 4    | +3       |
| Sudeste      | ES, MG, RJ, SP                     | 4    | +3       |
| Sul          | PR, RS, SC                         | 3    | +2       |

## Preparação

1. **Jogadores:** escolhe-se de 2 a 5 jogadores e o nome de cada um.
2. **Quem começa:** cada jogador rola um dado virtual. Quem tirar mais joga primeiro, e a ordem
   segue do maior para o menor. Empatados rolam de novo entre si até desempatar.
3. **Escolha dos estados:** seguindo a ordem de jogada, cada jogador escolhe **um estado livre
   por vez** no mapa, até os 27 terem dono. Cada estado escolhido recebe **1 soldado**.
   Com 27 estados, a divisão fica:

   | Jogadores | Estados por jogador |
   | --------- | ------------------- |
   | 2         | 14, 13              |
   | 3         | 9, 9, 9             |
   | 4         | 7, 7, 7, 6          |
   | 5         | 6, 6, 5, 5, 5       |

4. **Rodada inicial:** na ordem de jogada, cada jogador posiciona soldados nos seus estados pela
   regra clássica (abaixo). **Nesta rodada ninguém ataca.** Depois do último jogador,
   começa a rodada 1, de novo pelo primeiro.

## Quantos soldados recebo

Regra clássica do War, usada na rodada inicial e no começo de cada turno: ⚙️

- **metade do número de estados que possui** (arredondado para baixo), **no mínimo 3**;
- **mais o bônus** de cada região que domina por inteiro.

Exemplo: com 9 estados, recebe 4. Com 5 estados, recebe 3 (o mínimo).

## O turno

### 1. Reforço

Posicione os soldados recebidos nos seus estados, como quiser.
Dá para colocar 1, 3 ou todos de uma vez em cada clique.

### 2. Ataque (opcional, quantas vezes quiser)

- Ataca-se a partir de um estado próprio com **pelo menos 2 soldados** (1 sempre fica para trás).
- O atacante rola **até 3 dados** (no máximo soldados − 1); o defensor rola **até 3 dados**
  (no máximo o número de soldados que tem).
- Os dados são ordenados do maior para o menor e comparados em pares:
  o maior do ataque contra o maior da defesa, e assim por diante.
- Em cada par, quem tirar menos perde 1 soldado. **Empate: vence a defesa.**
- **Conquista:** se o estado defensor ficar sem soldados, ele passa para o atacante, que escolhe
  quantos soldados mover para lá: **de 1 até o número de dados que usou no ataque**
  (sempre deixando ao menos 1 na origem).

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

### 3. Remanejamento (opcional)

Move soldados entre **estados próprios que fazem fronteira** (só por terra),
deixando sempre pelo menos 1 soldado no estado de origem.
Como no War clássico, **um soldado remanejado não pode ser movido de novo no mesmo turno**.

## Eliminação e vitória

- Quem perde todos os estados está fora da partida, e a vez dele é pulada.
- **Vence o último jogador vivo** — ou seja, quem dominar os 27 estados.

## Em aberto (para decidir)

- [ ] **Objetivos:** voltar com objetivos (abertos ou secretos) como alternativa ao "último vivo"?
- [ ] **Cartas de território**, como no War clássico (ganha uma carta por turno com conquista
      e troca trios por soldados extras)?
- [ ] **Penalidade naval:** as faixas −1 / −2 / −3 estão boas? Limitar ataques pelo mar por turno?
- [ ] **Bônus da capital:** quem tiver o DF ganha +1 soldado por reforço?

# Domínio · Brasil — instruções para o Claude

Jogo de estratégia por turnos no mapa do Brasil, para jogar no tablet sobre a mesa.
Regras e decisões de design: [docs/REGRAS.md](docs/REGRAS.md). Visão geral: [README.md](README.md).

## Fluxo de trabalho (sempre)

O site (GitHub Pages) só publica o que está na `main`. Por isso, **toda rodada de mudanças
termina com merge na `main`**, sem precisar pedir:

1. Rodar as checagens: `npm test`, `npm run typecheck`, `npm run build` e `npx prettier --check src docs README.md`.
2. Fazer commit e push no branch de trabalho.
3. Abrir o PR para a `main` (seguindo `.github/pull_request_template.md`).
4. Esperar o CI do PR passar e **fazer o merge** (método _rebase_, para manter o histórico linear).
5. Conferir se o workflow "Deploy no GitHub Pages" terminou com sucesso e avisar o usuário
   (lembrando de recarregar a página no tablet se ainda aparecer a versão antiga).

Depois de um merge, a próxima rodada de mudanças começa de novo a partir da `main` atualizada.

## Convenções

- Tudo em português do Brasil: textos do jogo, comentários, commits, PRs e documentação.
- `src/game/` é o motor do jogo: lógica pura, sem DOM. Toda regra nova ou alterada ganha teste
  em `src/game/*.test.ts`.
- `src/main.ts` e `src/ui/` são a interface. Conferir mudanças visuais rodando o jogo
  (`npm run dev`) em tamanhos de tablet, deitado e em pé (ex.: 1280×800, 800×1280, 1024×768,
  768×1024).
- Mudou uma regra ou a mesa? Atualizar `docs/REGRAS.md`, as regras rápidas do menu
  (`renderMenu` em `src/main.ts`) e, se for o caso, o `README.md`.
- O mapa tem tamanho fixo (o maior que cabe na tela); os cantos dos jogadores se adaptam a ele,
  nunca o contrário.

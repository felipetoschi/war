# Como contribuir

1. Crie uma branch a partir da `main`: `git checkout -b feat/minha-ideia`.
2. Faça as mudanças. Regras do jogo ficam em `src/game/` e devem vir acompanhadas de testes.
3. Antes de abrir o PR, rode:
   ```bash
   npm run format && npm run typecheck && npm test && npm run build
   ```
4. Abra um pull request para a `main` preenchendo o template. O CI precisa passar.

Padrão de mensagens de commit (sugestão): `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `test: ...`.

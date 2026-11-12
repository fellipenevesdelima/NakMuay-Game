# NakMuay

Jogo de gestão de um camp de Muay Thai na Tailândia. Three.js + TypeScript + Vite.

    npm install
    npm run dev     # jogar localmente
    npm test        # testes da simulação
    npm run build   # gera dist/index.html (arquivo único)

- `src/sim/` — regras e dados, sem renderização (testável).
- `src/render/` — cena 3D montada a partir dos dados.
- `src/i18n.ts` — pt-BR, en, th. O tailandês ainda não foi revisado por nativo.

- `src/assets/` — texturas e sprites originais do jogo, gerados por IA (Higgsfield) e reduzidos para o estilo pixel.

Todos os valores em baht são fictícios, para balanceamento.

## Estado
Feito: Cena 2 em Bangkok (erguer o portão, demarcar a área, comprar o tatame, salvar e recarregar).
Planejado: coach, olheira, atletas, treino, lutas, apostas, Código do Camp, Phuket e Chiang Mai, áudio.

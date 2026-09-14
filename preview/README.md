# Preview visual do "Fred explica" (sem Firebase, sem IA)

Harness para olhar as telas do Fred explica com uma aula de exemplo
(`lesson.json`) e a API mockada (`apiMock.ts`, `firebaseMock.ts`).
Não entra no build de produção (o `vite.config.ts` da raiz ignora esta
pasta; só `vite.preview.config.ts` a usa).

    npx vite serve --config vite.preview.config.ts
    # http://localhost:3100/                       → catálogo
    # http://localhost:3100/?lesson=A1_verbo-to-be-presente → aula
    # http://localhost:3100/?lesson=A1_will        → tela "gerando"
    # http://localhost:3100/?results=1             → sugestão de revisão

`tailwind.css` é o CSS gerado pelo Tailwind CLI a partir dos componentes
(o app real usa o CDN do Tailwind, que não estava acessível no ambiente
de testes). Se criar classes novas nas telas, regere-o ou o preview fica
sem estilo nessas classes.

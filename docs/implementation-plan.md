# Plano de implementação

1. Contrato e dados: mapear A:AH para `shared/models.ts`, guardar snapshot em `api/src/seed.ts`, descrever respostas e validação em `docs/openapi.json`.
2. Domínio: testes antes da implementação para vontade, afinidade, tempos, saturação, dependências ausentes/cíclicas, exclusão de finalizados e ausência de notas. Implementar `scoreGames` e `recommendGames` sem dependências de infraestrutura.
3. API: interface `GameRepository`, adaptador local persistente e serviço de avaliação. Testar edição parcial, nota→conclusão, restauração de status, campos inválidos, persistência, isolamento do seed e requisições HTTP.
4. Angular: serviço HTTP tipado, navegação, filtros, lista, fila com motivos, formulário de detalhes. A fila nunca é ordenada no cliente.
5. Validação: rodar suíte completa, build Angular e testes HTTP com dados reais. Embalar código, seed, contrato, build e instruções; excluir dependências e alterações geradas durante testes.

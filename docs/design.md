# Checkpoint — biblioteca pessoal de jogos

Três telas responsivas em Angular: lista pesquisável e filtrável, fila contextual e detalhes editáveis. Menu hambúrguer no celular. Cores dentro das tags de gênero, subgênero, status e vontade. Visual simples inspirado nos controles do shadcn, implementado com Angular nativo.

API first: contrato OpenAPI 3.1 versionado, `/api/v1/games`, `/api/v1/games/{id}`, `/api/v1/recommendations`, `/api/v1/catalog`. O Angular consome apenas a API; não importa o banco nem duplica o algoritmo.

Modelo preserva todas as colunas da planilha. 481 registros reais no seed TypeScript; campos calculados antigos ficam em `imported` para comparação. Dados ausentes continuam nulos, não recebem números inventados.

Repositório assíncrono com adaptador local: seed no código e arquivo JSON de alterações em `api/data/games.json`. A interface permite implementar SQL sem alterar serviços, endpoints ou telas.

Pontuação: 50% vontade + 35% afinidade pessoal + 15% duração. Afinidade deriva das notas de 1 a 5 por gênero, ritmo e mecânica com duas avaliações neutras como prior. Estimativas de tempo se ajustam às horas reais dos jogos finalizados. Seleção gulosa recalcula a pontuação a cada posição: gênero anterior -18, dois atrás -8; tags proporcionalmente -8/-4; mesma mecânica -10; longos consecutivos -24; longo após 90 h nos últimos três jogos -12; mesmo ritmo -6; contraste calmo/frenético +8; curto após longo +6; jogo em andamento +8. Sequências respeitam dependências importadas, sem obrigação de jogar seguidas.

Ajuste manual: o usuário reordena a fila arrastando; o gesto vira pontos flat por jogo (`manualPoints`), aplicados como adjustment explícito “Ajuste manual” em qualquer posição. `POST /api/v1/queue/reorder` resolve o delta verificando o algoritmo real (expansão + busca binária); se a posição exata for impossível, aplica a mais próxima. Ajustes e histórico (from/to/effective position, points delta, created at) ficam em `ManualAdjustmentRepository`, separado dos jogos, pronto para tabelas SQL próprias.

Notas antigas não mudam status na importação. Ao alterar uma nota no app para 1–5, o padrão é concluir o jogo; é possível desmarcar essa opção para uma avaliação parcial. Apagar nota não reabre o jogo. Finalizados e abandonados não entram na fila; jogos sem fim definido também não. Pesos, vontade, nota e duração são recalculados no servidor; a tela atualiza após salvar.

Sem login. Servidor inicia em 127.0.0.1. Não consulta Steam/GOG/Epic nem sincroniza de volta à planilha nesta versão.

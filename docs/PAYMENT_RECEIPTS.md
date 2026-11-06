# Recibos de pagamento

Marcar uma parcela como paga no Financeiro ou salvar essa alteração no editor do mentor cria um recibo com a parcela, valor, moeda, data de pagamento, nome/email do contrato e código UUID. O email contém o recibo completo, sem PDF. O Gmail/Apps Script já utilizado pelo portal faz a entrega.

A fila aguarda 30 segundos e é processada a cada minuto. Isso permite desfazer uma marcação incorreta antes do envio. A data corresponde a `data_pagamento`, com fallback em São Paulo quando ausente. A operação não altera parcelas de outros contratos nem divulga saldo ou outras parcelas no email.

## Painel

Em **Financeiro**, abra o contrato. A parcela paga exibe o status do recibo e o botão de emissão/reenvio. **Atualizar status** consulta novamente o processamento. O reenvio pede confirmação do destinatário e valor; há intervalo mínimo de cinco minutos depois de um envio/tentativa. Solicitações enquanto a fila está pendente não a duplicam.

Pagamentos anteriores à ativação ficam como **Pagamento anterior à ativação**, sem emails retroativos. É possível emitir um recibo desses pagamentos manualmente.

O editor mantém IDs e números de parcelas existentes. Adições usam o próximo número disponível, mantendo lacunas do histórico. Não é possível remover uma parcela paga sem antes desmarcá-la e salvar. As alterações das parcelas são transacionais: um erro mantém todas as parcelas anteriores. O contrato principal continua sendo salvo antes da transação das parcelas, como no fluxo anterior; o painel informa se somente essa primeira etapa foi salva.

## Entrega e duplicidade

A chave única é contrato + número + valor + moeda + data do pagamento. Salvar novamente, editar vencimento e marcar novamente o mesmo pagamento não dispara outro email. Somente a transição para pago cria uma emissão automática. Alterar valor/data de uma parcela já paga preserva o recibo anterior e permite emitir outro com os dados corrigidos pela ação explícita no Financeiro.

Antes de buscar uma entrega, o worker confere se a parcela ainda existe, está paga e corresponde aos dados do recibo e do destinatário. Mudanças cancelam uma emissão pendente; o mentor pode conferir os dados e emitir novamente. Uma alteração ocorrida depois que a entrega já foi iniciada não consegue recolher um email em trânsito.

O snapshot emitido é preservado. Não há garantia de entrega à caixa de entrada: **enviado** significa que o serviço de email confirmou o aceite. Falhas e respostas incertas exigem conferência/reenvio manual. Timeout, retorno malformado, erro HTTP e worker interrompido não provocam uma nova entrega automática. O token de claim impede confirmações de outra tentativa. Emissão repetida manualmente mantém o código do recibo. O Apps Script atual não fornece uma transação/idempotência com o banco, então a solução deliberadamente evita retentativas automáticas após dúvida.

## Implantação

1. Aplicar `supabase/migrations/20261106153553_payment_receipts.sql`.
2. Implantar `supabase/functions/payment-receipt/index.ts` junto com `email.js`, `verify_jwt=false`: o próprio worker valida `REVIEW_NOTICE_WORKER_SECRET` antes de qualquer consulta. Segredos `GOOGLE_MAIL_WEBHOOK_URL`, `GOOGLE_MAIL_SECRET` e `REVIEW_NOTICE_WORKER_SECRET` já existentes são reutilizados.
3. Aplicar a migração `20261106154043_payment_receipts_cron.sql` (também disponível em `supabase/payment_receipts_cron.sql`): usa os mesmos dois registros do Vault dos avisos de revisão, sem modificá-los.
4. Publicar as páginas do mentor e `assets/payment-receipts.js`.

Nenhum aluno pode ler recibos de outro aluno ou usar o worker. A tabela possui RLS de leitura exclusiva do admin e grants de colunas que excluem email/nome. Só o serviço pode capturar/finalizar a fila. Os RPCs públicos de salvar e solicitar recibo são `SECURITY DEFINER` com `search_path` vazio, execute anônimo revogado e validação `auth.uid()` + `is_admin()` antes de acessar os dados. O acesso autenticado a esses RPCs é intencional e protegido; avisos genéricos de advisor sobre funções definer devem ser avaliados com essas verificações.

## Verificação

- `node --test tests/*.test.mjs`: template, validação, seleção de status, RPC, código das páginas e regressões existentes.
- `PGLITE_MODULE=/caminho/para/pglite/dist/index.js node tests/helpers/payment-receipts-postgres.mjs`: baseline sem envio, transação, autorização/RLS, identificação estável, deduplicação, reenvio, claims, cancelamentos e entrega incerta.
- Testes do worker usam serviço de email simulado. Não enviam emails reais nem alteram pagamentos de mentorados.

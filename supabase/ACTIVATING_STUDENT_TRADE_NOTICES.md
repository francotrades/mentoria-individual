# Avisar o mentor quando o aluno adicionar um trade

Usa o mesmo Gmail/Apps Script e a mesma senha do agendamento das revisões já configurados. Não altera a função que avisa os alunos sobre as publicações do mentor.

## 1. Preparar o banco

Abra `supabase/student_trade_notifications.sql`, copie todo o conteúdo e execute no SQL Editor do Supabase.

Somente trades adicionados pelo próprio aluno depois dessa ativação geram avisos. Os registros antigos continuam disponíveis, sem uma enxurrada de e-mails. Edições e anexos posteriores da mesma operação não geram outro aviso. O registro inicial, incluindo importações, é o evento de envio.

## 2. Criar a função pelo navegador

Em Edge Functions, crie uma função pelo editor com o nome exato `student-trade-notification`.

Apague o exemplo de `index.ts` e cole todo o conteúdo de `supabase/functions/student-trade-notification/index.ts`. Este arquivo é completo e não exige adicionar outros arquivos.

Publique a função. Em Details, desative Verify JWT / Verify JWT with legacy secret e salve. A função faz sua própria autenticação: exige o segredo do agendamento ou login de administrador. Alunos não podem disparar a fila.

Os seguintes segredos em Edge Functions → Secrets são reutilizados sem mudanças:

- `GOOGLE_MAIL_WEBHOOK_URL`
- `GOOGLE_MAIL_SECRET`
- `REVIEW_NOTICE_WORKER_SECRET`

Não é necessário criar novos segredos nem alterar o Apps Script.

Alternativa pela CLI autenticada, dentro do repositório:

```sh
npx supabase functions deploy student-trade-notification --project-ref vfnltuecpnuixemxvwvk --no-verify-jwt --use-api
```

## 3. Agendar

Execute `supabase/student_trade_notifications_cron.sql` no SQL Editor. Ele reutiliza `review_notice_worker_url` e `review_notice_worker_secret` do Vault e cria um agendamento separado, sem substituir o aviso aos alunos.

Confira com esta consulta:

```sql
select jobname, schedule, active from cron.job
where jobname = 'student-trade-email-notices';
```

Esperado: `* * * * *` e `active = true`.

## 4. Testar

Entre com um usuário aluno com acesso ao diário e adicione um novo trade. Isso gera um e-mail real para os endereços dos perfis com papel `admin` no portal. O cadastro do mentor precisa ter e-mail preenchido. A senha não precisa ser compartilhada.

O processamento espera pelo menos 45 segundos para agrupar registros próximos e roda a cada minuto. Em condições normais, confira a caixa de entrada e o spam em cerca de dois minutos. Limites do Gmail ou indisponibilidade podem atrasar a entrega. Importações são agrupadas por mentorado e destinatário, com até 50 operações por e-mail. Cada e-mail traz nome do aluno, ativo/data e links internos; prints, anotações e dados financeiros ficam no portal.

O destinatário precisa continuar administrador e com o mesmo e-mail no cadastro no momento de retirar o lote da fila. Quem já deixou um comentário no trade antes do envio não recebe um aviso pendente sobre esse trade. O aviso não é um lembrete recorrente: ele ocorre uma vez por novo registro.

O botão do e-mail abre o diário administrativo, seleciona o mentorado e, para uma única operação, abre os detalhes para comentar. Se for necessário fazer login, esse destino é preservado. No painel existe o filtro **Aguardando feedback**; um comentário publicado muda a operação para **Com feedback**.

## Verificar a fila sem expor endereços

```sql
select status, count(*) from public.student_trade_email_deliveries
 group by status order by status;
```

`pending`: aguarda o horário/lote; `processing`: envio em andamento; `sent`: Gmail confirmou; `failed`: falha com até três tentativas; `uncertain`: retorno ambíguo, exige conferência antes de qualquer reenvio; `cancelled`: destinatário não é mais elegível ou trade já recebeu feedback.

Erros de quota diária aguardam 24 horas antes da nova tentativa. Timeouts e respostas ambíguas não são reenviados automaticamente para evitar duplicação. Mesmo `sent` não garante caixa de entrada: confira spam/filtros do destinatário.

Para pausar apenas esses avisos, adicione o segredo `MENTOR_TRADE_NOTICES_ENABLED=false` e desative o agendamento `student-trade-email-notices`. Não remova os segredos compartilhados do Gmail. Para retomar, use `true` e reative o agendamento após conferir a fila.

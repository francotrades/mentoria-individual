# Agendamento e avisos de mentoria

No editor de sessão do mentor, preencher data, horário de Brasília e manter a sessão liberada. Salvar cria uma confirmação por e-mail e um lembrete para 9h do dia anterior. Remarcar cria uma nova confirmação e cancela os avisos pendentes do horário anterior. Salvar novamente sem alterar agendamento não cria novas mensagens. Retirar a liberação ou limpar o horário cancela os envios pendentes.

Se o agendamento for feito depois das 9h do dia anterior, somente a confirmação é criada: não há segundo aviso imediato dizendo a mesma coisa. Um lembrete que ficou atrasado não é enviado no dia da sessão com o texto amanhã. Não são criadas confirmações retroativas para sessões que já estavam cadastradas antes da ativação.

A página inicial do aluno mostra Próxima mentoria, data, horário e botão Ver sessão. Ao cadastrar o link, Entrar ao vivo aparece no destaque e na sessão; a entrada fica disponível entre 30 minutos antes e 2h30 depois do início, preservando a janela existente. O portal confere alterações a cada minuto e ao retornar à aba. Essa atualização preserva o leitor e o rascunho de anotações, atualizando apenas os dados da sessão e o link.

## Envio

Sem encontro agendado, o destaque mostra Seu acompanhamento, sem o rótulo Próxima mentoria. Quando a gravação da última sessão prevista para o aluno estiver liberada, mostra Encontros concluídos e mantém o acesso às gravações para revisão. Essa conclusão considera a quantidade prevista da mentoria, inclusive ampliações, e não depende do progresso de revisão do aluno. Sessões com gravação não aparecem como próximo encontro ao vivo.

A função session-schedule-notification reutiliza GOOGLE_MAIL_WEBHOOK_URL, GOOGLE_MAIL_SECRET e REVIEW_NOTICE_WORKER_SECRET existentes. Nenhum segredo vai para o frontend ou repositório. O cron session-schedule-notifications verifica a fila a cada minuto, usando os registros já existentes no Vault. O painel tenta processar a confirmação logo após salvar; se a chamada falhar, o cron continua responsável pela fila.

As mensagens apontam para a Área do Aluno, sem enviar links de reunião que podem ser substituídos. O servidor consulta o destinatário e o agendamento atuais antes de processar cada aviso. Perfis inativos, acessos expirados sem extensão, sessões passadas e não liberadas não recebem novos avisos.

A fila usa versão do agendamento, chave única por tipo e claim exclusivo. Falhas confirmadas têm tentativas limitadas; respostas ambíguas ficam retidas para conferência, evitando reenvio automático de uma mensagem possivelmente aceita. Um envio já aceito pelo provedor não pode ser desfeito caso o mentor remarque a sessão naquele exato momento.

## Instalação e testes

Aplicar session_schedule_notifications.sql, publicar supabase/functions/session-schedule-notification e aplicar session_schedule_notifications_cron.sql. Os arquivos equivalentes com os identificadores da instalação estão em supabase/migrations.

Testes: node --test tests/*.test.mjs e PGLITE_MODULE=/caminho/pglite/dist/index.js node tests/helpers/session-schedule-postgres.mjs. O teste de navegador em tests/helpers/student-study-browser.mjs cobre o mesmo link da sessão 10 no destaque e na lista. O healthOnly verifica a configuração do serviço sem enviar e-mail. Os testes usam dados fictícios e não criam agendamentos de teste para alunos reais.

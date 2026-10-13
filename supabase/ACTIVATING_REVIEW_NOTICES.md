# Ativar e-mails de novas revisões

Esta integração usa o mesmo Gmail/Google Apps Script que o portal já utiliza para outros e-mails. Não exige canal, cargos ou webhook do Discord.

## 1. Preparar o banco

No SQL Editor do projeto da mentoria:

1. Execute `trade_review_notifications.sql`, se ainda não executou. Ele prepara a fila, as métricas e as regras privadas de elegibilidade.
2. Execute `trade_review_email_notifications.sql`. Ele passa a preparar entregas individuais por e-mail nas próximas publicações e impede que o processador antigo envie avisos ao Discord.

Revisões antigas não são convertidas em envios. Se o primeiro SQL já foi aplicado para a proposta do Discord, mantenha-o e aplique o segundo; nenhum progresso ou visualização é apagado.

## 2. Conferir os segredos de e-mail existentes

Em Supabase → Edge Functions → Secrets, confira a presença de:

| Nome | Valor |
|---|---|
| `GOOGLE_MAIL_WEBHOOK_URL` | URL `/exec` do Google Apps Script que já envia e-mails do portal |
| `GOOGLE_MAIL_SECRET` | O mesmo `MAIL_SECRET` configurado nas propriedades desse Apps Script |
| `REVIEW_NOTICE_WORKER_SECRET` | Senha aleatória forte de pelo menos 32 bytes, para o agendamento |

Se os outros e-mails do portal já funcionam usando esses segredos, reutilize a configuração. Não publique os valores no GitHub, em mensagens ou em campos públicos. Não há alteração obrigatória no Apps Script atual.

Se o emissor de e-mails ainda não foi configurado, as instruções estão no início de `google-apps-script/payment-email.gs`.

## 3. Publicar a função

Na pasta do repositório, com a CLI autenticada no Supabase:

```sh
npx supabase functions deploy trade-review-notification --project-ref vfnltuecpnuixemxvwvk --no-verify-jwt --use-api
```

A função verifica explicitamente o JWT e o papel administrativo do mentor, ou o segredo privado do processador. A URL da função permanece a mesma da proposta anterior, mas esta versão envia apenas e-mails, sem chamadas ao Discord.

## 4. Ativar o processamento automático

No Vault do Supabase, crie ou confira:

| Nome | Valor |
|---|---|
| `review_notice_worker_url` | `https://vfnltuecpnuixemxvwvk.supabase.co/functions/v1/trade-review-notification` |
| `review_notice_worker_secret` | A mesma senha de `REVIEW_NOTICE_WORKER_SECRET` |

Execute `trade_review_notifications_cron.sql`. Ele remove o agendamento anterior do Discord, se existir, e cria `trade-review-email-notices`, que verifica a fila a cada minuto.

O portal também pede o processamento assim que a publicação é confirmada. Cada processamento atende até 20 destinatários; os demais continuam na fila para o próximo ciclo.

## 5. Testar uma publicação

Publique uma nova revisão ativa em texto/imagem ou vídeo. Isso envia **e-mails reais** aos alunos elegíveis. Não use uma edição de publicação antiga para o teste, pois editar não prepara novos avisos.

Confira a caixa de entrada de um aluno com aquele formato liberado e o link recebido. O link é preservado após login, mas não libera conteúdo para um acesso encerrado.

No painel do mentor, use **Enviar e-mails pendentes** para processar outra parte da fila manualmente, se necessário.

## Regras de destinatários

- Na publicação, o banco seleciona alunos que têm acesso ao formato correspondente, usando as mesmas regras de liberação já existentes no portal.
- Antes de enviar, a função verifica novamente o acesso, a disponibilidade da revisão e o e-mail atual do cadastro. Quem perdeu acesso nesse intervalo é ignorado.
- Cada destinatário recebe um e-mail separado. Não há lista de endereços em CC.
- O mesmo endereço não recebe duas entregas preparadas para a mesma publicação, mesmo se aparecer em mais de um cadastro elegível.
- Se o e-mail do cadastro mudou depois da publicação, a entrega antiga é cancelada; não é enviada ao endereço anterior.
- Título e link do portal são enviados. A explicação completa, imagens privadas e URLs privadas dos vídeos ficam no portal.
- Não há novo envio ao editar, desativar e reativar a mesma revisão. A liberação posterior de um aluno não dispara avisos de publicações antigas.
- Reaplique o SQL de regras/métricas e, depois, o SQL de e-mails quando alterar as funções de elegibilidade, para atualizar as cópias privadas das regras.
- Visualizações e conclusões continuam individuais. Visualização significa título visível por pelo menos 1,5 segundo; conclusão é marcada pelo aluno.

## Falhas e pausa

Falhas com resposta definitiva podem ser tentadas até três vezes, com intervalo de pelo menos 15 minutos. Erros de conexão, timeout ou retorno ambíguo ficam para conferência, sem reenvio automático, para evitar duplicação.

Para pausar apenas os avisos de revisão, configure `REVIEW_EMAIL_NOTICES_ENABLED=false` em Edge Functions → Secrets e desative o agendamento `trade-review-email-notices`. Para retomar, use `true` e reative o agendamento, depois de conferir a fila. Não remova os segredos de Gmail compartilhados pelo projeto, porque são usados pelos outros e-mails do portal.

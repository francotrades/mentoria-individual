# Ativar avisos e acompanhamento das revisões

A interface está integrada, mas o envio e as métricas exigem esta ativação no projeto Supabase da mentoria. Não coloque segredos no GitHub nem em campos públicos do portal.

1. No SQL Editor, execute `trade_review_notifications.sql` depois dos SQLs de acesso e progresso já usados pelo portal. O arquivo não anuncia revisões antigas; só enfileira novas publicações ativas ou rascunhos ativados após sua instalação.
2. No Discord, crie um webhook em um **canal de texto privado dos mentorados** (Configurações do canal → Integrações → Webhooks). O primeiro estágio não usa canal de fórum, mensagens diretas nem menção automática de cargos.
3. Em Supabase → Edge Functions → Secrets, salve:
   - `DISCORD_REVIEW_WEBHOOK_URL`: URL privada do webhook desse canal.
   - `REVIEW_NOTICE_WORKER_SECRET`: senha aleatória forte, com pelo menos 32 bytes, para o processador agendado.
4. Publique a função no projeto existente, a partir da raiz deste repositório:

   ```sh
   supabase functions deploy trade-review-notification --project-ref vfnltuecpnuixemxvwvk --no-verify-jwt
   ```

   A função autentica explicitamente o JWT do mentor e verifica seu papel de administrador. O processador agendado usa seu segredo separado. Desativar a verificação no gateway não torna o envio público.
5. Para processar avisos mesmo se o mentor fechar o navegador após salvar, crie no **Vault do Supabase**:
   - `review_notice_worker_url`: `https://vfnltuecpnuixemxvwvk.supabase.co/functions/v1/trade-review-notification`
   - `review_notice_worker_secret`: o mesmo segredo privado do passo 3.
   Depois execute `trade_review_notifications_cron.sql`. A fila será verificada a cada minuto. Antes de ativar o cron, confira o canal do webhook e os itens pendentes.
6. Após ativar, publique uma nova revisão para conferir o aviso. Esse teste envia uma mensagem real ao canal. O painel do mentor também oferece **Enviar avisos pendentes**.

## Comportamento

- Uma revisão ativa recebe no máximo um registro de aviso, mesmo que seja editada, desativada e ativada novamente.
- O texto contém título e link do portal. Não inclui imagens privadas, explicação completa ou URL privada do vídeo.
- O aluno precisa estar autenticado e elegível. A referência da revisão é preservada no login; links não liberam acesso por si mesmos.
- A fila é privada para o mentor. Alunos registram apenas suas próprias visualizações, de conteúdos a que têm acesso.
- Visualização significa que o título apareceu na tela por pelo menos 1,5 segundo. Conclusão continua sendo marcada pelo aluno; nenhuma conclusão é automática.
- Os denominadores consideram elegibilidade **atual**. As regras são copiadas das funções de acesso existentes na instalação. Reaplique o SQL de integração após mudar as regras de elegibilidade para sincronizar o relatório.
- Falhas definitivas de HTTP podem ser tentadas até três vezes. Timeout, resposta ambígua, falha na gravação após envio ou processamento interrompido não são reenviados automaticamente: confira primeiro o canal e a fila para evitar duplicatas.
- Mensagens em canal dependem das preferências de notificação de cada aluno. E-mails individuais ficam para uma etapa separada.

## Pausar

Desative o agendamento `trade-review-discord-notices` e remova o segredo `DISCORD_REVIEW_WEBHOOK_URL`. A publicação de revisões e o progresso continuam disponíveis. Publicações feitas depois da instalação do SQL permanecem na fila, então confira itens pendentes antes de reativar.

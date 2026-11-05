# Ampliar sessões e acesso até a última gravação

No Painel do Mentor, selecione o aluno e use **Total de sessões contratadas → Salvar quantidade de sessões**. Informe o total final (por exemplo, 16), não apenas as aulas adicionais. O painel aceita até 200 sessões e permite manter ou aumentar o total; não remove aulas existentes.

A operação, exclusiva do mentor, acrescenta as sessões faltantes e atualiza somente a quantidade no contrato financeiro vinculado. Valores, parcelas, pagamentos, datas e gravações existentes são preservados. As parcelas da extensão continuam sendo editadas em **Gerenciar financeiro**.

## Regra de acesso

- Contratos com **14 ou mais sessões** liberam diário, revisões em texto/imagem e revisões em vídeo enquanto a última sessão contratada estiver sem gravação.
- Exemplo: total 16. Gravação da sessão 13 ou 15 não encerra o acesso. Preencher a data da 16 também não encerra. Cadastrar `youtube_url` não vazio na sessão 16 encerra o diário e ambos os formatos de revisão.
- Ampliar de 16 para 18 reabre essas áreas até a gravação da 18, mesmo que a 16 já tenha gravação.
- Para esses contratos, uma data de expiração anterior não corta antecipadamente o acesso enquanto a extensão estiver pendente. O aluno precisa continuar com status **ativo**; a inativação administrativa continua bloqueando o acesso.
- Contratos de até 13 sessões mantêm as regras anteriores. O mentor continua acessando o histórico para acompanhar o aluno.
- A regra vale no banco, nas telas, nas imagens privadas e na elegibilidade dos avisos por e-mail. Links diretos não liberam acesso após o encerramento.

## Implementação e verificação

Migração: `supabase/migrations/20261105213327_extended_sessions_recording_access.sql`.

Os totais existentes são obtidos da quantidade financeira e da maior sessão vinculada, sem depender de um novo campo no perfil. O catálogo é ampliado até 200, sem substituir títulos anteriores. A função de extensão bloqueia reduções e usa transação e bloqueio do perfil para evitar alterações concorrentes inconsistentes.

As funções internas ficam no schema `mentorship_private`, sem uso por `anon` ou `authenticated`. As funções públicas de leitura são intencionalmente SECURITY DEFINER para consultar as regras privadas: o estado detalhado exige o próprio aluno ou o administrador, e o booleano de acesso sempre usa `auth.uid()`. O RPC de ampliação exige `is_admin()` e login antes de qualquer alteração. Os helpers de destinatários são restritos ao serviço. Nenhum valor de pagamento é retornado por esses RPCs.

O advisor pode sinalizar essas funções públicas por serem SECURITY DEFINER executáveis por usuários autenticados; essa exposição é intencional e protegida pelos controles acima, testados no PostgreSQL. Referência: https://supabase.com/docs/guides/database/functions

Testes do módulo/UI: `node --test tests/*.test.mjs`.

Teste de banco com dados fictícios e PGlite instalado:

```sh
PGLITE_MODULE=/caminho/para/pglite/dist/index.js node tests/helpers/extended-session-postgres.mjs
```

O teste cobre 13 → 16 → 18, encerramento por gravação, data sem vídeo, expiração por calendário, inativação, isolamento entre alunos, autorização do mentor, repetição da migração e manutenção das sessões anteriores. Não envia e-mails nem grava dados de teste em produção.

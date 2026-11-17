# Área de estudo do aluno

A área do aluno tem três entradas: **Início**, **Minhas sessões** e **Revisões de trades**. A página inicial destaca a próxima sessão agendada, o último estudo aberto e até três revisões ainda não concluídas.

As revisões em imagem e vídeo aparecem em uma biblioteca com busca por palavras (incluindo explicação/descrição), filtros de ativo, tema, formato e conclusão. São mostradas 12 por vez. As publicações antigas continuam aparecendo mesmo sem classificação.

No painel do mentor, **Ativo** e **Tema** são campos opcionais nas duas formas de publicação. Os campos não mudam o texto, a imagem, a data ou a elegibilidade da publicação. Os conteúdos antigos não são classificados automaticamente.

Cada revisão abre em um leitor com imagem ampliável ou vídeo incorporado, texto, navegação anterior/próxima e marcação explícita de conclusão. A abertura não marca conclusão. O progresso continua nas tabelas existentes. O último estudo aberto e a data da última visita são lembrados somente nesse navegador, separados pelo identificador do aluno; não há retomada do segundo exato do vídeo.

Cada sessão reúne a gravação, as observações do mentor, a descrição e seus materiais vinculados. **Revisada / Não revisada** é o progresso de estudo; **Sessão agendada / Gravação disponível** descreve a disponibilidade do encontro. Vídeos privados podem exigir abertura no YouTube com a conta autorizada.

## Banco e publicação

Aplicar `supabase/student_study_security.sql` antes de publicar o frontend. A alteração:

- Acrescenta `instrumento` e `tema` opcionais às duas tabelas de revisões.
- Protege aulas e materiais por dono, liberação, status e validade, preservando materiais gerais vinculados ao aluno.
- Preserva a exceção de acesso por gravação das mentorias estendidas, documentada em `SESSION_EXTENSIONS.md`.
- Bloqueia consultas anônimas e consultas de indicadores de acesso de outro aluno. Mentor, serviço e manutenção autorizada continuam funcionando.
- Remove permissões de RPC das funções usadas apenas como triggers e fixa o `search_path` dos três triggers de atualização.

As rotinas públicas de decisão de acesso permanecem intencionalmente `SECURITY DEFINER`: elas consultam dados protegidos sem provocar recursão de RLS e verificam a identidade ou permissão do solicitante. Não revogar indiscriminadamente essas funções com base apenas no aviso do advisor.

Não modifica audiências, alunos, contratos, pagamentos, gravações ou marcações anteriores.

## Verificação

```sh
node --test tests/*.test.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node tests/helpers/student-study-postgres.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node tests/helpers/extended-session-postgres.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs STUDY_TEST_URL=http://127.0.0.1:8765 node tests/helpers/student-study-browser.mjs
```

O teste de navegador usa a página real com integrações interceptadas e registros fictícios. Não acessa dados de alunos nem envia pagamentos ou avisos. Testa navegação, filtros, paginação, conclusão, imagens, vídeo, materiais, links de e-mail e larguras de 390/1440 px. O teste de PostgreSQL exerce RLS com roles reais e dados fictícios, incluindo expiração, inativação, sessão bloqueada, mentorias estendidas, isolamento e permissão do serviço.

## Ajustes de autenticação pendentes no painel

As ferramentas de banco não alteram as configurações do serviço Auth. Conferir no painel do projeto:

- Reduzir a validade de OTP por e-mail para menos de uma hora.
- Ativar a proteção contra senhas vazadas, conforme disponibilidade do plano.

Referências: https://supabase.com/docs/guides/platform/going-into-prod#security e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Favoritos, anotações pessoais, retomada por segundo do vídeo e otimização geral de índices ficam para uma etapa posterior.

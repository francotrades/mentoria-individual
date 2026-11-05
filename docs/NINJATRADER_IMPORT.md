# Importar operações NinjaTrader Desktop no diário do aluno

## No NinjaTrader

1. No Control Center, abra **New → Trade Performance**.
2. Filtre **uma única conta**, escolha o período e clique em **Generate**.
3. Em Display, escolha **Trades** e **Currency ($)**. O relatório deve trazer operações encerradas, não ordens ou execuções isoladas.
4. Mantenha visíveis Account, Instrument, Market pos., Qty, Entry price, Exit price, Entry time, Exit time, Profit e Commission. Inclua Clearing Fee, Exchange Fee, IP Fee e NFA Fee quando disponíveis. MAE e MFE são opcionais.
5. Clique com o botão direito na tabela e selecione **Export → CSV**. Use o CSV original, sem converter para Excel ou mudar as colunas.

## No portal

1. Entre como aluno e abra **Diário de Trade → Importar**.
2. Escolha a conta de destino e **NinjaTrader Desktop · Trades CSV**; o modo automático também reconhece o cabeçalho.
3. Escolha o CSV e os mesmos formatos usados no NinjaTrader: mês/dia/ano ou dia/mês/ano; números americanos ou brasileiros. Selecione o fuso que o relatório usa (Nova York, Chicago, Brasília ou UTC).
4. Informe se **Profit** já é líquido das taxas ou ainda está bruto. Confira essa configuração no relatório da plataforma. No modo líquido, o diário soma as taxas para registrar o bruto e mantém o valor líquido original. No modo bruto, desconta as taxas uma vez.
5. Confirme que exportou em moeda, na mesma moeda da conta do diário. A importação não converte moedas nem muda o dia para outro fuso. A data do trade é a data do fechamento mostrada no arquivo.
6. Confira a conta de origem, a quantidade, os preços, as taxas e o líquido na prévia. Linhas inválidas ficam listadas e não são importadas. Operações reconhecidas como já importadas são removidas do lote.
7. Clique em **Confirmar importação**. Depois acrescente prints, setup, risco inicial e avaliação da execução, conforme necessário.

## O que é preservado

Ativo com o vencimento do contrato, direção, quantidade, preços, data de fechamento, resultado, taxas, MAE/MFE monetários e horários originais. A duração é aproximada pelos horários locais do relatório. Cada linha de saída parcial continua separada, como no relatório do NinjaTrader. Nome de estratégia ATM não é tratado automaticamente como setup.

Risco inicial e R:R ficam desconhecidos até o aluno preenchê-los. A avaliação da execução continua pendente; um resultado financeiro não preenche Execution Score.

## Reimportação

Antes da confirmação, o portal confere os identificadores das operações desta importação no mesmo aluno e conta. Reexportar o mesmo período ou um período sobreposto preservando os dados permite ignorar linhas já importadas por este importador. A numeração Trade number e o lucro acumulado não participam da identificação.

Linhas idênticas de saídas parciais são preservadas por ocorrência. Operações cadastradas manualmente, por outro importador ou com dados/horários alterados podem precisar de conferência manual. Evite confirmar o mesmo lote em duas abas ao mesmo tempo: a conferência ocorre no navegador, sem uma nova restrição no banco.

## Limites e ativação

Suporte ao relatório de operações encerradas do **NinjaTrader Desktop**, CSV em inglês e aliases portugueses documentados no módulo. NinjaTrader Web, API em tempo real, XLSX, Orders e Executions exigem adaptadores diferentes. CSVs podem usar vírgula, ponto e vírgula ou tabulação e codificações UTF-8/UTF-16. Limites: 10 MB e 10.000 linhas por arquivo.

A atualização usa as colunas existentes do diário, sem novo SQL, Edge Function ou secret. As regras existentes de privacidade e os avisos ao mentor por novos registros continuam valendo. Testes usam relatórios representativos construídos com os campos oficiais; a conferência final do primeiro arquivo real do aluno deve comparar o total líquido com o NinjaTrader.

Fontes oficiais:

- https://static.ninjatrader.com/support/helpGuides/nt8/using_trade_performance.htm
- https://static.ninjatrader.com/support/helpGuides/nt8/performance_displays.htm
- https://static.ninjatrader.com/support/helpGuides/nt8/working_with_data_grids.htm

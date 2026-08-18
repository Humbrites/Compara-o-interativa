/**
 * O prompt que a pessoa leva para o ChatGPT dela.
 *
 * A IA aqui e a DO USUARIO: o sistema nao fala com a OpenAI nem com ninguem.
 * Ele entrega um texto pronto, a pessoa cola esse texto junto com a tabela da
 * construtora na conta que ela ja paga, e traz o JSON de volta. Sem chave para
 * configurar, sem custo por importacao e sem a tabela de vendas do cliente
 * passando por um servidor nosso.
 *
 * Por isso o prompt e RIGIDO no formato: quem valida a resposta e
 * `validarImportacao.ts`, e ele so consegue ser exigente se o que foi pedido
 * tambem foi. As tres travas que importam:
 *
 * 1. Um unico bloco ```json — e o que a validacao consegue recortar de um
 *    texto que quase sempre vem com "Claro! Aqui esta:" na frente.
 * 2. NUNCA inventar. Campo incerto vai null e entra em `duvidas`. Um numero
 *    chutado num material de venda e pior do que um campo vazio, porque
 *    ninguem desconfia dele.
 * 3. Numero como number, ja convertido do formato brasileiro — que e onde
 *    "R$ 800.000" viraria oitocentos se ninguem dissesse nada.
 *
 * Funcao PURA de proposito: e o que deixa testar o texto sem montar a tela.
 */

/** Os quatro estados que a importacao aceita. */
export const STATUS_ACEITOS = ['disponivel', 'reservada', 'vendida', 'indisponivel'] as const

/** O modelo de JSON que vai dentro do prompt — e o mesmo que a validacao espera. */
const EXEMPLO = `{
  "torres": 2,
  "unidades": [
    {
      "identificacao": "Apto 1204",
      "torre": "A",
      "andar": 12,
      "numero": "1204",
      "tipologia": "3 dormitórios",
      "metragem": 82.5,
      "metragem_total": 105.3,
      "area_comum": 22.8,
      "area_terraco": null,
      "espaco_complementar": null,
      "dormitorios": 3,
      "suites": 1,
      "banheiros": 2,
      "vagas": 2,
      "vagas_detalhe": "Vagas 84 e 27, simples",
      "valor": 845000,
      "status": "disponivel",
      "observacoes": null
    },
    {
      "identificacao": "Apto 1301",
      "torre": "A",
      "andar": 13,
      "numero": "1301",
      "tipologia": "2 suítes",
      "metragem": 82.5,
      "metragem_total": 105.3,
      "area_comum": 22.8,
      "area_terraco": 9.4,
      "espaco_complementar": "Hobby box 4,5 m²",
      "dormitorios": 2,
      "suites": 2,
      "banheiros": 2,
      "vagas": 1,
      "vagas_detalhe": "Vaga 46, dupla",
      "valor": 870000,
      "status": "reservada",
      "observacoes": null,
      "fluxo": {
        "nome": "Condição da cobertura",
        "entrada_pct": 20,
        "entrada_parcelas": 1,
        "parcelas": 30,
        "parcela_valor": 4000,
        "financiamento_pct": 50
      }
    }
  ],
  "fluxo_construtora": {
    "nome": "Tabela de lançamento",
    "entrada_pct": 10,
    "entrada_valor": null,
    "entrada_parcelas": 4,
    "parcelas": 30,
    "parcela_valor": 3500,
    "reforcos_qtd": 6,
    "reforco_valor": 20000,
    "reforcos_periodicidade": "semestral",
    "chaves_pct": 5,
    "chaves_valor": null,
    "financiamento_pct": 50,
    "financiamento_valor": null,
    "pos_parcelas": 24,
    "pos_parcela_valor": 2000,
    "pos_reforcos_qtd": 4,
    "pos_reforco_valor": 15000,
    "descricao": "Entrada em 4x, mensais durante a obra, semestrais em junho e dezembro."
  },
  "duvidas": [
    "A coluna \\"G\\" pode ser vagas de garagem — deixei vagas como null nas unidades da torre B.",
    "A coluna \\"Parcela única\\" não diz quando é paga — registrei na descrição do fluxo em vez de escolher um bloco."
  ]
}`

interface Opcoes {
  /** O nome do empreendimento, so para a IA saber do que se trata. */
  empreendimento?: string | null
}

/**
 * O texto que o botao "Copiar prompt" poe na area de transferencia.
 */
export function montarPromptDeImportacao({ empreendimento }: Opcoes = {}): string {
  const alvo = empreendimento?.trim()

  return `Você vai ler uma TABELA DE UNIDADES que uma construtora enviou${
    alvo ? ` para o empreendimento "${alvo}"` : ''
  } e transformá-la em JSON.

A tabela vem logo abaixo destas instruções (colada da planilha, de um PDF ou de um CSV). Leia-a inteira antes de responder.

REGRAS QUE NÃO SE QUEBRAM
1. NÃO INVENTE NADA. Campo que a tabela não traz — ou que você não tem certeza de como ler — vai como null, e você escreve uma frase em "duvidas" explicando o que ficou em aberto. É melhor um campo vazio do que um número chutado.
2. Uma linha da tabela = uma unidade. Ignore cabeçalhos, subtotais, legendas, rodapés e linhas em branco.
3. Números vão como NUMBER puro, já convertidos do formato brasileiro, SEM "R$", sem ponto de milhar e sem "m²":
   - "R$ 845.000,00" → 845000
   - "82,5 m²" → 82.5
   - o ponto só é separador de milhar quando divide grupos de exatamente 3 dígitos ("1.234.567" → 1234567); "80.5" é oitenta e meio.
4. Percentual vai como o número do percentual (20% → 20), nunca como fração (não use 0.2).
5. "status" só pode ser um destes textos, ou null: ${STATUS_ACEITOS.join(', ')}.
   - livre, à venda, disponível, ok → "disponivel"
   - reservado, com proposta → "reservada"
   - vendido → "vendida"
   - permutada, bloqueada, do proprietário, não comercializada → "indisponivel"
   - qualquer outra coisa → null, e registre em "duvidas".
6. "numero" vai como TEXTO (pode ter letra: "1204", "05A"). "torre" é só o identificador do bloco ("A", "Torre 2").
7. Toda unidade precisa ter pelo menos um entre identificacao, torre e numero.

OS TIPOS DE ÁREA — NUNCA SOME UM COM O OUTRO, NUNCA TROQUE UM PELO OUTRO
Cada tipo de área tem o seu campo. Somar dois deles muda o preço do m² e ninguém percebe.
- ÁREA PRIVATIVA → "metragem". Sinônimos de coluna: "Área Priv.", "A. Privativa", "Área privativa", "Metragem privativa", "Privativa", "Útil".
- ÁREA TOTAL / GLOBAL → "metragem_total". Sinônimos: "Área total", "Total", "Área global", "Global".
- ÁREA COMUM → "area_comum", campo PRÓPRIO. Sinônimos: "Área comum", "A. Comum", "Fração comum". Ela NUNCA vai em "metragem" e NUNCA é somada à privativa.
- TERRAÇO / SACADA / VARANDA com área própria → "area_terraco".
- ESPAÇO COMPLEMENTAR (hobby box, depósito, adega, box privativo) → "espaco_complementar", em TEXTO, preservando o que a tabela diz ("Hobby box 4,5 m²").
- Se a tabela traz UMA metragem só e não diz qual é, ponha em "metragem" e registre a dúvida.

TIPOLOGIA → DORMITÓRIOS E SUÍTES
- Suíte É dormitório. "2 suítes", sem nenhuma informação independente de dormitórios, vira "suites": 2 E "dormitorios": 2 — não duplique (não vira 4) e não deixe dormitórios em branco.
- "3 dormitórios sendo 1 suíte" → "dormitorios": 3 e "suites": 1.
- A tipologia original vai SEMPRE em "tipologia", com as palavras da tabela.

VAGAS
- "vagas" é QUANTAS vagas a unidade tem — conte as vagas listadas. "Vaga 84 simples, Vaga 27 simples" → 2. "Vaga 46 dupla" → 1: dupla descreve o tamanho da vaga, não duas vagas.
- "vagas_detalhe" guarda em TEXTO o que a tabela dizia (números e tipo): "Vagas 84 e 27, simples".
- Nunca invente quantidade nem característica que a tabela não traz.

TORRES
- "torres" é um campo do TOPO do JSON (do prédio, não da unidade): quantas torres/blocos o empreendimento tem.
- Preencha só quando a tabela deixa concluir com clareza — uma coluna de torre/bloco/edificação com dois valores distintos são 2 torres; uma tabela sem menção nenhuma a torre, com numeração contínua, é 1 torre.
- Na dúvida, "torres": null e uma frase em "duvidas". Nunca chute.

A CONDIÇÃO DE PAGAMENTO ("fluxo_construtora")
Esta é a parte que mais se perde, então leia com atenção. A tabela descreve o pagamento em BLOCOS, e cada bloco tem QUANTIDADE e VALOR (ou percentual). Capture SEMPRE a quantidade de parcelas de cada bloco — "30x de R$ 3.500" são duas informações, não uma.

Os blocos e onde cada um entra:
- ENTRADA / sinal / ato: "entrada_pct" (ou "entrada_valor") e, se ela for PARCELADA, "entrada_parcelas" = em quantas vezes. "Entrada de 10% em 4x", "sinal + 3 parcelas" → entrada_parcelas = 4.
- MENSAIS DURANTE A OBRA: "parcelas" = quantas, "parcela_valor" = quanto cada uma. Aparece como mensais, parcelas de obra, plano de obra.
- SEMESTRAIS / BALÕES / REFORÇOS / INTERCALADAS: são A MESMA COISA — "reforcos_qtd" = quantos, "reforco_valor" = quanto cada um. Se a tabela disser o período, ponha "reforcos_periodicidade" com "semestral" ou "anual". Se ela só disser "balões" sem período, use "semestral" e registre isso em "duvidas".
- CHAVES / entrega / habite-se: "chaves_pct" quando vier em %, "chaves_valor" quando vier em R$.
- FINANCIAMENTO / SALDO NA ENTREGA: colunas chamadas "financiamento", "saldo", "saldo devedor", "restante", "na entrega", "quitação" são TODAS o mesmo componente — o que resta a pagar QUANDO A OBRA ENTREGA (financiado no banco ou quitado ali). Vai em "financiamento_pct" ou "financiamento_valor". Não é desembolso durante a obra: nunca some esse valor às mensais.
- DEPOIS DAS CHAVES (financiamento direto com a construtora, pós-obra, pós-chaves): mensais em "pos_parcelas" + "pos_parcela_valor", e semestrais/balões em "pos_reforcos_qtd" + "pos_reforco_valor". Só entra aqui o que a tabela diz que é PAGO APÓS A ENTREGA.

- PARCELA ÚNICA / "única" / "pagamento único": só entra num bloco quando a tabela diz QUANDO ela é paga (no ato → entrada; na entrega → chaves; depois das chaves → pós-chaves). Se a tabela não deixa claro, não escolha um bloco: descreva em "descricao" e registre em "duvidas".

Regras do fluxo:
- NEM TODA TABELA TEM TODOS OS BLOCOS. Uma traz entrada + mensais + balão semestral + financiamento; outra traz entrada parcelada + mensais + semestrais + pós-chaves. O bloco que NÃO EXISTE na tabela vai null — nunca 0, nunca um número inventado, nunca copiado do exemplo abaixo.
- Percentual quando a tabela dá percentual; R$ quando ela dá reais. Não converta um no outro por conta própria.
- O que a tabela diz e não coube em nenhum campo (mês dos reforços, índice de correção, desconto à vista) vai em "descricao", com as suas palavras da tabela.
- Se a tabela não trouxer condição de pagamento nenhuma, mande "fluxo_construtora": null.
- Se a condição VARIAR POR UNIDADE, ponha em "fluxo_construtora" a condição geral e, só nas unidades que fogem dela, acrescente uma chave "fluxo" DENTRO da unidade, com exatamente os mesmos campos. As unidades sem "fluxo" próprio seguem a geral.

FORMATO DA RESPOSTA
Responda APENAS com um bloco de código JSON, entre \`\`\`json e \`\`\`, exatamente com estas chaves (use null no que não souber, nunca omita uma chave de unidade):

\`\`\`json
${EXEMPLO}
\`\`\`

Não escreva nada fora do bloco JSON — nem introdução, nem comentários, nem explicação depois.

Antes de responder, confira a regra-mãe: NADA INVENTADO. Todo campo de que você não tem certeza vai null e vira uma frase em "duvidas" — quem conferir a prévia corrige em segundos, mas um número chutado passa direto para o material de venda.

TABELA DA CONSTRUTORA (cole abaixo desta linha):
`
}

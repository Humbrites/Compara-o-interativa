/**
 * As duas funções PURAS da importação: o prompt que a pessoa leva ao ChatGPT e
 * a validação da resposta que ela cola de volta.
 *
 * Rodam sem navegador e sem montar a tela — Node lê o TypeScript direto
 * (`node --test`, com o type stripping do Node 22). O que se testa aqui é o
 * que a tela não tem como testar sozinha: o texto de chat que vem com conversa
 * em volta do JSON, o número em formato brasileiro e o status inventado.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { montarPromptDeImportacao, STATUS_ACEITOS } from '../src/lib/promptImportacao.ts'
import { extrairJson, lerNumeroBr, validarRespostaDaIa } from '../src/lib/validarImportacao.ts'

/* --- O prompt ------------------------------------------------------- */

test('o prompt pede o formato exato que a validação sabe ler', () => {
  const prompt = montarPromptDeImportacao({ empreendimento: 'Residencial Aurora' })

  assert.match(prompt, /Residencial Aurora/)
  assert.match(prompt, /```json/)
  for (const status of STATUS_ACEITOS) assert.match(prompt, new RegExp(status))
  // As três travas que fazem a validação conseguir ser exigente.
  assert.match(prompt, /NÃO INVENTE NADA/)
  assert.match(prompt, /1\.234\.567/)
  assert.match(prompt, /duvidas/)

  // Sem nome do empreendimento o prompt continua válido.
  assert.match(montarPromptDeImportacao(), /TABELA DA CONSTRUTORA/)
})

/* --- Recorte do JSON ------------------------------------------------ */

test('o JSON é recortado de um texto de chat, com ou sem cerca', () => {
  assert.equal(extrairJson('Claro! Aqui está:\n```json\n{"a":1}\n```\nQualquer dúvida, é só falar.'), '{"a":1}')
  assert.equal(extrairJson('```\n{"a":1}\n```'), '{"a":1}')
  // Sem cerca nenhuma: do primeiro { ao último }.
  assert.equal(extrairJson('Segue: {"a":1} — pronto.'), '{"a":1}')
  assert.equal(extrairJson('não tem json aqui'), null)
})

/* --- Números -------------------------------------------------------- */

test('número em formato brasileiro: o ponto só é milhar em grupos de 3', () => {
  assert.equal(lerNumeroBr('R$ 845.000,00'), 845000)
  assert.equal(lerNumeroBr('1.234.567'), 1234567)
  assert.equal(lerNumeroBr('80.5'), 80.5)
  assert.equal(lerNumeroBr('82,5 m²'), 82.5)
  assert.equal(lerNumeroBr(845000), 845000)
  assert.equal(lerNumeroBr('oitocentos mil'), null)
  assert.equal(lerNumeroBr(null), null)
})

/* --- A validação ---------------------------------------------------- */

test('resposta boa, com conversa em volta, passa e chega normalizada', () => {
  const colado = `Claro! Analisei a tabela. Aqui está o JSON:

\`\`\`json
{
  "unidades": [
    { "identificacao": "Apto 1204", "torre": "A", "andar": 12, "numero": "1204",
      "metragem": "82,5", "valor": "R$ 845.000,00", "status": "Disponível", "vagas": 2 },
    { "identificacao": "Apto 1205", "numero": 1205, "valor": null, "status": null }
  ],
  "duvidas": ["A coluna G pode ser vagas."],
  "fluxo_construtora": { "entrada_pct": 20, "parcelas": 36, "parcela_valor": "4.500" }
}
\`\`\`

Se quiser, posso detalhar por torre.`

  const resultado = validarRespostaDaIa(colado)
  assert.deepEqual(resultado.problemas, [])
  assert.ok(resultado.ok)
  assert.equal(resultado.unidades.length, 2)

  const [um, dois] = resultado.unidades
  assert.equal(um.valor, 845000)
  assert.equal(um.metragem, 82.5)
  assert.equal(um.status, 'disponivel')
  assert.equal(um.vagas, 2)
  // Campo que a tabela não trouxe vira null, nunca 0 nem string vazia.
  assert.equal(um.dormitorios, null)
  assert.equal(um.observacoes, null)

  // Número onde se esperava texto é aceito e vira texto.
  assert.equal(dois.numero, '1205')
  assert.equal(dois.valor, null)
  assert.equal(dois.status, null)

  assert.equal(resultado.duvidas.length, 1)
  assert.equal(resultado.fluxo_construtora?.parcela_valor, 4500)
})

test('status fora dos quatro valores é recusado, dizendo qual unidade', () => {
  const resultado = validarRespostaDaIa('{"unidades":[{"identificacao":"Apto 501","status":"talvez"}]}')

  assert.equal(resultado.ok, false)
  assert.equal(resultado.problemas.length, 1)
  assert.match(resultado.problemas[0], /"talvez"/)
  assert.match(resultado.problemas[0], /Apto 501/)
  assert.match(resultado.problemas[0], /disponivel, reservada, vendida, indisponivel/)
})

test('número ilegível, campo estranho e unidade sem nome viram erro legível', () => {
  const resultado = validarRespostaDaIa(`{"unidades":[
    {"identificacao":"Apto 101","valor":"a combinar"},
    {"identificacao":"Apto 102","preco":500000},
    {"metragem":70}
  ]}`)

  assert.equal(resultado.ok, false)
  const texto = resultado.problemas.join(' | ')
  assert.match(texto, /"valor" da unidade "Apto 101" não é um número válido/)
  assert.match(texto, /Campo desconhecido "preco"/)
  assert.match(texto, /não tem identificação, torre nem número/)
})

test('texto sem JSON e JSON quebrado explicam o que fazer', () => {
  const semJson = validarRespostaDaIa('Desculpe, não consegui ler a tabela.')
  assert.equal(semJson.ok, false)
  assert.match(semJson.problemas[0], /Não encontrei nenhum JSON/)

  const quebrado = validarRespostaDaIa('```json\n{"unidades":[{"identificacao":"Apto 1"\n```')
  assert.equal(quebrado.ok, false)
  assert.match(quebrado.problemas[0], /malformado/)

  const semLista = validarRespostaDaIa('{"apartamentos":[]}')
  assert.match(semLista.problemas[0], /lista "unidades"/)

  const vazia = validarRespostaDaIa('{"unidades":[]}')
  assert.match(vazia.problemas[0], /vazia/)
})

test('fluxo da construtora todo vazio não vira condição de pagamento', () => {
  const resultado = validarRespostaDaIa(
    '{"unidades":[{"identificacao":"Apto 1"}],"fluxo_construtora":{"entrada_pct":null,"parcelas":null}}',
  )
  assert.ok(resultado.ok)
  assert.equal(resultado.fluxo_construtora, null)
})

/* --- A condição de pagamento estruturada ---------------------------- */

test('o prompt pede os blocos da condição de pagamento com as quantidades', () => {
  const prompt = montarPromptDeImportacao()

  // Cada bloco, com o nome que a tabela real usa.
  for (const campo of [
    'entrada_parcelas',
    'parcelas',
    'reforcos_qtd',
    'reforcos_periodicidade',
    'chaves_pct',
    'financiamento_pct',
    'pos_parcelas',
    'pos_reforcos_qtd',
  ]) {
    assert.match(prompt, new RegExp(campo), `o prompt não pede ${campo}`)
  }

  // Balão = reforço = semestral: a mesma coisa com três nomes na planilha.
  assert.match(prompt, /BALÕES/)
  assert.match(prompt, /A MESMA COISA/)
  // Financiamento é o saldo NA ENTREGA, não desembolso de obra.
  assert.match(prompt, /SALDO NA ENTREGA/)
  // Nem toda tabela tem todo bloco — o que falta vai null.
  assert.match(prompt, /NEM TODA TABELA TEM TODOS OS BLOCOS/)
  // Condição que varia por unidade.
  assert.match(prompt, /"fluxo" DENTRO da unidade/)
})

test('a condição de pagamento completa é lida campo a campo', () => {
  const resultado = validarRespostaDaIa(`{
    "unidades": [{ "identificacao": "Apto 101", "valor": 800000 }],
    "fluxo_construtora": {
      "nome": "Tabela de lançamento",
      "entrada_pct": 10,
      "entrada_parcelas": 4,
      "parcelas": 30,
      "parcela_valor": "3.500",
      "reforcos_qtd": 6,
      "reforco_valor": 20000,
      "reforcos_periodicidade": "Semestral",
      "chaves_pct": 5,
      "pos_parcelas": 24,
      "pos_parcela_valor": 2000,
      "pos_reforcos_qtd": 4,
      "pos_reforco_valor": 15000
    }
  }`)

  assert.ok(resultado.ok, resultado.problemas.join(' | '))
  const fluxo = resultado.fluxo_construtora!
  assert.equal(fluxo.entrada_parcelas, 4)
  assert.equal(fluxo.parcela_valor, 3500, 'número em pt-BR converte na mesma regra do projeto')
  assert.equal(fluxo.reforcos_periodicidade, 'semestral')
  assert.equal(fluxo.pos_parcelas, 24)
  assert.equal(fluxo.pos_reforco_valor, 15000)
  // Bloco que a tabela não tem fica null — nunca 0.
  assert.equal(fluxo.financiamento_pct, null)
})

test('a condição de pagamento recusa percentual absurdo, negativo e periodicidade inventada', () => {
  const resultado = validarRespostaDaIa(`{
    "unidades": [{ "identificacao": "Apto 101" }],
    "fluxo_construtora": { "entrada_pct": 250, "parcelas": -3, "reforcos_qtd": 6, "reforcos_periodicidade": "quinzenal" }
  }`)

  assert.equal(resultado.ok, false)
  const texto = resultado.problemas.join(' | ')
  assert.match(texto, /"entrada_pct".*percentual e veio 250/)
  assert.match(texto, /"parcelas".*não pode ser negativo/)
  assert.match(texto, /periodicidade dos reforços/)
})

test('quantidade zerada é campo em branco, não zero', () => {
  const resultado = validarRespostaDaIa(
    '{"unidades":[{"identificacao":"Apto 1"}],"fluxo_construtora":{"parcelas":0,"parcela_valor":2500}}',
  )
  assert.ok(resultado.ok)
  assert.equal(resultado.fluxo_construtora?.parcelas, null)
  assert.equal(resultado.fluxo_construtora?.parcela_valor, 2500)
})

test('a unidade pode trazer condição de pagamento própria', () => {
  const resultado = validarRespostaDaIa(`{
    "unidades": [
      { "identificacao": "Apto 101", "valor": 800000 },
      { "identificacao": "Cobertura", "valor": 1500000, "fluxo": { "entrada_pct": 20, "parcelas": 24 } }
    ],
    "fluxo_construtora": { "entrada_pct": 10, "parcelas": 30 }
  }`)

  assert.ok(resultado.ok, resultado.problemas.join(' | '))
  // "fluxo" não é campo desconhecido de unidade.
  assert.equal(resultado.unidades[0].fluxo, undefined)
  assert.equal(resultado.unidades[1].fluxo?.entrada_pct, 20)
  assert.equal(resultado.fluxo_construtora?.entrada_pct, 10)
})

test('o outro formato: entrada, mensais, balões semestrais e financiamento, com status misto', () => {
  const resultado = validarRespostaDaIa(`{
    "unidades": [
      { "identificacao": "Apto 301", "numero": "301", "valor": 1000000, "status": "disponível" },
      { "identificacao": "Apto 302", "numero": "302", "valor": 1000000, "status": "reservado" }
    ],
    "fluxo_construtora": {
      "nome": "Tabela obra",
      "entrada_pct": 20,
      "parcelas": 48,
      "parcela_valor": 2500,
      "reforcos_qtd": 8,
      "reforco_valor": 25000,
      "reforcos_periodicidade": "semestral",
      "financiamento_pct": 40
    }
  }`)

  assert.ok(resultado.ok, resultado.problemas.join(' | '))
  assert.equal(resultado.unidades[0].status, 'disponivel')
  assert.equal(resultado.unidades[1].status, 'reservada')

  const fluxo = resultado.fluxo_construtora!
  assert.equal(fluxo.parcelas, 48)
  assert.equal(fluxo.reforcos_qtd, 8)
  assert.equal(fluxo.financiamento_pct, 40)
  // Esta tabela não tem pós-chaves nem entrada parcelada: null, não zero.
  assert.equal(fluxo.pos_parcelas, null)
  assert.equal(fluxo.entrada_parcelas, null)
})

/* --- Tipos de área, suítes e vagas ---------------------------------- */

test('os tipos de área têm cada um o seu campo — e nenhum é somado ao outro', () => {
  const resultado = validarRespostaDaIa(`{
    "unidades": [
      { "identificacao": "Apto 1204", "numero": "1204",
        "metragem": "82,5", "metragem_total": "105,3",
        "area_comum": "22,8", "area_terraco": "9,4",
        "espaco_complementar": "Hobby box 4,5 m²",
        "vagas": 2, "vagas_detalhe": "Vagas 84 e 27, simples" }
    ]
  }`)

  assert.ok(resultado.ok, resultado.problemas.join(' | '))
  const unidade = resultado.unidades[0]
  assert.equal(unidade.metragem, 82.5)
  assert.equal(unidade.metragem_total, 105.3)
  // A área comum fica no campo dela: nem soma à privativa, nem toma o lugar dela.
  assert.equal(unidade.area_comum, 22.8)
  assert.equal(unidade.area_terraco, 9.4)
  assert.equal(unidade.espaco_complementar, 'Hobby box 4,5 m²')
  assert.equal(unidade.vagas, 2)
  assert.equal(unidade.vagas_detalhe, 'Vagas 84 e 27, simples')
})

test('suíte é dormitório: a contagem só é derivada quando a tabela não a traz', () => {
  const so2Suites = validarRespostaDaIa('{"unidades":[{"identificacao":"Apto 1","tipologia":"2 suítes","suites":2}]}')
  assert.ok(so2Suites.ok, so2Suites.problemas.join(' | '))
  assert.equal(so2Suites.unidades[0].suites, 2)
  assert.equal(so2Suites.unidades[0].dormitorios, 2)
  assert.equal(so2Suites.unidades[0].tipologia, '2 suítes')

  // Dormitórios informado MANDA: "3 dormitórios sendo 1 suíte" continua 3.
  const tresComUma = validarRespostaDaIa('{"unidades":[{"identificacao":"Apto 2","dormitorios":3,"suites":1}]}')
  assert.equal(tresComUma.unidades[0].dormitorios, 3)
  assert.equal(tresComUma.unidades[0].suites, 1)

  // Sem suítes não há o que derivar: continua "não informado", nunca 0.
  const semNada = validarRespostaDaIa('{"unidades":[{"identificacao":"Apto 3","suites":null}]}')
  assert.equal(semNada.unidades[0].dormitorios, null)
  assert.equal(semNada.unidades[0].suites, null)
})

test('torres é campo do prédio, no topo do JSON, e recusa número impossível', () => {
  const comTorres = validarRespostaDaIa('{"torres":2,"unidades":[{"identificacao":"Apto 1"}]}')
  assert.ok(comTorres.ok, comTorres.problemas.join(' | '))
  assert.equal(comTorres.torres, 2)

  // Sem menção a torre a IA deixa null — e a prévia pergunta.
  assert.equal(validarRespostaDaIa('{"unidades":[{"identificacao":"Apto 1"}]}').torres, null)

  const zero = validarRespostaDaIa('{"torres":0,"unidades":[{"identificacao":"Apto 1"}]}')
  assert.equal(zero.ok, false)
  assert.match(zero.problemas.join(' | '), /"torres" precisa ser pelo menos 1/)

  const texto = validarRespostaDaIa('{"torres":"duas","unidades":[{"identificacao":"Apto 1"}]}')
  assert.equal(texto.ok, false)
  assert.match(texto.problemas.join(' | '), /"torres" não é um número válido/)
})

test('o prompt ensina os tipos de área, a tipologia, as vagas e as torres', () => {
  const prompt = montarPromptDeImportacao({ empreendimento: 'Residencial Vivatto' })

  // Áreas: cada tipo no seu campo, com os sinônimos que as tabelas usam.
  assert.match(prompt, /Área Priv\./)
  assert.match(prompt, /area_comum/)
  assert.match(prompt, /NUNCA é somada à privativa/)
  assert.match(prompt, /area_terraco/)
  assert.match(prompt, /espaco_complementar/)
  // Tipologia: suíte é dormitório, sem duplicar.
  assert.match(prompt, /Suíte É dormitório/)
  assert.match(prompt, /3 dormitórios sendo 1 suíte/)
  // Vagas: contar as listadas; "dupla" não vira 2.
  assert.match(prompt, /vagas_detalhe/)
  assert.match(prompt, /dupla descreve o tamanho da vaga, não duas vagas/)
  // Torres: campo do topo, e null na dúvida.
  assert.match(prompt, /"torres" é um campo do TOPO/)
  assert.match(prompt, /"torres": null/)
  // Parcela única sem lugar definido não escolhe bloco.
  assert.match(prompt, /PARCELA ÚNICA/)
})

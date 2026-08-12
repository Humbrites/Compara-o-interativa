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

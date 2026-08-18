/**
 * Os números gerais do empreendimento e a BASE do valor do m².
 *
 * O m² é o número que decide compra, e a base muda o resultado em dezenas de
 * por cento: 800 mil em 80 m² privativos são 10.000/m²; os mesmos 800 mil em
 * 100 m² totais são 8.000/m². Por isso a base é configuração da conta — e por
 * isso ela é testada nos dois sentidos, junto da regra que nunca pode cair: a
 * área COMUM não entra em conta nenhuma.
 *
 * O outro teste daqui é o da MIGRAÇÃO: ela roda sozinha quando o servidor
 * sobe, inclusive no banco que já está em uso. Rodar duas vezes tem de ser tão
 * inofensivo quanto rodar uma.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import Database from 'better-sqlite3'

const executar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// O banco do teste nasce numa pasta descartável, NUNCA em data/compara.db: o
// módulo abre o arquivo assim que é importado.
const pasta = await mkdtemp(join(tmpdir(), 'compara-resumo-'))
process.env.DB_FILE = join(pasta, 'resumo.db')

const { BASE_M2_PADRAO, calcularResumo, normalizarBaseM2 } = await import('../src/resumo.js')

test.after(async () => {
  await rm(pasta, { recursive: true, force: true })
})

/** Uma linha como a consulta do resumo devolve. */
const linha = (campos) => ({
  metragem: null,
  metragem_total: null,
  dormitorios: null,
  suites: null,
  banheiros: null,
  vagas: null,
  valor: null,
  valor_do_fluxo: null,
  ...campos,
})

/* ------------------------------------------------------------------ */

test('o valor do m² do empreendimento sai pela base da conta', () => {
  const unidades = [
    linha({ metragem: 80, metragem_total: 100, valor: 800000 }),
    linha({ metragem: 120, metragem_total: 150, valor: 1200000 }),
  ]

  // Ponderado: 2.000.000 ÷ 200 privativas; ÷ 250 totais.
  assert.equal(calcularResumo(unidades, 'privativa').valor_m2, 10000)
  assert.equal(calcularResumo(unidades, 'total').valor_m2, 8000)

  // Sem dizer a base vale o padrão do projeto — a área privativa.
  assert.equal(BASE_M2_PADRAO, 'privativa')
  assert.equal(calcularResumo(unidades).valor_m2, 10000)

  // Base inventada não pode virar "sem m²": cai no padrão.
  assert.equal(normalizarBaseM2('area-util'), 'privativa')
  assert.equal(calcularResumo(unidades, 'area-util').valor_m2, 10000)
})

test('a metragem que falta é suprida pela outra, em qualquer base', () => {
  const soPrivativa = [linha({ metragem: 80, valor: 800000 })]
  assert.equal(calcularResumo(soPrivativa, 'total').valor_m2, 10000)

  const soTotal = [linha({ metragem_total: 100, valor: 800000 })]
  assert.equal(calcularResumo(soTotal, 'privativa').valor_m2, 8000)

  // Sem metragem nenhuma não há m² — e não é 0.
  assert.equal(calcularResumo([linha({ valor: 800000 })], 'privativa').valor_m2, null)
})

test('a área comum NÃO entra na conta do m² nem na faixa de metragem', () => {
  const semComum = [linha({ metragem: 80, valor: 800000 })]
  const comComum = [linha({ metragem: 80, area_comum: 22.8, area_terraco: 9.4, valor: 800000 })]

  for (const base of ['privativa', 'total']) {
    assert.equal(calcularResumo(comComum, base).valor_m2, calcularResumo(semComum, base).valor_m2)
    assert.equal(calcularResumo(comComum, base).valor_m2, 10000)
  }

  // A faixa de metragem exibida continua sendo a privativa pura.
  const resumo = calcularResumo(comComum, 'privativa')
  assert.equal(resumo.metragem_min, 80)
  assert.equal(resumo.metragem_max, 80)
})

test('o preço da tabela de venda vale quando a unidade não tem valor próprio', () => {
  const unidades = [linha({ metragem: 50, valor: null, valor_do_fluxo: 500000 })]
  assert.equal(calcularResumo(unidades, 'privativa').valor_m2, 10000)
  assert.equal(calcularResumo(unidades, 'privativa').valorMin, 500000)
})

/* --- A migração ----------------------------------------------------- */

test('a migração roda duas vezes sem estragar o banco nem o dado que já existe', async () => {
  const arquivo = join(pasta, 'migracao.db')

  // Um banco "antigo": as tabelas do formato anterior, sem as colunas novas.
  const antes = new Database(arquivo)
  antes.exec(`
    CREATE TABLE empreendimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empreendimento_id INTEGER NOT NULL,
      identificacao TEXT,
      metragem REAL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO empreendimentos (nome) VALUES ('Residencial Antigo');
    INSERT INTO unidades (empreendimento_id, identificacao, metragem) VALUES (1, 'Apto 101', 82.5);
  `)
  antes.close()

  const url = pathToFileURL(join(RAIZ, 'src/db.js')).href
  const subir = () =>
    executar('node', ['-e', 'import(process.argv[1])', url], {
      cwd: RAIZ,
      env: { ...process.env, DB_FILE: arquivo },
    })

  await subir()
  await subir()

  const depois = new Database(arquivo)
  const colunas = (tabela) => depois.prepare(`PRAGMA table_info(${tabela})`).all()
  const nomes = (tabela) => colunas(tabela).map((c) => c.name)

  for (const coluna of ['area_comum', 'area_terraco', 'espaco_complementar', 'vagas_detalhe']) {
    assert.equal(nomes('unidades').filter((n) => n === coluna).length, 1, `unidades.${coluna}`)
  }
  assert.equal(nomes('empreendimentos').filter((n) => n === 'torres').length, 1)

  // base_m2 nasce preenchida: a coluna é NOT NULL com padrão.
  const baseM2 = colunas('contas').find((c) => c.name === 'base_m2')
  assert.ok(baseM2, 'contas.base_m2 não foi criada')
  assert.equal(baseM2.notnull, 1)
  assert.match(String(baseM2.dflt_value), /privativa/)

  // O que já estava gravado continua igual, e as colunas novas nascem NULL.
  const unidade = depois.prepare('SELECT * FROM unidades WHERE id = 1').get()
  assert.equal(unidade.identificacao, 'Apto 101')
  assert.equal(unidade.metragem, 82.5)
  assert.equal(unidade.area_comum, null)
  assert.equal(unidade.vagas_detalhe, null)
  assert.equal(depois.prepare('SELECT torres FROM empreendimentos WHERE id = 1').get().torres, null)

  depois.close()
})

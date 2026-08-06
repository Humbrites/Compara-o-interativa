import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_FILE = process.env.DB_FILE || join(DATA_DIR, 'compara.db')

/** Onde os arquivos de imagem enviados pelo formulario sao gravados. */
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')

/** A pasta de dados (banco, uploads e caches) — fora do Git. */
export const PASTA_DADOS = DATA_DIR

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new Database(DB_FILE)

// WAL deixa leitura e escrita concorrentes sem travar o arquivo.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS empreendimentos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    construtora   TEXT,
    cidade        TEXT,
    bairro        TEXT,
    endereco      TEXT,
    latitude      REAL,
    longitude     REAL,
    valor_m2      REAL,
    metragem_min  REAL,
    metragem_max  REAL,
    dormitorios   INTEGER,
    suites        INTEGER,
    banheiros     INTEGER,
    vagas         INTEGER,
    status_obra   TEXT,
    entrega       TEXT,
    tipo          TEXT,
    imagem_url    TEXT,
    observacoes   TEXT,
    criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fluxos_pagamento (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimento_id INTEGER NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
    nome              TEXT,
    entrada_pct       REAL,
    entrada_valor     REAL,
    parcelas          INTEGER,
    parcela_valor     REAL,
    reforcos_qtd      INTEGER,
    reforco_valor     REAL,
    chaves_pct        REAL,
    financiamento_pct REAL,
    financiamento_valor REAL,
    descricao         TEXT,
    observacoes       TEXT,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_fluxos_empreendimento
    ON fluxos_pagamento(empreendimento_id);

  -- Galeria: o arquivo em si fica em data/uploads; aqui guardamos so o nome
  -- gerado, o nome original (para exibir) e a posicao. Ordem 0 = capa.
  CREATE TABLE IF NOT EXISTS imagens (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimento_id INTEGER NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
    arquivo           TEXT NOT NULL,
    nome_original     TEXT,
    tamanho           INTEGER,
    ordem             INTEGER NOT NULL DEFAULT 0,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_imagens_empreendimento
    ON imagens(empreendimento_id, ordem);

  -- Unidades: as plantas/apartamentos de um mesmo empreendimento. O que muda
  -- de uma para outra (metragem, dormitorios, vagas, posicao e preco) mora
  -- aqui; o empreendimento segue com os dados gerais.
  CREATE TABLE IF NOT EXISTS unidades (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimento_id INTEGER NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
    identificacao     TEXT,
    torre             TEXT,
    andar             INTEGER,
    numero            TEXT,
    metragem          REAL,
    metragem_total    REAL,
    dormitorios       INTEGER,
    suites            INTEGER,
    banheiros         INTEGER,
    vagas             INTEGER,
    posicao_solar     TEXT,
    face              TEXT,
    valor             REAL,
    valor_m2          REAL,
    status            TEXT,
    observacoes       TEXT,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_unidades_empreendimento
    ON unidades(empreendimento_id);
`)

// Fluxo de pagamento passou a poder ser de uma unidade especifica; os que ja
// existiam ficam com unidade_id NULL e seguem valendo como tabela geral do
// empreendimento. ADD COLUMN so roda quando a coluna ainda nao existe.
const colunasFluxo = db.prepare('PRAGMA table_info(fluxos_pagamento)').all()
if (!colunasFluxo.some((coluna) => coluna.name === 'unidade_id')) {
  db.exec(`
    ALTER TABLE fluxos_pagamento
      ADD COLUMN unidade_id INTEGER REFERENCES unidades(id) ON DELETE CASCADE;
  `)
}
db.exec('CREATE INDEX IF NOT EXISTS idx_fluxos_unidade ON fluxos_pagamento(unidade_id);')

// Parametros da simulacao do CUB que gerou o fluxo — guardados para poder
// reabrir a calculadora com os mesmos numeros (e, no futuro, refazer a conta
// com a tabela oficial de indices).
const COLUNAS_CUB = ['cub_percentual', 'cub_meses', 'cub_valor_imovel', 'cub_parcela_inicial', 'cub_entrada']

// O saldo a financiar em R$ passou a ser gravado junto do percentual: ele e o
// resto da tabela (valor do imovel menos entrada, parcelas, reforcos e
// chaves), e guardar so a % obrigaria a refazer a conta em cada leitura.
const COLUNAS_NOVAS = [...COLUNAS_CUB, 'financiamento_valor']

for (const coluna of COLUNAS_NOVAS) {
  const existentes = db.prepare('PRAGMA table_info(fluxos_pagamento)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE fluxos_pagamento ADD COLUMN ${coluna} REAL;`)
  }
}

/** Colunas gravaveis de cada tabela — a fonte da verdade para montar INSERT/UPDATE. */
export const CAMPOS_EMPREENDIMENTO = [
  'nome', 'construtora', 'cidade', 'bairro', 'endereco',
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'status_obra', 'entrega', 'tipo', 'imagem_url', 'observacoes',
]

export const CAMPOS_FLUXO = [
  'empreendimento_id', 'unidade_id', 'nome',
  'entrada_pct', 'entrada_valor',
  'parcelas', 'parcela_valor',
  'reforcos_qtd', 'reforco_valor',
  'chaves_pct', 'financiamento_pct', 'financiamento_valor',
  'descricao', 'observacoes',
  'cub_percentual', 'cub_meses', 'cub_valor_imovel', 'cub_parcela_inicial', 'cub_entrada',
]

export const CAMPOS_UNIDADE = [
  'empreendimento_id', 'identificacao', 'torre', 'andar', 'numero',
  'metragem', 'metragem_total',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'posicao_solar', 'face', 'valor', 'valor_m2', 'status', 'observacoes',
]

const NUMERICOS = new Set([
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'empreendimento_id', 'unidade_id', 'entrada_pct', 'entrada_valor', 'parcelas',
  'parcela_valor', 'reforcos_qtd', 'reforco_valor', 'chaves_pct',
  'financiamento_pct', 'financiamento_valor',
  'andar', 'metragem', 'metragem_total', 'valor',
  'cub_percentual', 'cub_meses', 'cub_valor_imovel', 'cub_parcela_inicial', 'cub_entrada',
])

/**
 * Numero digitado em pt-BR. A virgula e sempre decimal; o ponto so e milhar
 * quando separa grupos de 3 digitos ("800.000" = oitocentos mil, "80.5" =
 * 80,5). Antes de tratar isso, `Number('800.000')` gravava 800 no banco — e o
 * valor do m² saia mil vezes menor sem nenhum aviso.
 */
const SO_MILHAR = /^-?\d{1,3}(\.\d{3})+$/

function lerNumero(bruto) {
  const texto = String(bruto).replace(/[^\d,.-]/g, '').trim()
  if (!texto) return null

  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : SO_MILHAR.test(texto)
      ? texto.replace(/\./g, '')
      : texto

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

/**
 * Normaliza o corpo da requisicao: mantem so as colunas conhecidas, converte
 * numero em numero e transforma string vazia em NULL (campo em branco no
 * formulario nao pode virar 0 e baguncar o comparativo).
 */
export function sanitizar(body, campos) {
  const out = {}
  for (const campo of campos) {
    if (!(campo in body)) continue
    let valor = body[campo]

    if (valor === '' || valor === undefined) valor = null

    if (valor !== null && NUMERICOS.has(campo)) {
      valor = typeof valor === 'number' ? (Number.isFinite(valor) ? valor : null) : lerNumero(valor)
    }

    if (valor !== null && typeof valor === 'string') valor = valor.trim() || null

    out[campo] = valor
  }
  return out
}

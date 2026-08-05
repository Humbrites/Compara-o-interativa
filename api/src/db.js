import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_FILE = process.env.DB_FILE || join(DATA_DIR, 'compara.db')

/** Onde os arquivos de imagem enviados pelo formulario sao gravados. */
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')

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
  'chaves_pct', 'financiamento_pct',
  'descricao', 'observacoes',
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
  'financiamento_pct',
  'andar', 'metragem', 'metragem_total', 'valor',
])

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
      const num = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
      valor = Number.isFinite(num) ? num : null
    }

    if (valor !== null && typeof valor === 'string') valor = valor.trim() || null

    out[campo] = valor
  }
  return out
}

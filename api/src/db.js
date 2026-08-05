import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DB_FILE = process.env.DB_FILE || join(DATA_DIR, 'compara.db')

mkdirSync(DATA_DIR, { recursive: true })

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
`)

/** Colunas gravaveis de cada tabela — a fonte da verdade para montar INSERT/UPDATE. */
export const CAMPOS_EMPREENDIMENTO = [
  'nome', 'construtora', 'cidade', 'bairro', 'endereco',
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'status_obra', 'entrega', 'tipo', 'imagem_url', 'observacoes',
]

export const CAMPOS_FLUXO = [
  'empreendimento_id', 'nome',
  'entrada_pct', 'entrada_valor',
  'parcelas', 'parcela_valor',
  'reforcos_qtd', 'reforco_valor',
  'chaves_pct', 'financiamento_pct',
  'descricao', 'observacoes',
]

const NUMERICOS = new Set([
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'empreendimento_id', 'entrada_pct', 'entrada_valor', 'parcelas',
  'parcela_valor', 'reforcos_qtd', 'reforco_valor', 'chaves_pct',
  'financiamento_pct',
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

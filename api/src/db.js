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

  -- ------------------------------------------------------------------
  -- Contas, usuarios e acesso
  -- ------------------------------------------------------------------

  -- A conta e o cliente que comprou o sistema, e e ela que possui os dados.
  -- Sem esse dono, "plano de 3 usuarios" nao significa nada e uma imobiliaria
  -- enxergaria a base da outra — login sozinho seria porta em comodo unico.
  CREATE TABLE IF NOT EXISTS contas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nome            TEXT NOT NULL,
    plano           TEXT NOT NULL DEFAULT 'individual',
    -- NULL = usa o limite do plano. Preenchido VENCE o plano: e o que atende o
    -- cliente que negociou 15 assentos sem inventar um plano novo para ele.
    -- 0 = sem teto (escolha explicita, nunca o padrao).
    limite_usuarios INTEGER,
    status          TEXT NOT NULL DEFAULT 'trial',
    -- Fim do teste ou do periodo pago. Vencido, a conta entra em so leitura
    -- sozinha (ninguem perde dado por causa de um boleto atrasado).
    expira_em       TEXT,
    exigir_2fa      INTEGER NOT NULL DEFAULT 0,
    -- Base que o master abre para apresentar o sistema — e a unica em que a
    -- visualizacao "como usuario" grava. No maximo uma.
    demonstracao    INTEGER NOT NULL DEFAULT 0,
    observacoes     TEXT,
    criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- O e-mail (e o apelido) sao unicos no sistema INTEIRO, nao por conta: e o
  -- que deixa o login pedir so identificador + senha, sem obrigar a pessoa a
  -- dizer de qual empresa ela e antes de entrar.
  CREATE TABLE IF NOT EXISTS usuarios (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id       INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    nome           TEXT NOT NULL,
    email          TEXT NOT NULL,
    usuario        TEXT,
    -- NULL enquanto a pessoa nao definiu a senha pelo link de primeiro acesso.
    senha_hash     TEXT,
    papel          TEXT NOT NULL DEFAULT 'membro',
    totp_segredo   TEXT,
    totp_ativo     INTEGER NOT NULL DEFAULT 0,
    -- Ultimo passo de 30s ja aceito: impede reusar o mesmo codigo dentro da
    -- janela de validade dele (quem viu o codigo por cima do ombro nao entra).
    totp_passo     INTEGER,
    ativo          INTEGER NOT NULL DEFAULT 1,
    ultimo_acesso  TEXT,
    criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario
    ON usuarios(usuario) WHERE usuario IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_usuarios_conta ON usuarios(conta_id);

  -- Guardamos o HASH do token, nunca o token: se este arquivo vazar, o que
  -- esta aqui nao serve para entrar em lugar nenhum. O token cru so existe no
  -- cookie do navegador.
  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash  TEXT PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    agente      TEXT,
    ip          TEXT,
    criada_em   TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_uso  TEXT NOT NULL DEFAULT (datetime('now')),
    expira_em   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

  -- Convite pendente OCUPA vaga do plano — senao o cliente do plano de 3 fura
  -- o limite mandando 10 convites e so depois todo mundo aceita.
  CREATE TABLE IF NOT EXISTS convites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id     INTEGER NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    nome         TEXT,
    papel        TEXT NOT NULL DEFAULT 'membro',
    token_hash   TEXT NOT NULL,
    criado_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
    expira_em    TEXT NOT NULL,
    aceito_em    TEXT,
    cancelado_em TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_convites_conta ON convites(conta_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_convites_token ON convites(token_hash);

  -- Primeiro acesso e redefinicao de senha usam o mesmo mecanismo: um token de
  -- uso unico com validade curta.
  CREATE TABLE IF NOT EXISTS tokens_senha (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    motivo     TEXT NOT NULL,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
    expira_em  TEXT NOT NULL,
    usado_em   TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_senha_token ON tokens_senha(token_hash);

  -- Sem codigo de recuperacao, quem troca de celular fica trancado para fora
  -- do proprio sistema — e isso vira chamado de suporte, nao seguranca.
  CREATE TABLE IF NOT EXISTS codigos_recuperacao (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
    usado_em    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos_recuperacao(usuario_id);

  -- Tentativa errada de login. O atraso cresce com a quantidade recente, mas a
  -- conta NUNCA e travada: travar por senha errada entrega a qualquer um o
  -- poder de deixar o cliente de fora do sistema.
  CREATE TABLE IF NOT EXISTS tentativas_login (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    chave        TEXT NOT NULL,
    criada_em    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tentativas_chave ON tentativas_login(chave, criada_em);
`)

// O empreendimento passou a ter dono. Coluna anulavel porque SQLite nao
// acrescenta NOT NULL em tabela com linhas; quem garante o preenchimento e a
// API (toda escrita carimba a conta da sessao) e a migracao logo abaixo.
const colunasEmpreendimento = db.prepare('PRAGMA table_info(empreendimentos)').all()
if (!colunasEmpreendimento.some((coluna) => coluna.name === 'conta_id')) {
  db.exec('ALTER TABLE empreendimentos ADD COLUMN conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE;')
}
db.exec('CREATE INDEX IF NOT EXISTS idx_empreendimentos_conta ON empreendimentos(conta_id);')

// Unidades, fluxos e imagens NAO repetem a coluna: elas chegam pelo
// empreendimento, e duas fontes de verdade para o mesmo dono divergiriam no
// primeiro INSERT feito fora do caminho normal.

// Operador da PLATAFORMA (quem vende) — nao confundir com o dono da conta
// (quem compra). E a unica marca que a interface nao concede: sai so pela
// linha de comando, porque quem pudesse se promover por tela veria a base
// inteira de todos os clientes.
// De quanto em quanto tempo o cliente paga. Nasce mensal para as contas que ja
// existiam — que e o ciclo mais curto, entao ninguem ganha tempo de graca.
const colunasConta = db.prepare('PRAGMA table_info(contas)').all()
if (!colunasConta.some((coluna) => coluna.name === 'periodicidade')) {
  db.exec("ALTER TABLE contas ADD COLUMN periodicidade TEXT NOT NULL DEFAULT 'mensal';")
}

// A conta de DEMONSTRACAO e a base que o master abre para apresentar o sistema
// sem entrar no login de nenhum cliente. E a UNICA em que a visualizacao "como
// usuario" grava: nas demais ele olha e nao toca.
if (!colunasConta.some((coluna) => coluna.name === 'demonstracao')) {
  db.exec('ALTER TABLE contas ADD COLUMN demonstracao INTEGER NOT NULL DEFAULT 0;')

  // So marca sozinha quando existe UMA conta: ai ela e a base do proprio
  // operador (o dashboard rodou meses antes de haver cliente). Com varias,
  // escolher no chute liberaria escrita na base de um cliente de verdade —
  // entao ninguem nasce marcado e a escolha e feita pela tela.
  const contas = db.prepare('SELECT id FROM contas').all()
  if (contas.length === 1) db.prepare('UPDATE contas SET demonstracao = 1 WHERE id = ?').run(contas[0].id)
}

// Qual metragem divide o preco para dar o valor do m². A escolha e da conta
// porque as duas leituras existem no mercado: a area PRIVATIVA e a que o
// comprador usa, a TOTAL e a que a construtora anuncia. Nasce 'privativa' —
// comparar predios pela area total premia quem tem mais area comum.
const colunasContaBase = db.prepare('PRAGMA table_info(contas)').all()
if (!colunasContaBase.some((coluna) => coluna.name === 'base_m2')) {
  db.exec("ALTER TABLE contas ADD COLUMN base_m2 TEXT NOT NULL DEFAULT 'privativa';")
}

const colunasUsuario = db.prepare('PRAGMA table_info(usuarios)').all()
if (!colunasUsuario.some((coluna) => coluna.name === 'operador')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN operador INTEGER NOT NULL DEFAULT 0;')
}

// Qual conta o master esta enxergando "como usuario" nesta sessao. Fica no
// banco, e nao na memoria, para o modo sobreviver a um F5 no meio da
// apresentacao. `ON DELETE SET NULL`: cliente removido devolve o master para a
// administracao em vez de deixar a sessao apontando para o vazio.
const colunasSessao = db.prepare('PRAGMA table_info(sessoes)').all()
if (!colunasSessao.some((coluna) => coluna.name === 'vendo_conta_id')) {
  db.exec('ALTER TABLE sessoes ADD COLUMN vendo_conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL;')
}

/**
 * O usuario MASTER nao pertence a cliente nenhum: ele administra os clientes.
 *
 * Enquanto `conta_id` era NOT NULL, quem vende precisava morar dentro de uma
 * conta como se fosse um cliente — com plano, assentos e base propria. Agora
 * `conta_id` nulo significa "esta acima das contas": sem plano, sem assento,
 * sem base, e a API so lhe abre a area de administracao.
 *
 * SQLite nao remove NOT NULL por ALTER, entao a tabela e reconstruida (a
 * receita oficial de 12 passos). Roda uma vez so.
 */
const contaIdObrigatorio = colunasUsuario.find((coluna) => coluna.name === 'conta_id')?.notnull === 1

if (contaIdObrigatorio) {
  // As chaves estrangeiras ficam fora durante a troca, senao o DROP da tabela
  // antiga levaria junto as linhas que apontam para ela.
  db.pragma('foreign_keys = OFF')

  const reconstruir = db.transaction(() => {
    db.exec(`
      CREATE TABLE usuarios_novo (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        conta_id       INTEGER REFERENCES contas(id) ON DELETE CASCADE,
        nome           TEXT NOT NULL,
        email          TEXT NOT NULL,
        usuario        TEXT,
        senha_hash     TEXT,
        papel          TEXT NOT NULL DEFAULT 'membro',
        totp_segredo   TEXT,
        totp_ativo     INTEGER NOT NULL DEFAULT 0,
        totp_passo     INTEGER,
        ativo          INTEGER NOT NULL DEFAULT 1,
        operador       INTEGER NOT NULL DEFAULT 0,
        ultimo_acesso  TEXT,
        criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
        atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO usuarios_novo (id, conta_id, nome, email, usuario, senha_hash, papel,
                                 totp_segredo, totp_ativo, totp_passo, ativo, operador,
                                 ultimo_acesso, criado_em, atualizado_em)
        SELECT id, conta_id, nome, email, usuario, senha_hash, papel,
               totp_segredo, totp_ativo, totp_passo, ativo, operador,
               ultimo_acesso, criado_em, atualizado_em
          FROM usuarios;

      DROP TABLE usuarios;
      ALTER TABLE usuarios_novo RENAME TO usuarios;

      CREATE UNIQUE INDEX idx_usuarios_email ON usuarios(email);
      CREATE UNIQUE INDEX idx_usuarios_usuario ON usuarios(usuario) WHERE usuario IS NOT NULL;
      CREATE INDEX idx_usuarios_conta ON usuarios(conta_id);
    `)
  })
  reconstruir()

  // Confere antes de religar: tabela quebrada aqui derruba o login inteiro.
  const problemas = db.pragma('foreign_key_check')
  db.pragma('foreign_keys = ON')
  if (problemas.length > 0) {
    throw new Error(`migracao de usuarios deixou referencias quebradas: ${JSON.stringify(problemas)}`)
  }
}

/**
 * A identidade que vai impressa no material entregue ao cliente.
 *
 * O CRECI e do CORRETOR: sai no papel EXATAMENTE como foi cadastrado, porque
 * cada conselho regional escreve o numero de um jeito ("CRECI/RS 12345-F",
 * "12.345-J") e normalizar aqui deixaria a folha diferente do carimbo. A logo
 * e da CONTA, junto de COMO ela aparece na folha — marca d'agua central atras
 * do conteudo, cabecalho ou rodape. Sem logo gravada nada aparece e a folha
 * continua exatamente como era.
 *
 * Roda DEPOIS da reconstrucao de `usuarios` acima: aquela receita recria a
 * tabela por lista de colunas, e uma coluna acrescentada antes dela sumiria.
 */
const colunasUsuarioCreci = db.prepare('PRAGMA table_info(usuarios)').all()
if (!colunasUsuarioCreci.some((coluna) => coluna.name === 'creci')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN creci TEXT;')
}

// Tamanho em % da largura da folha e opacidade nascem no ponto em que a marca
// d'agua nao atrapalha a leitura — quem quiser a logo forte no cabecalho sobe
// a opacidade pela tela da conta.
const COLUNAS_LOGO = [
  ['logo_arquivo', 'TEXT'],
  ['logo_posicao', "TEXT NOT NULL DEFAULT 'marca-dagua'"],
  ['logo_tamanho', 'INTEGER NOT NULL DEFAULT 30'],
  ['logo_opacidade', 'REAL NOT NULL DEFAULT 0.08'],
]

for (const [coluna, tipo] of COLUNAS_LOGO) {
  const existentes = db.prepare('PRAGMA table_info(contas)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE contas ADD COLUMN ${coluna} ${tipo};`)
  }
}

/**
 * Base que ja existia (o dashboard rodou meses sem login) fica sem dono no
 * momento em que a coluna nasce. Em vez de exigir um comando manual antes de o
 * sistema voltar a subir, adotamos os orfaos numa conta e registramos no log —
 * ninguem entra nela enquanto o primeiro usuario nao for provisionado.
 */
function adotarDadosSemDono() {
  const orfaos = db.prepare('SELECT COUNT(*) AS total FROM empreendimentos WHERE conta_id IS NULL').get().total
  if (orfaos === 0) return null

  const primeira = db.prepare('SELECT id FROM contas ORDER BY id LIMIT 1').get()
  const contaId =
    primeira?.id ??
    db
      .prepare(
        `INSERT INTO contas (nome, plano, limite_usuarios, status)
         VALUES ('Conta principal', 'personalizado', 0, 'ativa')`,
      )
      .run().lastInsertRowid

  db.prepare('UPDATE empreendimentos SET conta_id = ? WHERE conta_id IS NULL').run(contaId)
  return { contaId, orfaos }
}

export const migracaoContas = adotarDadosSemDono()

// Fluxo de pagamento passou a poder ser de uma unidade especifica; os que ja
// existiam ficam com unidade_id NULL e seguem valendo como tabela geral do
// empreendimento. ADD COLUMN so roda quando a coluna ainda nao existe.
// A tipologia da UNIDADE (studio, 2 dormitorios, cobertura, garden): o `tipo`
// do empreendimento diz o que o predio e, nao o que cada planta oferece.
const colunasUnidade = db.prepare('PRAGMA table_info(unidades)').all()
if (!colunasUnidade.some((coluna) => coluna.name === 'tipologia')) {
  db.exec('ALTER TABLE unidades ADD COLUMN tipologia TEXT;')
}

/**
 * A tabela da construtora separa TIPOS de area, e somar um com o outro muda o
 * preco do m² sem ninguem perceber: `metragem` continua sendo a privativa e
 * `metragem_total` a total/global; a area COMUM e a de terraco ganham coluna
 * propria, e o espaco complementar (hobby box, deposito) fica como o texto que
 * a tabela trouxe. As vagas seguem contadas em `vagas` — `vagas_detalhe` guarda
 * o que a coluna dizia ("Vagas 84 e 27, simples"), que nenhum numero resume.
 */
const COLUNAS_AREA_UNIDADE = [
  ['area_comum', 'REAL'],
  ['area_terraco', 'REAL'],
  ['espaco_complementar', 'TEXT'],
  ['vagas_detalhe', 'TEXT'],
]

for (const [coluna, tipo] of COLUNAS_AREA_UNIDADE) {
  const existentes = db.prepare('PRAGMA table_info(unidades)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE unidades ADD COLUMN ${coluna} ${tipo};`)
  }
}

// Quantas torres o empreendimento tem. Fica no predio, e nao na unidade: a
// unidade ja diz em QUAL torre ela esta (`unidades.torre`).
const colunasEmpreendimentoTorres = db.prepare('PRAGMA table_info(empreendimentos)').all()
if (!colunasEmpreendimentoTorres.some((coluna) => coluna.name === 'torres')) {
  db.exec('ALTER TABLE empreendimentos ADD COLUMN torres INTEGER;')
}

/**
 * O folder de venda do empreendimento — o PDF que a construtora entrega.
 *
 * Fica no PREDIO e nao na galeria: a galeria e de imagens que o navegador
 * mostra em sequencia, e um PDF de 15 MB no meio das fotos quebraria o carrossel.
 * Sao tres colunas porque o arquivo no disco tem nome de UUID: `folder_nome`
 * guarda como o arquivo se chamava para quem enviou (e o nome que a pessoa
 * reconhece na tela e no download) e `folder_tamanho` evita ter de ir ao disco
 * so para dizer "2,4 MB".
 *
 * De proposito FORA de CAMPOS_EMPREENDIMENTO: quem troca o folder e a rota de
 * upload, que grava o arquivo antes. Um PUT no cadastro nao pode apontar a
 * coluna para outro arquivo — nem apaga-la deixando o PDF perdido no disco.
 */
const COLUNAS_FOLDER = [
  ['folder_arquivo', 'TEXT'],
  ['folder_nome', 'TEXT'],
  ['folder_tamanho', 'INTEGER'],
]

for (const [coluna, tipo] of COLUNAS_FOLDER) {
  const existentes = db.prepare('PRAGMA table_info(empreendimentos)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE empreendimentos ADD COLUMN ${coluna} ${tipo};`)
  }
}

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
// A tabela real da construtora tem mais blocos do que o fluxo sabia guardar:
// a entrada costuma ser PARCELADA, e boa parte das tabelas parcela um pedaco
// DEPOIS das chaves (financiamento direto). Sem estas colunas, a importacao
// gravava a unidade e jogava a condicao de pagamento fora.
const COLUNAS_POS_CHAVES = ['entrada_parcelas', 'pos_parcelas', 'pos_parcela_valor', 'pos_reforcos_qtd', 'pos_reforco_valor']

const COLUNAS_NOVAS = [...COLUNAS_CUB, 'financiamento_valor', ...COLUNAS_POS_CHAVES]

for (const coluna of COLUNAS_NOVAS) {
  const existentes = db.prepare('PRAGMA table_info(fluxos_pagamento)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE fluxos_pagamento ADD COLUMN ${coluna} REAL;`)
  }
}

/**
 * A mesma unidade tem duas leituras da venda: a tabela que a construtora
 * entregou e a proposta que o corretor montou em cima dela. `tipo` diz qual e
 * qual, e `fluxo_base_id` guarda de qual tabela a proposta saiu — sem esse
 * vinculo o comparativo "construtora × personalizado" teria de adivinhar os
 * lados pelo nome.
 *
 * Fluxo que ja existia fica com `tipo` NULL: ele pode ser tabela ou proposta, e
 * carimbar todo mundo de construtora inventaria uma origem que ninguem
 * declarou. `ON DELETE SET NULL` na origem: apagar a tabela da construtora nao
 * pode levar junto a proposta que o corretor ja apresentou ao cliente.
 */
const COLUNAS_TIPO_FLUXO = [
  ['tipo', 'TEXT'],
  ['fluxo_base_id', 'INTEGER REFERENCES fluxos_pagamento(id) ON DELETE SET NULL'],
]

for (const [coluna, tipo] of COLUNAS_TIPO_FLUXO) {
  const existentes = db.prepare('PRAGMA table_info(fluxos_pagamento)').all()
  if (!existentes.some((c) => c.name === coluna)) {
    db.exec(`ALTER TABLE fluxos_pagamento ADD COLUMN ${coluna} ${tipo};`)
  }
}

// Historico de importacao de tabela de unidades (a etapa da IA). Guardamos o
// RESUMO do que foi aplicado — quantas unidades nasceram, quantas mudaram e o
// diff confirmado — porque quem recebe uma tabela nova da construtora toda
// semana precisa saber o que a importacao de terca mexeu. Tabela nova entra
// com CREATE TABLE IF NOT EXISTS, no mesmo padrao das demais.
db.exec(`
  CREATE TABLE IF NOT EXISTS importacoes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimento_id INTEGER NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
    resumo            TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_importacoes_empreendimento
    ON importacoes(empreendimento_id, id);
`)

/** Colunas gravaveis de cada tabela — a fonte da verdade para montar INSERT/UPDATE. */
export const CAMPOS_EMPREENDIMENTO = [
  'nome', 'construtora', 'cidade', 'bairro', 'endereco',
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas', 'torres',
  'status_obra', 'entrega', 'tipo', 'imagem_url', 'observacoes',
]

export const CAMPOS_FLUXO = [
  'empreendimento_id', 'unidade_id', 'tipo', 'fluxo_base_id', 'nome',
  'entrada_pct', 'entrada_valor', 'entrada_parcelas',
  'parcelas', 'parcela_valor',
  'reforcos_qtd', 'reforco_valor',
  'chaves_pct', 'financiamento_pct', 'financiamento_valor',
  'pos_parcelas', 'pos_parcela_valor', 'pos_reforcos_qtd', 'pos_reforco_valor',
  'descricao', 'observacoes',
  'cub_percentual', 'cub_meses', 'cub_valor_imovel', 'cub_parcela_inicial', 'cub_entrada',
]

export const CAMPOS_UNIDADE = [
  'empreendimento_id', 'identificacao', 'tipologia', 'torre', 'andar', 'numero',
  'metragem', 'metragem_total', 'area_comum', 'area_terraco', 'espaco_complementar',
  'dormitorios', 'suites', 'banheiros', 'vagas', 'vagas_detalhe',
  'posicao_solar', 'face', 'valor', 'valor_m2', 'status', 'observacoes',
]

const NUMERICOS = new Set([
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas', 'torres',
  'area_comum', 'area_terraco',
  'empreendimento_id', 'unidade_id', 'fluxo_base_id', 'entrada_pct', 'entrada_valor', 'parcelas',
  'parcela_valor', 'reforcos_qtd', 'reforco_valor', 'chaves_pct',
  'financiamento_pct', 'financiamento_valor',
  'entrada_parcelas', 'pos_parcelas', 'pos_parcela_valor', 'pos_reforcos_qtd', 'pos_reforco_valor',
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

export function lerNumero(bruto) {
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

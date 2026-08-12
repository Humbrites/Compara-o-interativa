/**
 * Indicadores de mercado para o cabecalho.
 *
 * A fonte e o SGS do Banco Central (api.bcb.gov.br) — publica, sem cadastro,
 * sem token e sem contrato. Nenhum outro servico entra aqui.
 *
 * A API busca por fora e guarda o resultado: o navegador nunca fala com o
 * Banco Central direto (evita CORS, chave exposta e uma consulta por aba
 * aberta), e uma leitura por dia atende todo mundo.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs'

/** Quanto tempo o dado serve antes de valer a pena buscar de novo. */
const TTL_MS = 6 * 60 * 60 * 1000
/**
 * Com alguma serie faltando, o TTL cai: seis horas guardando a AUSENCIA de um
 * indicador e o que fez o cartao da Selic sumir do cabecalho por uma tarde
 * inteira depois de um unico HTTP 400.
 */
const TTL_FALHA_MS = 20 * 60 * 1000
/** O Banco Central responde em ~1s; a segunda tentativa ganha mais folga. */
const TIMEOUTS_MS = [12000, 20000]

/**
 * As series. `pontos` e quantas leituras buscar: 13 fecham o acumulado de 12
 * meses, as diarias pedem folga porque fim de semana e feriado nao publicam.
 *
 * ⚠️ O codigo da serie e a definicao do indicador. Trocar o numero troca o
 * indice — 192 e o INCC-DI da FGV, nao o INCC-M.
 */
const SERIES = [
  {
    chave: 'selic',
    nome: 'Selic',
    descricao: 'meta do Copom',
    serie: 432,
    // ⚠️ A 432 nao aceita `ultimos/N`: acima de ~30 responde HTTP 400 e ate
    // com 30 devolve `{"erro":{}}` em HTTP 200. E ainda publica a meta
    // VIGENTE com data no futuro. Por periodo o historico vem inteiro e o
    // filtro de data corta o que ainda nao aconteceu. Seis meses bastam para
    // achar a ultima mudanca (o Copom se reune a cada 45 dias) e a consulta
    // fica na metade do tempo de uma janela de dois anos.
    janelaDias: 180,
    formato: 'percentual',
    unidade: 'a.a.',
    // A meta so muda em reuniao do Copom: comparar com ontem daria sempre 0.
    comparar: 'ultima-mudanca',
  },
  {
    chave: 'dolar',
    nome: 'Dólar',
    descricao: 'PTAX venda',
    serie: 1,
    pontos: 10,
    formato: 'moeda',
    unidade: 'USD/BRL',
    comparar: 'anterior',
    variacaoEm: 'percentual',
  },
  {
    chave: 'ipca',
    nome: 'IPCA',
    descricao: 'inflação oficial',
    serie: 433,
    pontos: 13,
    formato: 'percentual',
    unidade: 'no mês',
    comparar: 'anterior',
    acumulado12: true,
  },
  {
    chave: 'igpm',
    nome: 'IGP-M',
    descricao: 'reajuste de aluguel',
    serie: 189,
    pontos: 13,
    formato: 'percentual',
    unidade: 'no mês',
    comparar: 'anterior',
    acumulado12: true,
  },
  {
    chave: 'incc',
    nome: 'INCC',
    descricao: 'custo da construção (DI)',
    serie: 192,
    pontos: 13,
    formato: 'percentual',
    unidade: 'no mês',
    comparar: 'anterior',
    acumulado12: true,
  },
  {
    chave: 'inpc',
    nome: 'INPC',
    descricao: 'inflação das famílias de menor renda',
    serie: 188,
    pontos: 13,
    formato: 'percentual',
    unidade: 'no mês',
    comparar: 'anterior',
    acumulado12: true,
    // Entrou para o simulador (indexador de financiamento), nao para a faixa do
    // cabecalho: um setimo cartao apertaria os seis que ja estao la. A consulta
    // e a mesma; quem filtra e a tela.
    noCabecalho: false,
  },
  {
    chave: 'tr',
    nome: 'TR',
    descricao: 'taxa referencial',
    serie: 7811,
    pontos: 13,
    formato: 'percentual',
    unidade: 'no mês',
    comparar: 'anterior',
    acumulado12: true,
  },
]

/** "05/08/2026" -> Date. O SGS so fala nesse formato. */
function lerData(texto) {
  const [dia, mes, ano] = String(texto || '').split('/')
  if (!dia || !mes || !ano) return null
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia))
  return Number.isNaN(data.getTime()) ? null : data
}

function lerValor(texto) {
  const numero = Number(String(texto).replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

/** dd/mm/aaaa — o unico formato que o SGS aceita na consulta por periodo. */
function paraSgs(data) {
  const dois = (numero) => String(numero).padStart(2, '0')
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}`
}

function urlDaSerie(config, agora) {
  if (config.janelaDias) {
    const inicio = new Date(agora.getTime() - config.janelaDias * 24 * 60 * 60 * 1000)
    return `${SGS}.${config.serie}/dados?formato=json&dataInicial=${paraSgs(inicio)}&dataFinal=${paraSgs(agora)}`
  }
  return `${SGS}.${config.serie}/dados/ultimos/${config.pontos}?formato=json`
}

async function buscarSerie(config, agora) {
  const url = urlDaSerie(config, agora)

  // Uma segunda tentativa (com mais folga no relogio) cobre o tropeco de
  // rede; duas ja seria insistir.
  let ultimoErro = null
  for (const timeout of TIMEOUTS_MS) {
    try {
      const resposta = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { accept: 'application/json' },
      })
      if (!resposta.ok) throw new Error(`série ${config.serie}: HTTP ${resposta.status}`)

      // ⚠️ O SGS responde `{"erro":{}}` com HTTP 200 em consulta que ele nao
      // aceita — sem esta checagem viraria "sem dados" so no `.length`.
      const dados = await resposta.json()
      if (!Array.isArray(dados) || dados.length === 0) throw new Error(`série ${config.serie}: sem dados`)

      // O SGS devolve do mais antigo para o mais novo — a ultima linha e a
      // atual. Data no futuro (a Selic publica a meta vigente adiante) nao
      // entra: o painel mostra o que ja aconteceu.
      const linhas = dados
        .map((linha) => ({ data: linha.data, valor: lerValor(linha.valor), quando: lerData(linha.data) }))
        .filter((linha) => linha.valor !== null && linha.quando !== null && linha.quando <= agora)
        .map(({ data, valor }) => ({ data, valor }))

      if (linhas.length === 0) throw new Error(`série ${config.serie}: sem leitura já publicada`)
      return linhas
    } catch (erro) {
      ultimoErro = erro
    }
  }
  throw ultimoErro
}

/** Percentuais mensais compostos: 12 meses viram o acumulado do ano. */
function acumular(valores) {
  return (valores.reduce((total, valor) => total * (1 + valor / 100), 1) - 1) * 100
}

function montarIndicador(config, linhas) {
  const atual = linhas[linhas.length - 1]

  // Com o que comparar: o dia anterior, ou a ultima vez que o numero mudou
  // (Selic fica meses parada e "0,00%" nao informa nada).
  const anterior =
    config.comparar === 'ultima-mudanca'
      ? [...linhas].reverse().find((linha) => linha.valor !== atual.valor) ?? null
      : linhas[linhas.length - 2] ?? null

  let variacao = null
  if (anterior) {
    variacao =
      config.variacaoEm === 'percentual'
        ? anterior.valor !== 0
          ? ((atual.valor - anterior.valor) / Math.abs(anterior.valor)) * 100
          : null
        : atual.valor - anterior.valor
  }

  const casas = config.formato === 'moeda' ? 4 : 2
  const estavel = variacao === null || Math.abs(variacao) < 1 / 10 ** casas

  const doisUltimosAnos = linhas.slice(-12).map((linha) => linha.valor)
  const acumulado12 = config.acumulado12 && linhas.length >= 12 ? acumular(doisUltimosAnos) : null

  return {
    chave: config.chave,
    nome: config.nome,
    descricao: config.descricao,
    valor: atual.valor,
    formato: config.formato,
    unidade: config.unidade,
    referencia: atual.data,
    /** Diferenca em pontos percentuais, salvo quando `variacaoEm` diz outra coisa. */
    variacao,
    variacaoEm: config.variacaoEm === 'percentual' ? 'percentual' : 'pontos',
    comparadoCom: anterior ? anterior.data : null,
    tendencia: estavel ? 'estavel' : variacao > 0 ? 'alta' : 'baixa',
    acumulado12,
    serie: config.serie,
    /** false = a serie existe para quem consulta (o simulador), mas nao vira cartao no topo. */
    noCabecalho: config.noCabecalho !== false,
  }
}

/**
 * A "assinatura" da lista de series. Vai gravada no cache: quando uma serie
 * nova entra no codigo, o arquivo antigo deixa de valer na hora em vez de
 * segurar o indicador novo pelas seis horas do TTL.
 */
const VERSAO_DAS_SERIES = SERIES.map((s) => `${s.chave}:${s.serie}`).join(',')

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

export function criarServicoIndicadores({ dataDir, log }) {
  const arquivo = join(dataDir, 'indicadores.json')

  /** Ultimo resultado bom, em memoria. */
  let cache = null
  /** Busca em andamento: dez abas abrindo juntas fazem UMA consulta. */
  let emVoo = null
  let carregouDoDisco = false

  async function lerDoDisco() {
    if (carregouDoDisco) return
    carregouDoDisco = true
    try {
      const conteudo = await readFile(arquivo, 'utf8')
      const salvo = JSON.parse(conteudo)
      if (salvo && Array.isArray(salvo.indicadores) && salvo.indicadores.length > 0) cache = salvo
    } catch (erro) {
      // Primeira execucao, arquivo apagado ou JSON corrompido: busca de novo.
      if (erro.code !== 'ENOENT') log?.warn({ erro }, 'cache de indicadores ilegível')
    }
  }

  async function gravarNoDisco(dados) {
    try {
      await writeFile(arquivo, JSON.stringify(dados, null, 2), 'utf8')
    } catch (erro) {
      log?.warn({ erro }, 'falha ao gravar o cache de indicadores')
    }
  }

  async function buscarTudo() {
    const agora = new Date()
    const resultados = await Promise.allSettled(
      SERIES.map(async (config) => montarIndicador(config, await buscarSerie(config, agora))),
    )

    const indicadores = []
    const falhas = []
    resultados.forEach((resultado, indice) => {
      const config = SERIES[indice]
      if (resultado.status === 'fulfilled') {
        indicadores.push(resultado.value)
        return
      }

      falhas.push({ chave: config.chave, motivo: String(resultado.reason?.message || resultado.reason) })

      // A serie que falhou reaproveita a ULTIMA leitura boa em vez de sumir da
      // faixa: um numero de ontem, marcado como defasado, informa mais que um
      // cartao que simplesmente nao existe.
      const anterior = cache?.indicadores?.find((i) => i.chave === config.chave)
      if (anterior) indicadores.push({ ...anterior, defasado: true })
    })

    // Ninguem respondeu: nao adianta devolver o cache inteiro carimbado de
    // agora — isso diria que os numeros sao de hoje. Erra alto e deixa o
    // `obter` cair no cache com `stale: true`, que e o aviso honesto.
    if (indicadores.every((i) => i.defasado)) {
      throw new Error(falhas[0]?.motivo || 'nenhum indicador respondeu')
    }

    if (falhas.length > 0) log?.warn({ falhas }, 'indicadores parcialmente indisponíveis')

    // A ordem e sempre a das SERIES — o reaproveitado entra no lugar dele.
    indicadores.sort(
      (a, b) =>
        SERIES.findIndex((s) => s.chave === a.chave) - SERIES.findIndex((s) => s.chave === b.chave),
    )

    return {
      atualizadoEm: new Date().toISOString(),
      fonte: 'Banco Central do Brasil · SGS',
      versao: VERSAO_DAS_SERIES,
      indicadores,
      falhas,
      defasados: indicadores.filter((i) => i.defasado).map((i) => i.chave),
    }
  }

  /**
   * O contrato da rota. `stale: true` significa "isto e o ultimo dado bom que
   * eu tenho, a consulta de agora falhou" — a tela avisa em vez de mentir que
   * o numero e de hoje.
   */
  async function obter({ forcar = false } = {}) {
    await lerDoDisco()

    const idade = cache ? Date.now() - new Date(cache.atualizadoEm).getTime() : Infinity
    // Cache incompleto vale 20 minutos, nao 6 horas: a serie que faltou tem de
    // ganhar nova chance logo.
    const validade = cache?.falhas?.length ? TTL_FALHA_MS : TTL_MS
    // Lista de series diferente da que gerou o arquivo = cache de outro
    // contrato: serve o valor velho AGORA (melhor que tela vazia), mas nao
    // impede a consulta, senao o indicador novo so apareceria horas depois.
    const mesmaVersao = cache?.versao === VERSAO_DAS_SERIES
    if (!forcar && cache && mesmaVersao && idade < validade) return { ...cache, doCache: true, stale: false }

    if (!emVoo) {
      emVoo = buscarTudo()
        .then(async (dados) => {
          cache = dados
          await gravarNoDisco(dados)
          return dados
        })
        .finally(() => {
          emVoo = null
        })
    }

    try {
      const dados = await emVoo
      return { ...dados, doCache: false, stale: false }
    } catch (erro) {
      log?.error({ erro }, 'falha ao consultar os indicadores')
      const motivo = erro instanceof Error ? erro.message : String(erro)
      // Cai para o ultimo dado bom, por mais velho que seja: um numero de
      // ontem com a data na tela vale mais que um painel vazio.
      if (cache) return { ...cache, doCache: true, stale: true, erro: motivo }
      return { atualizadoEm: null, indicadores: [], doCache: false, stale: true, erro: motivo }
    }
  }

  return { obter }
}

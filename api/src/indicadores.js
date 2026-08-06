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
/** O Banco Central responde em menos de 1s; o resto e folga para tropeco. */
const TIMEOUT_MS = 12000

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
    // ⚠️ A 432 recusa `ultimos/N` acima de ~30 (HTTP 400) e ainda publica a
    // meta VIGENTE com data no futuro. Por periodo o historico vem inteiro e
    // o filtro de data corta o que ainda nao aconteceu.
    janelaDias: 420,
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

  // Uma segunda tentativa cobre o tropeco de rede; duas ja seria insistir.
  let ultimoErro = null
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const resposta = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      })
      if (!resposta.ok) throw new Error(`série ${config.serie}: HTTP ${resposta.status}`)

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
  }
}

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
      if (resultado.status === 'fulfilled') indicadores.push(resultado.value)
      else falhas.push({ chave: SERIES[indice].chave, motivo: String(resultado.reason?.message || resultado.reason) })
    })

    if (indicadores.length === 0) {
      throw new Error(falhas[0]?.motivo || 'nenhum indicador respondeu')
    }

    // Uma serie fora do ar nao derruba a faixa inteira: as outras vao ao ar e
    // o front mostra so o que chegou.
    if (falhas.length > 0) log?.warn({ falhas }, 'indicadores parcialmente indisponíveis')

    return {
      atualizadoEm: new Date().toISOString(),
      fonte: 'Banco Central do Brasil · SGS',
      indicadores,
      falhas,
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
    if (!forcar && cache && idade < TTL_MS) return { ...cache, doCache: true, stale: false }

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

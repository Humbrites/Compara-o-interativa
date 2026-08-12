/**
 * Busca de endereco no mapa — o Nominatim, buscador do proprio OpenStreetMap.
 *
 * Existe porque latitude e longitude eram digitadas a mao, e quem cadastra um
 * empreendimento nao sabe as coordenadas dele: sem esse par o imovel entra na
 * base mas NAO aparece no mapa, que e o centro do produto.
 *
 * Quem consulta e a NOSSA API, nunca o navegador — pelos mesmos motivos dos
 * indicadores (uma consulta serve todas as abas, o cache e nosso e nao ha CORS)
 * e por um a mais: a politica de uso do Nominatim exige **User-Agent que
 * identifique a aplicacao** e **no maximo uma consulta por segundo**, e as duas
 * coisas so se garantem no servidor.
 */

/** Contato no User-Agent: a politica pede um jeito de nos avisar de abuso. */
const CONTATO = process.env.CONTATO_NOMINATIM || 'compara-interativa (uso interno)'
const AGENTE = `ComparaInterativa/1.0 (${CONTATO})`

const BASE = 'https://nominatim.openstreetmap.org'

/** Uma consulta por segundo, com folga — a politica deles e o limite. */
const INTERVALO_MS = 1100
const TIMEOUT_MS = 12000

/** Resultado guardado por 24h: endereco nao muda de lugar. */
const TTL_MS = 24 * 60 * 60 * 1000
/** Teto do cache em memoria; passou disso, o mais antigo sai. */
const MAX_CACHE = 500

const cache = new Map()
let ultimaConsulta = 0
/** As consultas entram em fila: duas abas juntas nao viram duas chamadas. */
let fila = Promise.resolve()

function lerDoCache(chave) {
  const registro = cache.get(chave)
  if (!registro) return null
  if (Date.now() - registro.em > TTL_MS) {
    cache.delete(chave)
    return null
  }
  // Reinsere para o mais usado ficar longe da poda.
  cache.delete(chave)
  cache.set(chave, registro)
  return registro.valor
}

function gravarNoCache(chave, valor) {
  cache.set(chave, { valor, em: Date.now() })
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Serializa as chamadas e respeita o intervalo minimo. Sem isso, cadastrar
 * dois empreendimentos seguidos ja bateria no limite deles — e quem e barrado
 * pelo Nominatim e o IP inteiro, nao a requisicao.
 */
function naFila(tarefa) {
  const proxima = fila.then(async () => {
    const desde = Date.now() - ultimaConsulta
    if (desde < INTERVALO_MS) await espera(INTERVALO_MS - desde)
    try {
      return await tarefa()
    } finally {
      ultimaConsulta = Date.now()
    }
  })
  // A fila nao pode morrer com o erro de uma consulta.
  fila = proxima.then(
    () => undefined,
    () => undefined,
  )
  return proxima
}

async function pedir(caminho, log) {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS)

  try {
    const resposta = await fetch(`${BASE}${caminho}`, {
      headers: { 'User-Agent': AGENTE, 'Accept-Language': 'pt-BR' },
      signal: controle.signal,
    })
    if (!resposta.ok) throw new Error(`Nominatim respondeu HTTP ${resposta.status}`)
    return await resposta.json()
  } catch (erro) {
    log?.warn({ erro: String(erro?.message || erro) }, 'falha ao consultar o Nominatim')
    throw erro
  } finally {
    clearTimeout(relogio)
  }
}

/** Numero do endereco vem separado do logradouro; o CEP quase nunca vem. */
function montarLinha(endereco = {}) {
  const rua = endereco.road || endereco.pedestrian || endereco.footway || null
  return [rua, endereco.house_number].filter(Boolean).join(', ') || null
}

/** O bairro pode chegar em quatro campos diferentes, conforme a cidade. */
function lerBairro(endereco = {}) {
  return endereco.suburb || endereco.neighbourhood || endereco.city_district || endereco.quarter || null
}

function lerCidade(endereco = {}) {
  return endereco.city || endereco.town || endereco.village || endereco.municipality || null
}

/** O formato que a tela consome — o JSON cru do Nominatim nao vaza daqui. */
function traduzir(item) {
  const endereco = item.address || {}
  return {
    /** Linha completa, para a lista de resultados. */
    rotulo: item.display_name,
    endereco: montarLinha(endereco),
    bairro: lerBairro(endereco),
    cidade: lerCidade(endereco),
    estado: endereco.state || null,
    cep: endereco.postcode || null,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  }
}

export function criarServicoDeEndereco({ log } = {}) {
  /** Busca ate 5 endereços para o texto digitado. */
  async function buscar(texto) {
    const termo = String(texto || '').trim()
    if (termo.length < 3) return { resultados: [], termo }

    const chave = `b:${termo.toLowerCase()}`
    const guardado = lerDoCache(chave)
    if (guardado) return { resultados: guardado, termo, doCache: true }

    const params = new URLSearchParams({
      q: termo,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      // O sistema é vendido no Brasil; sem isso "Batel" traz resultado na Turquia.
      countrycodes: 'br',
    })

    const dados = await naFila(() => pedir(`/search?${params}`, log))
    const resultados = (Array.isArray(dados) ? dados : [])
      .map(traduzir)
      .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))

    gravarNoCache(chave, resultados)
    return { resultados, termo }
  }

  /** O caminho inverso: o pino foi arrastado, que endereço é este? */
  async function reverso(latitude, longitude) {
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { endereco: null }

    // Arredondar a chave (~11 m) faz o arrastar fino do pino reaproveitar a
    // consulta anterior em vez de gerar uma nova a cada pixel.
    const chave = `r:${lat.toFixed(4)},${lon.toFixed(4)}`
    const guardado = lerDoCache(chave)
    if (guardado) return { endereco: guardado, doCache: true }

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
    })

    const dados = await naFila(() => pedir(`/reverse?${params}`, log))
    const endereco = dados && dados.address ? traduzir(dados) : null

    gravarNoCache(chave, endereco)
    return { endereco }
  }

  return { buscar, reverso }
}

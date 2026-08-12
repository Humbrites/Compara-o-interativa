/**
 * O que a tabela da construtora muda no cadastro.
 *
 * Quem le a tabela e a IA DO USUARIO (o ChatGPT dele, fora daqui): a tela
 * entrega um prompt pronto, ele cola a tabela la e traz o JSON de volta. Este
 * modulo faz o resto — RE-VALIDA o que chegou (o navegador nao e fonte de
 * verdade: o JSON foi digitado/colado por uma pessoa e pode vir com "800.000"
 * em texto, status inventado ou campo do tipo errado) e decide o que e unidade
 * nova, o que mudou de preco e o que sumiu da lista, contra o que esta
 * gravado. Diffar no navegador seria comparar com uma copia possivelmente
 * velha da base.
 *
 * O casamento e por TORRE + NUMERO, e so na falta deles pela identificacao: a
 * construtora renomeia a coluna ("Apto 1204" vira "1204") de uma tabela para a
 * outra, mas torre e numero sao o endereco do apartamento e nao mudam. Casar
 * so por identificacao criaria a unidade de novo a cada reimportacao.
 *
 * NADA aqui apaga: unidade que nao veio na tabela nova vira, no maximo,
 * "indisponivel" — e so se a pessoa marcar isso na previa.
 */
import { lerNumero } from './db.js'

/** Os quatro estados de disponibilidade. Fora deles, `null`. */
export const STATUS_VALIDOS = ['disponivel', 'reservada', 'vendida', 'indisponivel']

/** Teto do payload de uma importacao — acima disso a rota recusa com 413. */
export const LIMITE_PAYLOAD = 200 * 1024

/** Os campos que a importacao sabe preencher, e a ordem em que a previa mostra. */
export const CAMPOS_IMPORTAVEIS = [
  'identificacao',
  'torre',
  'andar',
  'numero',
  'tipologia',
  'metragem',
  'metragem_total',
  'dormitorios',
  'suites',
  'banheiros',
  'vagas',
  'valor',
  'status',
  'observacoes',
]

const NUMERICOS = new Set([
  'andar',
  'metragem',
  'metragem_total',
  'dormitorios',
  'suites',
  'banheiros',
  'vagas',
  'valor',
])

const INTEIROS = new Set(['andar', 'dormitorios', 'suites', 'banheiros', 'vagas'])

/** Tira acento, pontuacao e espaco — o que sobra e o que compara. */
function achatar(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Status normalizado nos quatro valores. Aceita o que a base ja tem gravado
 * ("Disponível", com acento e maiuscula) e o que a IA devolve ("disponivel").
 */
export function normalizarStatus(bruto) {
  const chave = achatar(bruto)
  if (!chave) return null

  const equivalentes = {
    disponivel: 'disponivel',
    disponiveis: 'disponivel',
    livre: 'disponivel',
    avenda: 'disponivel',
    aberta: 'disponivel',
    reservada: 'reservada',
    reservado: 'reservada',
    proposta: 'reservada',
    vendida: 'vendida',
    vendido: 'vendida',
    indisponivel: 'indisponivel',
    bloqueada: 'indisponivel',
    permutada: 'indisponivel',
  }

  return equivalentes[chave] ?? (STATUS_VALIDOS.includes(chave) ? chave : null)
}

/**
 * O valor de um campo pronto para gravar: numero vira numero (na regra pt-BR
 * do projeto), texto em branco vira NULL. Campo em branco NAO pode virar 0 nem
 * string vazia — e o vazio que o comparativo le como "nao informado".
 */
export function normalizarCampo(campo, bruto) {
  if (bruto === undefined || bruto === null || bruto === '') return null

  if (campo === 'status') return normalizarStatus(bruto)

  if (NUMERICOS.has(campo)) {
    const numero = typeof bruto === 'number' ? (Number.isFinite(bruto) ? bruto : null) : lerNumero(bruto)
    if (numero === null) return null
    return INTEIROS.has(campo) ? Math.round(numero) : numero
  }

  const texto = String(bruto).trim()
  return texto || null
}

/** So os campos importaveis, ja normalizados. */
export function normalizarUnidade(bruta) {
  const saida = {}
  for (const campo of CAMPOS_IMPORTAVEIS) saida[campo] = normalizarCampo(campo, bruta?.[campo])
  return saida
}

/**
 * A chave que diz "esta linha e aquela unidade": torre + numero e, na falta do
 * numero, a identificacao. Devolve null quando nao da para afirmar nada — e
 * ai a linha e tratada como nova, que e o erro barato (o outro seria
 * sobrescrever a unidade errada).
 */
export function chaveNatural(unidade) {
  const numero = achatar(unidade?.numero)
  if (numero) return `n:${achatar(unidade?.torre)}|${numero}`

  const identificacao = achatar(unidade?.identificacao)
  return identificacao ? `i:${identificacao}` : null
}

/**
 * Indice das unidades gravadas: cada uma responde pela chave torre+numero E
 * pela chave da identificacao. E o que faz a tabela que so traz "Apto 1204"
 * achar a unidade cadastrada com torre "A" e numero "1204" — e vice-versa.
 * A primeira a registrar cada chave vence; repetida nao rouba o lugar.
 */
function indexar(existentes) {
  const indice = new Map()
  const registrar = (chave, unidade) => {
    if (chave && !indice.has(chave)) indice.set(chave, unidade)
  }

  for (const unidade of existentes) {
    const numero = achatar(unidade.numero)
    if (numero) registrar(`n:${achatar(unidade.torre)}|${numero}`, unidade)
    registrar(`i:${achatar(unidade.identificacao)}`, unidade)
    // A identificacao "Apto 1204" tambem responde pelo numero solto: e assim
    // que a tabela sem coluna de torre reencontra a unidade ja cadastrada.
    if (!numero && achatar(unidade.identificacao)) {
      const digitos = String(unidade.identificacao).match(/\d+[A-Za-z]?/)
      if (digitos) registrar(`n:${achatar(unidade.torre)}|${achatar(digitos[0])}`, unidade)
    }
  }

  return indice
}

/** As chaves pelas quais uma linha recebida procura a unidade gravada. */
function chavesDeBusca(unidade) {
  const chaves = []
  const numero = achatar(unidade.numero)
  const torre = achatar(unidade.torre)
  const identificacao = achatar(unidade.identificacao)

  if (numero) chaves.push(`n:${torre}|${numero}`)
  if (identificacao) {
    chaves.push(`i:${identificacao}`)
    const digitos = String(unidade.identificacao).match(/\d+[A-Za-z]?/)
    if (digitos && !numero) chaves.push(`n:${torre}|${achatar(digitos[0])}`)
  }

  return chaves
}

/**
 * O diff completo, do jeito que a previa mostra.
 *
 * `alteradas` so lista o que REALMENTE mudou: campo que a tabela nao trouxe
 * (null) nao apaga o que ja estava gravado. Uma tabela de disponibilidade, que
 * so tem numero e status, nao pode zerar metragem e preco de todo mundo.
 */
export function montarDiff(existentes, recebidas) {
  const indice = indexar(existentes)
  const casadas = new Set()

  const novas = []
  const alteradas = []

  for (const bruta of recebidas) {
    const unidade = normalizarUnidade(bruta)
    const chave = chavesDeBusca(unidade).find((c) => indice.has(c))
    const atual = chave ? indice.get(chave) : null

    if (!atual) {
      novas.push({ chave: chaveNatural(unidade), campos: unidade })
      continue
    }

    casadas.add(atual.id)

    const antes = {}
    const depois = {}
    const campos = []

    for (const campo of CAMPOS_IMPORTAVEIS) {
      const novo = unidade[campo]
      if (novo === null) continue

      const gravado = campo === 'status' ? normalizarStatus(atual[campo]) : normalizarCampo(campo, atual[campo])
      if (gravado === novo) continue

      antes[campo] = gravado
      depois[campo] = novo
      campos.push(campo)
    }

    if (campos.length > 0) {
      alteradas.push({ id: atual.id, identificacao: rotulo(atual), antes, depois, campos })
    }
  }

  const ausentes = existentes
    .filter((u) => !casadas.has(u.id))
    .map((u) => ({ id: u.id, identificacao: rotulo(u), status_atual: u.status ?? null }))

  return { novas, alteradas, ausentes }
}

/** Como a unidade gravada e chamada na previa. */
function rotulo(unidade) {
  const identificacao = unidade.identificacao?.trim()
  if (identificacao) return identificacao

  const partes = [unidade.torre?.trim(), unidade.numero?.trim() ? `nº ${unidade.numero.trim()}` : null].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : `Unidade ${unidade.id}`
}

/* ------------------------------------------------------------------ */
/* Validação do que chega do navegador                                 */
/* ------------------------------------------------------------------ */

/** Erro de payload: vira 400 com a lista do que está errado, em português. */
export class PayloadInvalido extends Error {
  constructor(problemas) {
    super(problemas[0])
    this.name = 'PayloadInvalido'
    this.problemas = problemas
  }
}

const ehObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor)

/**
 * O corpo da prévia, revalidado do zero.
 *
 * A tela já valida antes de mandar (é o que dá erro legível na hora), mas a
 * validação de lá é conveniência, não guarda: quem chega aqui pode ter montado
 * o JSON à mão. Campo do tipo errado é RECUSADO em vez de virar null calado —
 * um preço que some sem aviso é pior do que uma importação que não passa.
 */
export function validarPayloadDaPrevia(corpo) {
  const problemas = []

  if (!ehObjeto(corpo)) throw new PayloadInvalido(['O conteúdo enviado não é um objeto JSON.'])

  if (!Array.isArray(corpo.unidades)) {
    throw new PayloadInvalido(['O JSON precisa ter uma lista "unidades".'])
  }
  if (corpo.unidades.length === 0) {
    throw new PayloadInvalido(['A lista "unidades" está vazia — não há o que importar.'])
  }

  const unidades = []

  corpo.unidades.forEach((bruta, indice) => {
    const linha = `unidade ${indice + 1}`
    if (!ehObjeto(bruta)) {
      problemas.push(`A ${linha} não é um objeto.`)
      return
    }

    for (const campo of Object.keys(bruta)) {
      if (!CAMPOS_IMPORTAVEIS.includes(campo)) problemas.push(`Campo desconhecido "${campo}" na ${linha}.`)
    }

    for (const campo of NUMERICOS) {
      const bruto = bruta[campo]
      if (bruto === undefined || bruto === null || bruto === '') continue
      if (typeof bruto !== 'number' && typeof bruto !== 'string') {
        problemas.push(`O campo "${campo}" da ${linha} precisa ser número.`)
        continue
      }
      if (normalizarCampo(campo, bruto) === null) {
        problemas.push(`O campo "${campo}" da ${linha} não é um número válido ("${bruto}").`)
      }
    }

    if (bruta.status !== undefined && bruta.status !== null && bruta.status !== '') {
      if (typeof bruta.status !== 'string') {
        problemas.push(`O status da ${linha} precisa ser texto.`)
      } else if (normalizarStatus(bruta.status) === null) {
        problemas.push(
          `Status "${bruta.status}" da ${linha} não é reconhecido — use disponivel, reservada, vendida, indisponivel ou null.`,
        )
      }
    }

    const unidade = normalizarUnidade(bruta)
    // Sem nada que identifique a linha, ela não casa com nada e viraria uma
    // unidade fantasma no cadastro.
    if (!unidade.identificacao && !unidade.numero && !unidade.torre) {
      problemas.push(`A ${linha} não tem identificação, torre nem número — não dá para saber de que unidade se trata.`)
    }

    unidades.push(unidade)
  })

  if (corpo.duvidas !== undefined && corpo.duvidas !== null && !Array.isArray(corpo.duvidas)) {
    problemas.push('O campo "duvidas" precisa ser uma lista.')
  }
  if (corpo.fluxo_construtora !== undefined && corpo.fluxo_construtora !== null && !ehObjeto(corpo.fluxo_construtora)) {
    problemas.push('O campo "fluxo_construtora" precisa ser um objeto.')
  }

  if (problemas.length > 0) throw new PayloadInvalido(problemas)

  return {
    unidades,
    duvidas: (corpo.duvidas ?? []).map((duvida) => (typeof duvida === 'string' ? { texto: duvida } : duvida)),
    fluxo_construtora: corpo.fluxo_construtora ?? null,
  }
}

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
  'area_comum',
  'area_terraco',
  'espaco_complementar',
  'dormitorios',
  'suites',
  'banheiros',
  'vagas',
  'vagas_detalhe',
  'valor',
  'status',
  'observacoes',
]

const NUMERICOS = new Set([
  'andar',
  'metragem',
  'metragem_total',
  'area_comum',
  'area_terraco',
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
  return derivarDormitorios(saida)
}

/**
 * Suite E dormitorio. A tabela que descreve a tipologia como "2 suites" nao
 * repete a contagem de dormitorios — e sem esta regra a unidade entrava com
 * dormitorios null e sumia do filtro "3 dormitorios" de quem procura.
 *
 * Determinista de proposito: nao depende de a IA ter obedecido a instrucao do
 * prompt. So preenche o que veio VAZIO — dormitorios informado manda sempre
 * ("3 dormitorios sendo 1 suite" continua 3).
 */
export function derivarDormitorios(unidade) {
  if (unidade.dormitorios === null && unidade.suites !== null) {
    return { ...unidade, dormitorios: unidade.suites }
  }
  return unidade
}

/**
 * Quantas torres a tabela deixou concluir. Inteiro >= 1 ou null — "0 torres"
 * nao existe, e um numero quebrado e leitura errada de coluna.
 */
export function normalizarTorres(bruto, problemas) {
  if (bruto === undefined || bruto === null || bruto === '') return null

  if (typeof bruto !== 'number' && typeof bruto !== 'string') {
    problemas.push('O campo "torres" precisa ser um número inteiro (ou null).')
    return null
  }

  const numero = typeof bruto === 'number' ? (Number.isFinite(bruto) ? bruto : null) : lerNumero(bruto)
  if (numero === null) {
    problemas.push(`O campo "torres" não é um número válido ("${bruto}").`)
    return null
  }

  const inteiro = Math.round(numero)
  if (inteiro < 1) {
    problemas.push('O campo "torres" precisa ser pelo menos 1 (ou null quando a tabela não diz).')
    return null
  }

  return inteiro
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
  // Casaram e não mudaram NADA. Elas não aparecem como mudança na prévia (não
  // mudaram mesmo), mas precisam existir aqui: quando a importação traz uma
  // condição de pagamento, é nelas que a tabela nova também tem de entrar —
  // senão importar a condição de venda de um prédio inteiro só pegaria as
  // unidades que por acaso mudaram de preço na mesma semana.
  const inalteradas = []

  for (const bruta of recebidas) {
    const unidade = normalizarUnidade(bruta)
    // A condição de pagamento SÓ desta unidade, quando a tabela varia de uma
    // para a outra. Ela não é coluna de unidade: viaja ao lado dos campos.
    const fluxo = bruta?.fluxo ?? null
    const chave = chavesDeBusca(unidade).find((c) => indice.has(c))
    const atual = chave ? indice.get(chave) : null

    if (!atual) {
      novas.push({ chave: chaveNatural(unidade), campos: unidade, fluxo })
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

    // Unidade sem campo algum alterado ainda entra na lista quando trouxe
    // condição de pagamento própria: é uma mudança de verdade, e sem isso o
    // fluxo dela se perderia entre a prévia e a gravação.
    if (campos.length > 0 || fluxo) {
      alteradas.push({ id: atual.id, identificacao: rotulo(atual), antes, depois, campos, fluxo })
    } else {
      inalteradas.push({ id: atual.id, identificacao: rotulo(atual) })
    }
  }

  const ausentes = existentes
    .filter((u) => !casadas.has(u.id))
    .map((u) => ({ id: u.id, identificacao: rotulo(u), status_atual: u.status ?? null }))

  return { novas, alteradas, inalteradas, ausentes }
}

/** Como a unidade gravada e chamada na previa. */
function rotulo(unidade) {
  const identificacao = unidade.identificacao?.trim()
  if (identificacao) return identificacao

  const partes = [unidade.torre?.trim(), unidade.numero?.trim() ? `nº ${unidade.numero.trim()}` : null].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : `Unidade ${unidade.id}`
}


/* ------------------------------------------------------------------ */
/* A condição de pagamento que veio na tabela                          */
/* ------------------------------------------------------------------ */

/**
 * Os campos NUMÉRICOS de uma condição de pagamento, e a coluna de
 * `fluxos_pagamento` em que cada um cai.
 *
 * `chaves_valor` é o único sem coluna: a tabela guarda chaves em PERCENTUAL, e
 * o R$ vira percentual sobre o valor da unidade na hora de gravar. Guardar as
 * duas formas daria duas fontes de verdade para o mesmo número.
 */
export const CAMPOS_FLUXO_IMPORTADO = [
  'entrada_pct',
  'entrada_valor',
  'entrada_parcelas',
  'parcelas',
  'parcela_valor',
  'reforcos_qtd',
  'reforco_valor',
  'chaves_pct',
  'chaves_valor',
  'financiamento_pct',
  'financiamento_valor',
  'pos_parcelas',
  'pos_parcela_valor',
  'pos_reforcos_qtd',
  'pos_reforco_valor',
]

/** Quantidades: 30 parcelas, 6 reforços. Nunca fracionário, nunca 0. */
const QUANTIDADES_FLUXO = new Set([
  'entrada_parcelas',
  'parcelas',
  'reforcos_qtd',
  'pos_parcelas',
  'pos_reforcos_qtd',
])

/** Percentuais: acima de 100 é leitura errada de coluna, não condição exótica. */
const PERCENTUAIS_FLUXO = new Set(['entrada_pct', 'chaves_pct', 'financiamento_pct'])

const PERIODICIDADES = ['semestral', 'anual', 'trimestral', 'mensal']

/**
 * Uma condição de pagamento revalidada do zero, do jeito que sai do JSON.
 *
 * Devolve null quando não há condição nenhuma — objeto vazio, ou só nome. Um
 * fluxo em branco gravado em trinta unidades é ruído puro para quem vende.
 * Os problemas são ACRESCENTADOS na lista recebida: a pessoa precisa ver tudo
 * de uma vez, não um erro por viagem ao chat.
 */
export function lerFluxoDaConstrutora(bruto, onde, problemas) {
  if (bruto === undefined || bruto === null) return null
  if (!ehObjeto(bruto)) {
    problemas.push(`A condição de pagamento ${onde} precisa ser um objeto.`)
    return null
  }

  const fluxo = {}

  for (const campo of CAMPOS_FLUXO_IMPORTADO) {
    const valor = bruto[campo]
    if (valor === undefined || valor === null || valor === '') {
      fluxo[campo] = null
      continue
    }
    if (typeof valor !== 'number' && typeof valor !== 'string') {
      problemas.push(`O campo "${campo}" da condição de pagamento ${onde} precisa ser número.`)
      fluxo[campo] = null
      continue
    }

    let numero = typeof valor === 'number' ? (Number.isFinite(valor) ? valor : null) : lerNumero(valor)
    if (numero === null) {
      problemas.push(
        `O campo "${campo}" da condição de pagamento ${onde} não é um número válido ("${valor}").`,
      )
    } else if (numero < 0) {
      problemas.push(`O campo "${campo}" da condição de pagamento ${onde} não pode ser negativo.`)
      numero = null
    } else if (PERCENTUAIS_FLUXO.has(campo) && numero > 100) {
      problemas.push(
        `O campo "${campo}" da condição de pagamento ${onde} é um percentual e veio ${numero} — use o número do percentual (20% → 20).`,
      )
      numero = null
    } else if (QUANTIDADES_FLUXO.has(campo)) {
      numero = Math.round(numero)
      // Campo em branco vira NULL, nunca 0: "0 parcelas" não existe.
      if (numero === 0) numero = null
    }

    fluxo[campo] = numero
  }

  const texto = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)
  fluxo.nome = texto(bruto.nome)
  fluxo.descricao = texto(bruto.descricao)

  const periodicidade = achatar(bruto.reforcos_periodicidade)
  if (periodicidade && !PERIODICIDADES.includes(periodicidade)) {
    problemas.push(
      `A periodicidade dos reforços ${onde} ("${bruto.reforcos_periodicidade}") não é reconhecida — use semestral ou anual.`,
    )
    fluxo.reforcos_periodicidade = null
  } else {
    fluxo.reforcos_periodicidade = periodicidade || null
  }

  const temNumero = CAMPOS_FLUXO_IMPORTADO.some((campo) => fluxo[campo] !== null)
  return temNumero ? fluxo : null
}

/** "6 reforços semestrais" — o que a tabela disse e a coluna não guarda. */
const NOME_PERIODICIDADE = {
  semestral: 'semestrais',
  anual: 'anuais',
  trimestral: 'trimestrais',
  mensal: 'mensais',
}

/** O nome de um fluxo importado quando o JSON não trouxe nenhum. */
export const NOME_FLUXO_PADRAO = 'Tabela da construtora'

/**
 * A condição lida virando as COLUNAS de `fluxos_pagamento`.
 *
 * Duas conversões acontecem aqui, e as duas precisam do valor da unidade:
 * chaves em R$ vira percentual (é assim que a coluna existe) e entrada em %
 * vira também R$ (as telas mostram os dois lados). `cub_valor_imovel` recebe o
 * preço da unidade porque é dele que todas as contas do fluxo saem — sem base,
 * o detalhe do fluxo abriria com tudo em branco.
 *
 * @param valorDaUnidade preço da unidade a que o fluxo vai pertencer.
 */
export function fluxoParaColunas(fluxo, valorDaUnidade) {
  const base = typeof valorDaUnidade === 'number' && Number.isFinite(valorDaUnidade) && valorDaUnidade > 0
    ? valorDaUnidade
    : null

  const entradaPct = fluxo.entrada_pct
  const entradaValor =
    fluxo.entrada_valor ?? (base !== null && entradaPct !== null ? (base * entradaPct) / 100 : null)

  const chavesPct =
    fluxo.chaves_pct ?? (base !== null && fluxo.chaves_valor !== null ? (fluxo.chaves_valor / base) * 100 : null)

  // A periodicidade não tem coluna: ela vira uma frase na descrição, que é
  // onde o corretor lê "reforços semestrais" antes de falar com o cliente.
  const nota =
    fluxo.reforcos_periodicidade && fluxo.reforcos_qtd
      ? `Reforços ${NOME_PERIODICIDADE[fluxo.reforcos_periodicidade] ?? fluxo.reforcos_periodicidade}.`
      : null
  const descricao = [nota, fluxo.descricao].filter(Boolean).join(' ') || null

  return {
    nome: fluxo.nome || NOME_FLUXO_PADRAO,
    entrada_pct: entradaPct ?? (base !== null && entradaValor !== null ? (entradaValor / base) * 100 : null),
    entrada_valor: entradaValor,
    entrada_parcelas: fluxo.entrada_parcelas,
    parcelas: fluxo.parcelas,
    parcela_valor: fluxo.parcela_valor,
    reforcos_qtd: fluxo.reforcos_qtd,
    reforco_valor: fluxo.reforco_valor,
    chaves_pct: chavesPct,
    financiamento_pct: fluxo.financiamento_pct,
    financiamento_valor:
      fluxo.financiamento_valor ??
      (base !== null && fluxo.financiamento_pct !== null ? (base * fluxo.financiamento_pct) / 100 : null),
    pos_parcelas: fluxo.pos_parcelas,
    pos_parcela_valor: fluxo.pos_parcela_valor,
    pos_reforcos_qtd: fluxo.pos_reforcos_qtd,
    pos_reforco_valor: fluxo.pos_reforco_valor,
    descricao,
    cub_valor_imovel: base,
  }
}

/** Dois fluxos com o mesmo nome são o MESMO fluxo — é o que evita a cópia. */
export function mesmoNomeDeFluxo(a, b) {
  return achatar(a || NOME_FLUXO_PADRAO) === achatar(b || NOME_FLUXO_PADRAO)
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
      // "fluxo" é a exceção: não é coluna da unidade, é a condição de
      // pagamento só dela.
      if (campo === 'fluxo') continue
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
    const fluxoProprio = lerFluxoDaConstrutora(bruta.fluxo, `da ${linha}`, problemas)
    if (fluxoProprio) unidade.fluxo = fluxoProprio

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
  const fluxoGeral = lerFluxoDaConstrutora(corpo.fluxo_construtora, 'da tabela', problemas)
  // As torres sao do PREDIO, entao vem no topo do JSON — nao dentro da unidade.
  const torres = normalizarTorres(corpo.torres, problemas)

  if (problemas.length > 0) throw new PayloadInvalido(problemas)

  return {
    unidades,
    duvidas: (corpo.duvidas ?? []).map((duvida) => (typeof duvida === 'string' ? { texto: duvida } : duvida)),
    fluxo_construtora: fluxoGeral,
    torres,
  }
}

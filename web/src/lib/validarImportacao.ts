/**
 * A resposta que a pessoa colou de volta, conferida ANTES de ir para a API.
 *
 * O texto vem de um chat: quase sempre com "Claro! Aqui está:" na frente, as
 * vezes com um comentario depois, as vezes com o JSON solto sem bloco de
 * codigo. Aqui a gente recorta o bloco, faz o parse e confere campo a campo —
 * e, quando algo esta errado, diz O QUE esta errado e em qual unidade. "JSON
 * invalido" seco mandaria a pessoa de volta ao chat sem saber o que pedir.
 *
 * ⚠️ Isto e conveniencia, NAO e a guarda. O servidor revalida tudo de novo
 * (`api/src/importacao.js`): o que chega la foi montado a partir de um texto
 * colado, e nada e confiavel por ter passado por aqui.
 *
 * Modulo PURO: nenhuma importacao de React, nada de DOM — e o que deixa
 * testar cada caso sem montar a tela.
 */
import type { CamposImportados, DuvidaImportacao, FluxoDaConstrutora, StatusUnidade } from '../types'

/** As chaves que uma unidade pode ter. Qualquer outra e recusada. */
export const CAMPOS_ACEITOS = [
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
] as const

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

const TEXTOS = new Set(['identificacao', 'torre', 'numero', 'tipologia', 'observacoes'])

export const STATUS_ACEITOS: StatusUnidade[] = ['disponivel', 'reservada', 'vendida', 'indisponivel']

/** Milhar so quando o padrao e 1.234.567 — a MESMA regra do resto do projeto. */
const SO_MILHAR = /^-?\d{1,3}(\.\d{3})+$/

/**
 * Numero em pt-BR. A virgula e sempre decimal; o ponto so e milhar quando
 * separa grupos de 3 digitos ("800.000" = oitocentos mil, "80.5" = 80,5).
 */
export function lerNumeroBr(bruto: unknown): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null
  if (typeof bruto !== 'string') return null

  const texto = bruto.replace(/[^\d,.-]/g, '').trim()
  if (!texto) return null

  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : SO_MILHAR.test(texto)
      ? texto.replace(/\./g, '')
      : texto

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

const achatar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const EQUIVALENTES: Record<string, StatusUnidade> = {
  disponivel: 'disponivel',
  livre: 'disponivel',
  avenda: 'disponivel',
  reservada: 'reservada',
  reservado: 'reservada',
  vendida: 'vendida',
  vendido: 'vendida',
  indisponivel: 'indisponivel',
  bloqueada: 'indisponivel',
  permutada: 'indisponivel',
}

export function lerStatus(bruto: unknown): StatusUnidade | null {
  if (typeof bruto !== 'string') return null
  return EQUIVALENTES[achatar(bruto)] ?? null
}

/**
 * Recorta o JSON de um texto de chat.
 *
 * Na ordem: bloco ```json, bloco ``` sem linguagem e, por fim, do primeiro `{`
 * ate o ultimo `}` — que e o que salva a resposta colada sem a cerca.
 */
export function extrairJson(texto: string): string | null {
  const cercado = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto)
  if (cercado?.[1]?.trim()) return cercado[1].trim()

  const inicio = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (inicio !== -1 && fim > inicio) return texto.slice(inicio, fim + 1)

  return null
}

export interface ResultadoValidacao {
  ok: boolean
  /** Tudo que impede de seguir, em português e apontando a unidade. */
  problemas: string[]
  unidades: CamposImportados[]
  duvidas: DuvidaImportacao[]
  fluxo_construtora: FluxoDaConstrutora | null
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor)

const recusar = (...problemas: string[]): ResultadoValidacao => ({
  ok: false,
  problemas,
  unidades: [],
  duvidas: [],
  fluxo_construtora: null,
})

const CAMPOS_FLUXO = [
  'entrada_pct',
  'entrada_valor',
  'parcelas',
  'parcela_valor',
  'reforcos_qtd',
  'reforco_valor',
  'chaves_pct',
  'financiamento_pct',
  'financiamento_valor',
] as const

/** A resposta do chat, do texto cru ao payload pronto para a prévia. */
export function validarRespostaDaIa(texto: string): ResultadoValidacao {
  const recortado = extrairJson(texto ?? '')
  if (!recortado) {
    return recusar(
      'Não encontrei nenhum JSON no texto colado. Copie a resposta inteira do chat, incluindo o bloco que começa com ```json.',
    )
  }

  let bruto: unknown
  try {
    bruto = JSON.parse(recortado)
  } catch (erro) {
    return recusar(
      `O JSON colado está incompleto ou malformado (${
        erro instanceof Error ? erro.message : 'erro de leitura'
      }). Peça ao chat para repetir a resposta só com o bloco JSON.`,
    )
  }

  if (!ehObjeto(bruto)) return recusar('O conteúdo colado não é um objeto JSON.')
  if (!Array.isArray(bruto.unidades)) {
    return recusar('O JSON precisa ter uma lista "unidades" — foi ela que o prompt pediu.')
  }
  if (bruto.unidades.length === 0) {
    return recusar('A lista "unidades" veio vazia. Confira se a tabela foi colada junto do prompt no chat.')
  }

  const problemas: string[] = []
  const unidades: CamposImportados[] = []

  bruto.unidades.forEach((cru: unknown, indice: number) => {
    if (!ehObjeto(cru)) {
      problemas.push(`A unidade ${indice + 1} não é um objeto.`)
      return
    }

    const nome =
      typeof cru.identificacao === 'string' && cru.identificacao.trim()
        ? `"${cru.identificacao.trim()}"`
        : `${indice + 1}`
    const onde = `unidade ${nome}`

    for (const chave of Object.keys(cru)) {
      if (!(CAMPOS_ACEITOS as readonly string[]).includes(chave)) {
        problemas.push(`Campo desconhecido "${chave}" na ${onde} — o prompt não pede esse campo.`)
      }
    }

    const unidade = {} as CamposImportados

    for (const campo of CAMPOS_ACEITOS) {
      const valor = cru[campo]
      const vazio = valor === undefined || valor === null || valor === ''

      if (campo === 'status') {
        if (vazio) {
          unidade.status = null
        } else if (typeof valor !== 'string') {
          problemas.push(`O status da ${onde} precisa ser texto.`)
        } else {
          const status = lerStatus(valor)
          if (status === null) {
            problemas.push(
              `Status "${valor}" da ${onde} não é reconhecido — use ${STATUS_ACEITOS.join(', ')} ou null.`,
            )
          }
          unidade.status = status
        }
        continue
      }

      if (NUMERICOS.has(campo)) {
        if (vazio) {
          // Campo em branco vira null, nunca 0: é o vazio que o comparativo lê
          // como "não informado".
          ;(unidade as unknown as Record<string, unknown>)[campo] = null
          continue
        }
        if (typeof valor !== 'number' && typeof valor !== 'string') {
          problemas.push(`O campo "${campo}" da ${onde} precisa ser número.`)
          ;(unidade as unknown as Record<string, unknown>)[campo] = null
          continue
        }
        const numero = lerNumeroBr(valor)
        if (numero === null) {
          problemas.push(`O campo "${campo}" da ${onde} não é um número válido ("${String(valor)}").`)
        }
        ;(unidade as unknown as Record<string, unknown>)[campo] =
          numero !== null && INTEIROS.has(campo) ? Math.round(numero) : numero
        continue
      }

      if (TEXTOS.has(campo)) {
        if (vazio) {
          ;(unidade as unknown as Record<string, unknown>)[campo] = null
          continue
        }
        // Número onde se espera texto é aceito e vira texto: "numero": 1204
        // é o deslize mais comum do chat, e recusar por isso não ajuda ninguém.
        if (typeof valor !== 'string' && typeof valor !== 'number') {
          problemas.push(`O campo "${campo}" da ${onde} precisa ser texto.`)
          ;(unidade as unknown as Record<string, unknown>)[campo] = null
          continue
        }
        const texto2 = String(valor).trim()
        ;(unidade as unknown as Record<string, unknown>)[campo] = texto2 || null
      }
    }

    if (!unidade.identificacao && !unidade.numero && !unidade.torre) {
      problemas.push(
        `A unidade ${indice + 1} não tem identificação, torre nem número — não dá para saber de que unidade se trata.`,
      )
    }

    unidades.push(unidade)
  })

  // As dúvidas vêm como lista de frases (é o que o prompt pede), mas um chat
  // pode devolver objetos: os dois formatos entram.
  const duvidas: DuvidaImportacao[] = []
  if (bruto.duvidas !== undefined && bruto.duvidas !== null) {
    if (!Array.isArray(bruto.duvidas)) {
      problemas.push('O campo "duvidas" precisa ser uma lista de frases.')
    } else {
      for (const duvida of bruto.duvidas) {
        if (typeof duvida === 'string' && duvida.trim()) duvidas.push({ texto: duvida.trim() })
        else if (ehObjeto(duvida) && typeof duvida.texto === 'string') {
          duvidas.push({
            texto: duvida.texto,
            unidade: typeof duvida.unidade === 'string' ? duvida.unidade : null,
            campo: typeof duvida.campo === 'string' ? duvida.campo : null,
          })
        }
      }
    }
  }

  let fluxo: FluxoDaConstrutora | null = null
  if (bruto.fluxo_construtora !== undefined && bruto.fluxo_construtora !== null) {
    if (!ehObjeto(bruto.fluxo_construtora)) {
      problemas.push('O campo "fluxo_construtora" precisa ser um objeto (ou null).')
    } else {
      const cru = bruto.fluxo_construtora
      fluxo = {}
      for (const campo of CAMPOS_FLUXO) fluxo[campo] = lerNumeroBr(cru[campo])
      fluxo.nome = typeof cru.nome === 'string' ? cru.nome.trim() || null : null
      fluxo.descricao = typeof cru.descricao === 'string' ? cru.descricao.trim() || null : null

      // Objeto todo vazio não é condição de pagamento nenhuma.
      if (Object.values(fluxo).every((valor) => valor === null)) fluxo = null
    }
  }

  return { ok: problemas.length === 0, problemas, unidades, duvidas, fluxo_construtora: fluxo }
}

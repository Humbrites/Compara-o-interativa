/**
 * Corrigir a leitura da IA antes de gravar.
 *
 * A tabela da construtora nao e padronizada: uma coluna lida como area comum
 * quando era privativa vira preco do m² errado em trinta unidades, e a unica
 * saida seria voltar ao chat e refazer a resposta inteira. A previa entao deixa
 * ajustar campo a campo — e o que a pessoa digita VENCE o que a IA propos.
 *
 * ⚠️ Isto e conveniencia, NAO e a guarda: a API revalida tudo do zero, e para
 * ela o valor corrigido chega igual ao lido — texto colado por uma pessoa.
 *
 * Modulo PURO: nenhuma importacao de React, nada de DOM.
 */
import type { CampoImportado, CamposImportados } from '../types'
import { fmtMoeda, fmtNumero } from './format'
import { lerNumeroBr, lerStatus } from './validarImportacao'

/** Os campos que a importacao preenche, na ordem e com o nome de tela de cada um. */
export const ROTULO_CAMPO_IMPORTADO: Record<CampoImportado, string> = {
  identificacao: 'Identificação',
  torre: 'Torre',
  andar: 'Andar',
  numero: 'Número',
  tipologia: 'Tipologia',
  metragem: 'Metragem privativa',
  metragem_total: 'Metragem total',
  area_comum: 'Área comum',
  area_terraco: 'Área de terraço',
  espaco_complementar: 'Espaço complementar',
  dormitorios: 'Dormitórios',
  suites: 'Suítes',
  banheiros: 'Banheiros',
  vagas: 'Vagas',
  vagas_detalhe: 'Detalhe das vagas',
  valor: 'Valor',
  status: 'Status',
  observacoes: 'Observações',
}

/** Os campos que a previa deixa corrigir, na ordem em que a tabela e lida. */
export const CAMPOS_EDITAVEIS = Object.keys(ROTULO_CAMPO_IMPORTADO) as CampoImportado[]

export const CAMPOS_NUMERICOS = new Set<CampoImportado>([
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

const INTEIROS = new Set<CampoImportado>(['andar', 'dormitorios', 'suites', 'banheiros', 'vagas'])

/**
 * O valor proposto no formato em que ele entra no input.
 *
 * Numero sai em pt-BR ("800.000", "62,5") porque e assim que a pessoa le e
 * digita — e `lerNumeroBr` devolve exatamente o mesmo numero na volta, entao
 * campo nao tocado nunca vira "correcao" por causa da formatacao.
 */
export function textoDoCampo(campo: CampoImportado, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (CAMPOS_NUMERICOS.has(campo)) return fmtNumero(Number(valor))
  return String(valor)
}

/**
 * O que a pessoa digitou virando dado. Campo em branco vira NULL, nunca 0 nem
 * string vazia — e o vazio que o resto do sistema le como "nao informado".
 */
export function valorDoTexto(campo: CampoImportado, texto: string): unknown {
  const limpo = texto.trim()
  if (!limpo) return null
  if (campo === 'status') return lerStatus(limpo)
  if (CAMPOS_NUMERICOS.has(campo)) {
    const numero = lerNumeroBr(limpo)
    if (numero === null) return null
    return INTEIROS.has(campo) ? Math.round(numero) : numero
  }
  return limpo
}

/** O que a pessoa digitou em cada linha da previa, ainda como texto. */
export type CorrecoesDaLinha = Partial<Record<CampoImportado, string>>

/**
 * So o que REALMENTE mudou em relacao ao que a tabela trouxe.
 *
 * Comparar pelo TEXTO (e nao pelo valor) e o que impede a linha de aparecer
 * como "corrigida" so porque alguem clicou no campo e saiu dele.
 */
export function correcoesEfetivas(
  digitado: CorrecoesDaLinha | undefined,
  proposto: CamposImportados,
): Partial<CamposImportados> {
  const saida: Record<string, unknown> = {}
  if (!digitado) return saida

  for (const campo of CAMPOS_EDITAVEIS) {
    const texto = digitado[campo]
    if (texto === undefined) continue
    if (texto === textoDoCampo(campo, proposto[campo])) continue
    saida[campo] = valorDoTexto(campo, texto)
  }

  return saida as Partial<CamposImportados>
}

/**
 * Quanto o preco subiu ou desceu, com sinal. E a leitura que decide se a
 * importacao vale: "R$ 820.000" sozinho nao diz que a unidade encareceu 20 mil.
 */
export function variacaoDePreco(
  antes: unknown,
  depois: unknown,
): { texto: string; subiu: boolean } | null {
  if (typeof antes !== 'number' || typeof depois !== 'number') return null
  const diferenca = depois - antes
  if (diferenca === 0) return null
  return { texto: `${diferenca > 0 ? '+' : '−'}${fmtMoeda(Math.abs(diferenca))}`, subiu: diferenca > 0 }
}

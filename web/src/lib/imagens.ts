import type { Empreendimento } from '../types'

/**
 * Uma foto pronta para exibir, venha ela da galeria enviada ou do campo
 * antigo "link de imagem" — quem exibe nao precisa saber a origem.
 */
export interface Foto {
  chave: string
  url: string
  alt: string
}

/**
 * Capa do empreendimento: a primeira foto da galeria. Sem galeria, o link
 * avulso ainda vale — foi assim que os primeiros cadastros foram feitos.
 */
export function capaDe(e: Empreendimento): string | null {
  return e.imagens?.[0]?.url ?? (e.imagem_url || null)
}

/** Galeria completa, na ordem, com o link avulso no fim quando existir. */
export function fotosDe(e: Empreendimento): Foto[] {
  const fotos: Foto[] = (e.imagens ?? []).map((imagem) => ({
    chave: `imagem-${imagem.id}`,
    url: imagem.url,
    alt: imagem.nome_original || e.nome,
  }))

  if (e.imagem_url) fotos.push({ chave: 'link-avulso', url: e.imagem_url, alt: e.nome })

  return fotos
}

/** Rotulo curto de tamanho de arquivo (o backend guarda em bytes). */
export function fmtTamanho(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

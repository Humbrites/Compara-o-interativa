import type { JSX } from 'react'

/**
 * Icones desenhados aqui mesmo (traco de 24x24, estilo linear) para o projeto
 * nao depender de biblioteca nem de CDN.
 */
const TRACOS: Record<string, JSX.Element> = {
  predio: (
    <>
      <path d="M3 21h18" />
      <path d="M6 21V6a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v15" />
      <path d="M13 21V11a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10" />
      <path d="M9 9h1M9 13h1M9 17h1M16 14h1M16 18h1" />
    </>
  ),
  pino: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  mais: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  fechar: (
    <>
      <path d="M18 6 6 18M6 6l12 12" />
    </>
  ),
  check: (
    <>
      <path d="M20 6 9 17l-5-5" />
    </>
  ),
  lapis: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  lixeira: (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  imagem: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  dinheiro: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.5-.5-3-1.5" />
      <path d="M12 6v2M12 16v2" />
    </>
  ),
  regua: (
    <>
      <path d="M3 8h18v8H3z" />
      <path d="M7 8v3M11 8v3M15 8v3M19 8v3" />
    </>
  ),
  cama: (
    <>
      <path d="M3 18v-6h18v6" />
      <path d="M3 18v2M21 18v2M3 12V8" />
      <path d="M7 12V9h6a2 2 0 0 1 2 2v1" />
    </>
  ),
  banheira: (
    <>
      <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z" />
      <path d="M7 12V6a2 2 0 0 1 4 0" />
      <path d="M6 21l1-2M18 21l-1-2" />
    </>
  ),
  carro: (
    <>
      <path d="M5 17h14M4 17v-4l2-5h12l2 5v4" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
      <path d="M6 13h12" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  obra: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V10l7-4 7 4v11" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  filtro: (
    <>
      <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  balanca: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M12 6 5 8l-2 5h8l-2-5" />
      <path d="M12 6l7 2 2 5h-8l2-5" />
    </>
  ),
  seta_direita: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  seta_esquerda: (
    <>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3l9 16H3l9-16Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  spinner: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </>
  ),
  lista: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  cartao: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  chave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8 3 3-8 8" />
      <path d="m16 7 2 2" />
    </>
  ),
  banco: (
    <>
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6M3 20h18" />
    </>
  ),
  grafico: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  seta_baixo: (
    <>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </>
  ),
  seta_cima: (
    <>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </>
  ),
  igual: (
    <>
      <path d="M5 9h14M5 15h14" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  local: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  camadas: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  atualizar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </>
  ),
}

export type NomeIcone = keyof typeof TRACOS

interface Props {
  nome: NomeIcone
  tamanho?: number
  className?: string
  espessura?: number
}

export function Icone({ nome, tamanho = 16, className, espessura = 1.8 }: Props) {
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={espessura}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACOS[nome]}
    </svg>
  )
}

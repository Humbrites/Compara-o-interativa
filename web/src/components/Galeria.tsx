import { useEffect, useState } from 'react'
import type { Foto } from '../lib/imagens'
import { Icone } from './Icones'
import { Selo } from './ui'

interface Props {
  fotos: Foto[]
  nome: string
  tipo: string | null
  /** Avisa quando nao sobrou nenhuma foto exibivel (todos os links quebraram). */
  onVazia?: (vazia: boolean) => void
}

/**
 * Capa + tira de miniaturas do painel de detalhe. Clicar amplia a foto em
 * tela cheia, com navegacao por teclado.
 */
export function Galeria({ fotos, nome, tipo, onVazia }: Props) {
  const [atual, setAtual] = useState(0)
  const [ampliado, setAmpliado] = useState(false)
  // Link quebrado nao pode deixar buraco: a foto sai da tira.
  const [quebradas, setQuebradas] = useState<string[]>([])

  const visiveis = fotos.filter((foto) => !quebradas.includes(foto.chave))

  // Trocar de empreendimento (ou perder a foto atual) volta para a capa.
  useEffect(() => {
    if (atual > visiveis.length - 1) setAtual(0)
  }, [atual, visiveis.length])

  // Sem foto exibivel o painel precisa saber, para nao esconder o nome.
  useEffect(() => {
    onVazia?.(visiveis.length === 0)
  }, [visiveis.length, onVazia])

  useEffect(() => {
    if (!ampliado) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAmpliado(false)
      if (evento.key === 'ArrowRight') setAtual((i) => (i + 1) % visiveis.length)
      if (evento.key === 'ArrowLeft') setAtual((i) => (i - 1 + visiveis.length) % visiveis.length)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [ampliado, visiveis.length])

  if (visiveis.length === 0) return null

  const foto = visiveis[Math.min(atual, visiveis.length - 1)]
  const varias = visiveis.length > 1

  function andar(passo: number) {
    setAtual((i) => (i + passo + visiveis.length) % visiveis.length)
  }

  return (
    <>
      <div className="capa">
        <button
          type="button"
          className="capa__abrir"
          onClick={() => setAmpliado(true)}
          aria-label={`Ampliar foto de ${nome}`}
        >
          <img
            src={foto.url}
            alt={foto.alt}
            onError={() => setQuebradas((atuais) => [...atuais, foto.chave])}
          />
        </button>

        <div className="capa__gradiente" />
        <div className="capa__nome">{nome}</div>
        {tipo && (
          <span className="capa__selo">
            <Selo cor="cinza">{tipo}</Selo>
          </span>
        )}

        {varias && (
          <>
            <button type="button" className="capa__seta capa__seta--esq" onClick={() => andar(-1)} aria-label="Foto anterior">
              <Icone nome="seta_esquerda" tamanho={16} />
            </button>
            <button type="button" className="capa__seta capa__seta--dir" onClick={() => andar(1)} aria-label="Próxima foto">
              <Icone nome="seta_direita" tamanho={16} />
            </button>
            <span className="capa__contador">
              {atual + 1}/{visiveis.length}
            </span>
          </>
        )}
      </div>

      {varias && (
        <div className="tira">
          {visiveis.map((item, indice) => (
            <button
              key={item.chave}
              type="button"
              className={`tira__item${indice === atual ? ' tira__item--ativo' : ''}`}
              onClick={() => setAtual(indice)}
              aria-label={`Ver foto ${indice + 1}`}
              aria-current={indice === atual}
            >
              <img src={item.url} alt="" onError={() => setQuebradas((atuais) => [...atuais, item.chave])} />
            </button>
          ))}
        </div>
      )}

      {ampliado && (
        <div className="visor" role="dialog" aria-modal="true" aria-label={`Fotos de ${nome}`} onClick={() => setAmpliado(false)}>
          <button type="button" className="visor__fechar" onClick={() => setAmpliado(false)} aria-label="Fechar">
            <Icone nome="fechar" tamanho={20} />
          </button>

          <img className="visor__img" src={foto.url} alt={foto.alt} onClick={(e) => e.stopPropagation()} />

          {varias && (
            <>
              <button
                type="button"
                className="visor__seta visor__seta--esq"
                onClick={(e) => {
                  e.stopPropagation()
                  andar(-1)
                }}
                aria-label="Foto anterior"
              >
                <Icone nome="seta_esquerda" tamanho={22} />
              </button>
              <button
                type="button"
                className="visor__seta visor__seta--dir"
                onClick={(e) => {
                  e.stopPropagation()
                  andar(1)
                }}
                aria-label="Próxima foto"
              >
                <Icone nome="seta_direita" tamanho={22} />
              </button>
              <span className="visor__contador">
                {atual + 1} de {visiveis.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  )
}

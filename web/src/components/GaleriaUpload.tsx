import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImagemEmpreendimento } from '../types'
import { api } from '../lib/api'
import { fmtTamanho } from '../lib/imagens'
import { Icone } from './Icones'

/** Espelha a lista aceita pela API — recusar aqui evita uma ida ao servidor. */
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const TAMANHO_MAX = 12 * 1024 * 1024
const ACCEPT = TIPOS_ACEITOS.join(',')

interface Props {
  /** null enquanto o empreendimento ainda nao foi salvo. */
  empreendimentoId: number | null
  imagens: ImagemEmpreendimento[]
  /** Escolhidas antes de existir id: sobem assim que o cadastro for salvo. */
  pendentes: File[]
  onImagens: (imagens: ImagemEmpreendimento[]) => void
  onPendentes: (arquivos: File[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function GaleriaUpload({
  empreendimentoId,
  imagens,
  pendentes,
  onImagens,
  onPendentes,
  avisar,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [sobreZona, setSobreZona] = useState(false)
  const [confirmando, setConfirmando] = useState<number | null>(null)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<number | null>(null)

  // Previa local dos pendentes: o objectURL precisa ser devolvido depois.
  const previas = useMemo(
    () => pendentes.map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo) })),
    [pendentes],
  )
  useEffect(() => () => previas.forEach((previa) => URL.revokeObjectURL(previa.url)), [previas])

  const total = imagens.length + pendentes.length

  /* --- Entrada de arquivos ---------------------------------------------- */

  function receber(lista: FileList | null) {
    if (!lista || lista.length === 0) return

    const aceitos: File[] = []
    const recusados: string[] = []
    for (const arquivo of Array.from(lista)) {
      if (!TIPOS_ACEITOS.includes(arquivo.type)) recusados.push(`${arquivo.name}: formato não suportado`)
      else if (arquivo.size > TAMANHO_MAX) recusados.push(`${arquivo.name}: acima de 12 MB`)
      else aceitos.push(arquivo)
    }

    if (recusados.length > 0) avisar(recusados[0], 'erro')
    if (aceitos.length === 0) return

    // Sem id ainda: guarda para enviar junto com o cadastro.
    if (empreendimentoId === null) {
      onPendentes([...pendentes, ...aceitos])
      return
    }
    void enviar(aceitos)
  }

  async function enviar(arquivos: File[]) {
    if (empreendimentoId === null) return
    setEnviando(true)
    try {
      const resposta = await api.enviarImagens(empreendimentoId, arquivos)
      onImagens(resposta.imagens)

      const recusadas = resposta.recusadas ?? []
      if (recusadas.length > 0) avisar(`${recusadas[0].nome}: ${recusadas[0].motivo}`, 'erro')
      else avisar(arquivos.length === 1 ? 'Foto adicionada' : `${arquivos.length} fotos adicionadas`)
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao enviar as fotos', 'erro')
    } finally {
      setEnviando(false)
    }
  }

  /* --- Acoes sobre as ja salvas ------------------------------------------ */

  async function remover(imagem: ImagemEmpreendimento) {
    setConfirmando(null)
    try {
      const resposta = await api.excluirImagem(imagem.id)
      onImagens(resposta.imagens)
      avisar('Foto removida')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao remover a foto', 'erro')
    }
  }

  async function reordenar(de: number, para: number) {
    if (empreendimentoId === null || de === para) return

    const nova = [...imagens]
    const [movida] = nova.splice(de, 1)
    nova.splice(para, 0, movida)

    // Move na tela primeiro; se a API recusar, volta ao que estava.
    const anterior = imagens
    onImagens(nova.map((imagem, indice) => ({ ...imagem, ordem: indice })))
    try {
      const resposta = await api.reordenarImagens(empreendimentoId, nova.map((imagem) => imagem.id))
      onImagens(resposta.imagens)
    } catch (erro) {
      onImagens(anterior)
      avisar(erro instanceof Error ? erro.message : 'Falha ao reordenar as fotos', 'erro')
    }
  }

  function removerPendente(indice: number) {
    onPendentes(pendentes.filter((_, i) => i !== indice))
  }

  function promoverPendente(indice: number) {
    const nova = [...pendentes]
    const [movida] = nova.splice(indice, 1)
    nova.unshift(movida)
    onPendentes(nova)
  }

  /* --- Render ------------------------------------------------------------ */

  const primeiraPendenteEhCapa = imagens.length === 0

  return (
    <div className="galeria-upload">
      <div
        className={`dropzone${sobreZona ? ' dropzone--ativa' : ''}${enviando ? ' dropzone--ocupada' : ''}`}
        onDragOver={(evento) => {
          // So reage a arquivo vindo de fora; arrastar miniatura e outra coisa.
          if (arrastando !== null) return
          evento.preventDefault()
          setSobreZona(true)
        }}
        onDragLeave={() => setSobreZona(false)}
        onDrop={(evento) => {
          if (arrastando !== null) return
          evento.preventDefault()
          setSobreZona(false)
          receber(evento.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(evento) => {
            receber(evento.target.files)
            // Permite escolher o mesmo arquivo de novo depois de remover.
            evento.target.value = ''
          }}
        />

        {enviando ? (
          <>
            <Icone nome="spinner" tamanho={22} className="girando" />
            <span className="dropzone__titulo">Enviando fotos…</span>
          </>
        ) : (
          <>
            <Icone nome="imagem" tamanho={22} />
            <span className="dropzone__titulo">Arraste as fotos aqui</span>
            <span className="dropzone__dica">JPG, PNG, WEBP, GIF ou AVIF · até 12 MB cada</span>
            <button
              type="button"
              className="btn btn--secundario btn--pequeno"
              onClick={() => inputRef.current?.click()}
            >
              <Icone nome="mais" tamanho={13} />
              Escolher do computador
            </button>
          </>
        )}
      </div>

      {total > 0 && (
        <>
          <p className="campo__dica galeria-upload__legenda">
            {total === 1 ? '1 foto' : `${total} fotos`} · a primeira é a capa
            {imagens.length > 1 && ' — arraste para reordenar'}
          </p>

          <div className="miniaturas">
            {imagens.map((imagem, indice) => {
              const ehCapa = indice === 0
              return (
                <div
                  key={imagem.id}
                  className={[
                    'mini',
                    ehCapa ? 'mini--capa' : '',
                    arrastando === indice ? 'mini--arrastando' : '',
                    alvo === indice && arrastando !== null && arrastando !== indice ? 'mini--alvo' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={imagens.length > 1}
                  onDragStart={() => setArrastando(indice)}
                  onDragEnd={() => {
                    setArrastando(null)
                    setAlvo(null)
                  }}
                  onDragOver={(evento) => {
                    if (arrastando === null) return
                    evento.preventDefault()
                    setAlvo(indice)
                  }}
                  onDrop={(evento) => {
                    if (arrastando === null) return
                    evento.preventDefault()
                    void reordenar(arrastando, indice)
                    setArrastando(null)
                    setAlvo(null)
                  }}
                >
                  <img className="mini__img" src={imagem.url} alt={imagem.nome_original || 'Foto do empreendimento'} />

                  {ehCapa && <span className="mini__selo">Capa</span>}

                  {confirmando === imagem.id ? (
                    <div className="mini__confirma">
                      <span>Remover?</span>
                      <div className="mini__confirma-botoes">
                        <button type="button" className="btn btn--perigo btn--pequeno" onClick={() => void remover(imagem)}>
                          Remover
                        </button>
                        <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setConfirmando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mini__acoes">
                      {!ehCapa && (
                        <button
                          type="button"
                          className="mini__botao"
                          title="Usar como capa"
                          aria-label={`Usar a foto ${indice + 1} como capa`}
                          onClick={() => void reordenar(indice, 0)}
                        >
                          <Icone nome="alvo" tamanho={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="mini__botao mini__botao--perigo"
                        title="Remover foto"
                        aria-label={`Remover a foto ${indice + 1}`}
                        onClick={() => setConfirmando(imagem.id)}
                      >
                        <Icone nome="fechar" tamanho={13} />
                      </button>
                    </div>
                  )}

                  <span className="mini__rodape" title={imagem.nome_original || ''}>
                    {fmtTamanho(imagem.tamanho)}
                  </span>
                </div>
              )
            })}

            {previas.map((previa, indice) => (
              <div
                key={`${previa.arquivo.name}-${indice}`}
                className={`mini mini--pendente${primeiraPendenteEhCapa && indice === 0 ? ' mini--capa' : ''}`}
              >
                <img className="mini__img" src={previa.url} alt={previa.arquivo.name} />
                <span className="mini__selo mini__selo--pendente">
                  {primeiraPendenteEhCapa && indice === 0 ? 'Capa · ao salvar' : 'Ao salvar'}
                </span>
                <div className="mini__acoes">
                  {indice > 0 && (
                    <button
                      type="button"
                      className="mini__botao"
                      title="Usar como capa"
                      aria-label={`Usar ${previa.arquivo.name} como capa`}
                      onClick={() => promoverPendente(indice)}
                    >
                      <Icone nome="alvo" tamanho={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini__botao mini__botao--perigo"
                    title="Tirar da lista"
                    aria-label={`Tirar ${previa.arquivo.name} da lista`}
                    onClick={() => removerPendente(indice)}
                  >
                    <Icone nome="fechar" tamanho={13} />
                  </button>
                </div>
                <span className="mini__rodape" title={previa.arquivo.name}>
                  {fmtTamanho(previa.arquivo.size)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {empreendimentoId === null && pendentes.length > 0 && (
        <p className="campo__dica">
          <Icone nome="info" tamanho={12} /> As fotos sobem assim que você salvar o empreendimento.
        </p>
      )}
    </div>
  )
}

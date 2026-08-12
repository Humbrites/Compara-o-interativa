import { useMemo, useState } from 'react'
import type { Empreendimento } from '../types'
import { fmtEntrega, fmtFaixaMetragem, fmtInteiro, fmtMoeda, fmtTexto, TRACO } from '../lib/format'
import { corDoStatus, ordemDaEntrega, pesoDoStatus } from '../lib/opcoes'
import { capaDe } from '../lib/imagens'
import { usePodeEditar } from '../lib/permissao'
import { Icone } from './Icones'
import { Modal, Estado, Selo } from './ui'

type Coluna = 'nome' | 'construtora' | 'cidade' | 'valor_m2' | 'dormitorios' | 'metragem' | 'status' | 'entrega'

/** Valor usado na ordenacao de cada coluna (null vai sempre para o fim). */
function chaveDeOrdem(e: Empreendimento, coluna: Coluna): string | number | null {
  switch (coluna) {
    case 'nome':
      return e.nome.toLowerCase()
    case 'construtora':
      return e.construtora?.toLowerCase() ?? null
    case 'cidade':
      return [e.cidade, e.bairro].filter(Boolean).join(' ').toLowerCase() || null
    case 'valor_m2':
      return e.valor_m2
    case 'dormitorios':
      return e.dormitorios
    case 'metragem':
      return e.metragem_max ?? e.metragem_min
    case 'status':
      return pesoDoStatus(e.status_obra)
    case 'entrega':
      return ordemDaEntrega(e.entrega)
  }
}

interface Props {
  lista: Empreendimento[]
  selecionado: number | null
  onSelecionar: (id: number) => void
  onEditar: (e: Empreendimento) => void
  onExcluir: (e: Empreendimento) => void
  onAdicionar: () => void
  onFechar: () => void
}

export function ListaEmpreendimentos({
  lista,
  selecionado,
  onSelecionar,
  onEditar,
  onExcluir,
  onAdicionar,
  onFechar,
}: Props) {
  const podeEditar = usePodeEditar()
  const [busca, setBusca] = useState('')
  const [coluna, setColuna] = useState<Coluna>('nome')
  const [crescente, setCrescente] = useState(true)

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtrada = termo
      ? lista.filter((e) =>
          [e.nome, e.construtora, e.cidade, e.bairro, e.tipo].some((campo) =>
            (campo || '').toLowerCase().includes(termo),
          ),
        )
      : [...lista]

    return filtrada.sort((a, b) => {
      const va = chaveDeOrdem(a, coluna)
      const vb = chaveDeOrdem(b, coluna)

      // Quem nao tem o dado fica no fim, independente da direcao.
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1

      const comparacao =
        typeof va === 'string' && typeof vb === 'string'
          ? va.localeCompare(vb, 'pt-BR')
          : Number(va) - Number(vb)

      return crescente ? comparacao : -comparacao
    })
  }, [lista, busca, coluna, crescente])

  function ordenarPor(nova: Coluna) {
    if (nova === coluna) setCrescente((c) => !c)
    else {
      setColuna(nova)
      setCrescente(true)
    }
  }

  function Cabecalho({ id, rotulo, alinhar }: { id: Coluna; rotulo: string; alinhar?: 'direita' }) {
    const ativa = coluna === id
    return (
      <th className={alinhar === 'direita' ? 'tabela-lista__num' : undefined}>
        <button
          type="button"
          className={`tabela-lista__ordenar${ativa ? ' tabela-lista__ordenar--ativa' : ''}`}
          onClick={() => ordenarPor(id)}
        >
          {rotulo}
          {ativa && <Icone nome={crescente ? 'seta_cima' : 'seta_baixo'} tamanho={11} espessura={2.6} />}
        </button>
      </th>
    )
  }

  return (
    <Modal
      titulo="Empreendimentos cadastrados"
      subtitulo={`${lista.length} ${lista.length === 1 ? 'empreendimento' : 'empreendimentos'} na base`}
      largo
      onFechar={onFechar}
      rodape={
        <>
          {podeEditar && (
            <button type="button" className="btn btn--secundario" onClick={onAdicionar}>
              <Icone nome="mais" tamanho={15} />
              Adicionar empreendimento
            </button>
          )}
          <div className="direita">
            <button type="button" className="btn btn--primario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </>
      }
    >
      <div className="busca" style={{ maxWidth: '100%', marginBottom: 'var(--e4)' }}>
        <span className="busca__icone">
          <Icone nome="busca" tamanho={15} />
        </span>
        <input
          className="entrada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar esta lista por nome, construtora, cidade, bairro ou tipo…"
          autoFocus
        />
        {busca && (
          <button type="button" className="busca__limpar" onClick={() => setBusca('')} aria-label="Limpar">
            <Icone nome="fechar" tamanho={13} />
          </button>
        )}
      </div>

      {visiveis.length === 0 ? (
        <Estado
          icone={lista.length === 0 ? 'predio' : 'busca'}
          titulo={lista.length === 0 ? 'Nenhum empreendimento cadastrado' : 'Nada encontrado'}
          texto={
            lista.length === 0
              ? podeEditar
                ? 'Cadastre o primeiro empreendimento para vê-lo aqui e no mapa.'
                : 'Esta conta ainda não cadastrou nenhum empreendimento.'
              : 'Ajuste o texto da busca e tente de novo.'
          }
          acao={
            lista.length === 0 && podeEditar ? (
              <button type="button" className="btn btn--primario" onClick={onAdicionar}>
                <Icone nome="mais" tamanho={15} />
                Adicionar empreendimento
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="tabela-lista__area">
          <table className="tabela-lista">
            <thead>
              <tr>
                <Cabecalho id="nome" rotulo="Empreendimento" />
                <Cabecalho id="cidade" rotulo="Localização" />
                <Cabecalho id="status" rotulo="Status" />
                <Cabecalho id="dormitorios" rotulo="Dorm." alinhar="direita" />
                <Cabecalho id="metragem" rotulo="Metragem" alinhar="direita" />
                <Cabecalho id="valor_m2" rotulo="R$/m²" alinhar="direita" />
                <Cabecalho id="entrega" rotulo="Entrega" />
                <th>Fluxos</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((e) => (
                <tr
                  key={e.id}
                  className={e.id === selecionado ? 'tabela-lista__linha--ativa' : undefined}
                  onClick={() => onSelecionar(e.id)}
                  title="Ver no mapa"
                >
                  <td>
                    <div className="tabela-lista__emp">
                      {capaDe(e) ? (
                        <img
                          className="tabela-lista__foto"
                          src={capaDe(e) as string}
                          alt=""
                          onError={(ev) => ev.currentTarget.remove()}
                        />
                      ) : (
                        <div className="tabela-lista__foto tabela-lista__foto--vazia">
                          <Icone nome="predio" tamanho={16} />
                        </div>
                      )}
                      <div className="tabela-lista__texto">
                        <span className="tabela-lista__nome">{e.nome}</span>
                        <span className="tabela-lista__sub">{fmtTexto(e.construtora)}</span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="tabela-lista__texto">
                      <span>{fmtTexto(e.cidade)}</span>
                      <span className="tabela-lista__sub">{fmtTexto(e.bairro)}</span>
                    </div>
                    {e.latitude === null || e.longitude === null ? (
                      <span className="tabela-lista__aviso" title="Sem coordenada, não aparece no mapa">
                        <Icone nome="alerta" tamanho={11} />
                        fora do mapa
                      </span>
                    ) : null}
                  </td>

                  <td>
                    {e.status_obra ? (
                      <Selo cor={corDoStatus(e.status_obra)}>{e.status_obra}</Selo>
                    ) : (
                      <span className="tabela-lista__vazio">{TRACO}</span>
                    )}
                  </td>

                  <td className="tabela-lista__num">{fmtInteiro(e.dormitorios)}</td>
                  <td className="tabela-lista__num">{fmtFaixaMetragem(e.metragem_min, e.metragem_max)}</td>
                  <td className="tabela-lista__num tabela-lista__valor">{fmtMoeda(e.valor_m2)}</td>
                  <td>{fmtEntrega(e.entrega)}</td>

                  <td>
                    {/* Os fluxos moram nas unidades; os do empreendimento sao
                        sobra do formato antigo e entram na mesma conta. */}
                    {(() => {
                      const total = e.fluxos.length + e.unidades.reduce((soma, u) => soma + u.fluxos.length, 0)
                      return total > 0 ? (
                        <span className="selo selo--cinza">
                          {total} {total === 1 ? 'fluxo' : 'fluxos'}
                        </span>
                      ) : (
                        <span className="tabela-lista__vazio">nenhum</span>
                      )
                    })()}
                  </td>

                  <td>
                    {/* stopPropagation: o clique na linha leva ao mapa. */}
                    <div className="tabela-lista__acoes" onClick={(ev) => ev.stopPropagation()}>
                      {podeEditar && (
                        <>
                          <button
                            type="button"
                            className="btn btn--fantasma btn--icone"
                            onClick={() => onEditar(e)}
                            title="Editar"
                          >
                            <Icone nome="lapis" tamanho={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn--perigo btn--icone"
                            onClick={() => onExcluir(e)}
                            title="Excluir"
                          >
                            <Icone nome="lixeira" tamanho={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visiveis.length > 0 && (
        <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
          <Icone nome="info" tamanho={12} /> Clique em uma linha para ver o empreendimento no mapa. Clique nos
          títulos das colunas para ordenar.
        </p>
      )}
    </Modal>
  )
}

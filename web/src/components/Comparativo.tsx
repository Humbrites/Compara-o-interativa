import { useMemo, useState } from 'react'
import type { Empreendimento } from '../types'
import { compararEmpreendimentos, compararFluxos, textosDoFluxo, type LinhaComparativo } from '../lib/comparar'
import { fmtMoeda, fmtTexto } from '../lib/format'
import { capaDe } from '../lib/imagens'
import { Icone } from './Icones'
import { Modal, Estado } from './ui'

/* ------------------------------------------------------------------ */
/* Tabela de indicadores                                               */
/* ------------------------------------------------------------------ */

function Celula({ linha, lado }: { linha: LinhaComparativo; lado: 'a' | 'b' }) {
  const texto = lado === 'a' ? linha.textoA : linha.textoB
  const vence = linha.vencedor === lado
  const vazio = texto === '—'

  const classes = ['tabela-comp__valor']
  if (vence) classes.push('tabela-comp__valor--vence')
  else if (vazio) classes.push('tabela-comp__valor--vazio')

  return (
    <td className={classes.join(' ')} title={vence ? linha.criterio : undefined}>
      {vence ? (
        <span className="vence-marca">
          <Icone nome="check" tamanho={14} espessura={2.6} />
          {texto}
        </span>
      ) : (
        texto
      )}
      {linha.vencedor === 'empate' && lado === 'b' && (
        <span className="tabela-comp__empate">
          <Icone nome="igual" tamanho={11} />
          empate
        </span>
      )}
    </td>
  )
}

function TabelaComparativa({
  legenda,
  linhas,
  nomeA,
  nomeB,
}: {
  legenda: string
  linhas: LinhaComparativo[]
  nomeA: string
  nomeB: string
}) {
  return (
    <>
      {/* O titulo fica FORA da tabela: como <caption> ele era cortado pela
          borda arredondada com overflow hidden. */}
      <h3 className="tabela-comp__legenda">{legenda}</h3>
      <table className="tabela-comp">
        <thead>
          <tr>
            <th className="tabela-comp__indicador">Indicador</th>
            <th>{nomeA}</th>
            <th>{nomeB}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.chave}>
              <th scope="row" className="tabela-comp__indicador" title={linha.criterio}>
                {linha.rotulo}
              </th>
              <Celula linha={linha} lado="a" />
              <Celula linha={linha} lado="b" />
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Cabecalho A vs B                                                    */
/* ------------------------------------------------------------------ */

function LadoVersus({
  empreendimento: e,
  papel,
  vitorias,
}: {
  empreendimento: Empreendimento
  papel: 'a' | 'b'
  vitorias: number
}) {
  const local = [e.bairro, e.cidade].filter(Boolean).join(', ')

  return (
    <div className={`versus__lado versus__lado--${papel}`}>
      {capaDe(e) ? (
        <img className="versus__foto" src={capaDe(e) as string} alt="" onError={(ev) => ev.currentTarget.remove()} />
      ) : (
        <div className="versus__foto versus__foto--vazia">
          <Icone nome="predio" tamanho={22} />
        </div>
      )}
      <div className="versus__info">
        <span className="versus__etiqueta">{papel === 'a' ? 'EMPREENDIMENTO A' : 'EMPREENDIMENTO B'}</span>
        <div className="versus__nome">{e.nome}</div>
        <div className="versus__meta">
          {fmtTexto(e.construtora)}
          {local && ` · ${local}`}
        </div>
        <div className="versus__placar">
          <Icone nome="check" tamanho={13} />
          {vitorias} {vitorias === 1 ? 'indicador melhor' : 'indicadores melhores'}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Seletor do segundo empreendimento                                   */
/* ------------------------------------------------------------------ */

function SeletorLateral({
  lista,
  excluir,
  onEscolher,
}: {
  lista: Empreendimento[]
  excluir: number
  onEscolher: (id: number) => void
}) {
  const [busca, setBusca] = useState('')

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lista
      .filter((e) => e.id !== excluir)
      .filter((e) =>
        !termo ? true : [e.nome, e.construtora, e.cidade, e.bairro].some((c) => (c || '').toLowerCase().includes(termo)),
      )
  }, [lista, excluir, busca])

  if (lista.length <= 1) {
    return (
      <Estado
        icone="balanca"
        titulo="É preciso ter pelo menos dois empreendimentos"
        texto="Cadastre outro empreendimento para poder comparar lado a lado."
      />
    )
  }

  return (
    <div>
      <div className="busca" style={{ maxWidth: '100%', marginBottom: 'var(--e4)' }}>
        <span className="busca__icone">
          <Icone nome="busca" tamanho={15} />
        </span>
        <input
          className="entrada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, construtora, cidade ou bairro…"
          autoFocus
        />
      </div>

      {candidatos.length === 0 ? (
        <Estado icone="busca" titulo="Nenhum empreendimento encontrado" texto="Ajuste a busca e tente de novo." />
      ) : (
        <div className="lista-escolha">
          {candidatos.map((e) => (
            <button key={e.id} type="button" className="escolha" onClick={() => onEscolher(e.id)}>
              {capaDe(e) ? (
                <img className="escolha__foto" src={capaDe(e) as string} alt="" onError={(ev) => ev.currentTarget.remove()} />
              ) : (
                <div className="escolha__foto" style={{ display: 'grid', placeItems: 'center', color: 'var(--texto-3)' }}>
                  <Icone nome="predio" tamanho={18} />
                </div>
              )}
              <div className="escolha__info">
                <div className="escolha__nome">{e.nome}</div>
                <div className="escolha__meta">
                  {[e.construtora, e.bairro, e.cidade].filter(Boolean).join(' · ') || 'Sem localização'}
                </div>
              </div>
              {e.valor_m2 !== null && <span className="escolha__valor">{fmtMoeda(e.valor_m2)}/m²</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal principal                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  a: Empreendimento
  b: Empreendimento | null
  lista: Empreendimento[]
  onEscolherB: (id: number) => void
  onTrocarLados: () => void
  onFechar: () => void
}

export function Comparativo({ a, b, lista, onEscolherB, onTrocarLados, onFechar }: Props) {
  // Qual fluxo de cada lado entra na tabela comparativa.
  const [fluxoA, setFluxoA] = useState(0)
  const [fluxoB, setFluxoB] = useState(0)

  const linhasGerais = useMemo(() => (b ? compararEmpreendimentos(a, b) : []), [a, b])
  const linhasFluxo = useMemo(() => {
    if (!b) return []
    return compararFluxos(a.fluxos[fluxoA] ?? null, b.fluxos[fluxoB] ?? null)
  }, [a, b, fluxoA, fluxoB])

  const placar = useMemo(() => {
    const todas = [...linhasGerais, ...linhasFluxo]
    return {
      a: todas.filter((l) => l.vencedor === 'a').length,
      b: todas.filter((l) => l.vencedor === 'b').length,
    }
  }, [linhasGerais, linhasFluxo])

  if (!b) {
    return (
      <Modal
        titulo="Comparar empreendimentos"
        subtitulo={`Escolha o segundo empreendimento para comparar com ${a.nome}`}
        onFechar={onFechar}
      >
        <SeletorLateral lista={lista} excluir={a.id} onEscolher={onEscolherB} />
      </Modal>
    )
  }

  const textosA = textosDoFluxo(a.fluxos[fluxoA] ?? null)
  const textosB = textosDoFluxo(b.fluxos[fluxoB] ?? null)
  const temTextoLivre = textosA.descricao || textosB.descricao || textosA.observacoes || textosB.observacoes

  return (
    <Modal
      titulo="Comparativo"
      subtitulo="O melhor indicador de cada linha aparece destacado em verde."
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={onTrocarLados}>
            <Icone nome="seta_direita" tamanho={15} />
            Inverter A e B
          </button>
          <div className="direita">
            <button type="button" className="btn btn--primario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </>
      }
    >
      <div className="versus">
        <LadoVersus empreendimento={a} papel="a" vitorias={placar.a} />
        <div className="versus__x">VS</div>
        <LadoVersus empreendimento={b} papel="b" vitorias={placar.b} />
      </div>

      <div className="bloco-comp">
        <TabelaComparativa
          legenda="Características do empreendimento"
          linhas={linhasGerais}
          nomeA={a.nome}
          nomeB={b.nome}
        />
      </div>

      <div className="bloco-comp">
        <div className="seletor-fluxo">
          <span className="seletor-fluxo__rotulo">Fluxo de {a.nome}:</span>
          <select
            className="entrada filtros__select"
            value={fluxoA}
            onChange={(e) => setFluxoA(Number(e.target.value))}
            disabled={a.fluxos.length === 0}
          >
            {a.fluxos.length === 0 ? (
              <option>Sem fluxo cadastrado</option>
            ) : (
              a.fluxos.map((fluxo, indice) => (
                <option key={fluxo.id} value={indice}>
                  {fluxo.nome?.trim() || `Fluxo ${indice + 1}`}
                </option>
              ))
            )}
          </select>

          <span className="seletor-fluxo__rotulo">Fluxo de {b.nome}:</span>
          <select
            className="entrada filtros__select"
            value={fluxoB}
            onChange={(e) => setFluxoB(Number(e.target.value))}
            disabled={b.fluxos.length === 0}
          >
            {b.fluxos.length === 0 ? (
              <option>Sem fluxo cadastrado</option>
            ) : (
              b.fluxos.map((fluxo, indice) => (
                <option key={fluxo.id} value={indice}>
                  {fluxo.nome?.trim() || `Fluxo ${indice + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        <TabelaComparativa legenda="Fluxo de pagamento" linhas={linhasFluxo} nomeA={a.nome} nomeB={b.nome} />

        {temTextoLivre && (
          <div className="texto-livre">
            <div className="texto-livre__cartao">
              <div className="texto-livre__titulo">{a.nome}</div>
              {textosA.descricao || <span style={{ color: 'var(--texto-3)' }}>Sem descrição livre</span>}
              {textosA.observacoes && (
                <div style={{ marginTop: 'var(--e2)', color: 'var(--texto-3)' }}>{textosA.observacoes}</div>
              )}
            </div>
            <div className="texto-livre__cartao">
              <div className="texto-livre__titulo">{b.nome}</div>
              {textosB.descricao || <span style={{ color: 'var(--texto-3)' }}>Sem descrição livre</span>}
              {textosB.observacoes && (
                <div style={{ marginTop: 'var(--e2)', color: 'var(--texto-3)' }}>{textosB.observacoes}</div>
              )}
            </div>
          </div>
        )}

        {(a.fluxos.length === 0 || b.fluxos.length === 0) && (
          <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
            <Icone nome="info" tamanho={12} />{' '}
            {a.fluxos.length === 0 && b.fluxos.length === 0
              ? 'Nenhum dos dois tem fluxo de pagamento cadastrado.'
              : `${a.fluxos.length === 0 ? a.nome : b.nome} ainda não tem fluxo de pagamento cadastrado.`}
          </p>
        )}
      </div>
    </Modal>
  )
}

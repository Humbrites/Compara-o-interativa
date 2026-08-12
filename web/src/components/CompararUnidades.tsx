import { useMemo, useState } from 'react'

import { analisarUnidade, textoDoParcelamento } from '../lib/analise'
import { fmtArea, fmtInteiro, fmtMoeda, TRACO } from '../lib/format'
import { fmtPercentual } from '../lib/cub'
import { rotuloUnidade } from '../lib/unidades'
import type { Empreendimento, Unidade } from '../types'
import { Icone } from './Icones'
import { Estado, Modal } from './ui'

/**
 * Nivel 3 da analise: "qual oportunidade e melhor?".
 *
 * O comparativo A × B compara EMPREENDIMENTOS; aqui a pergunta e outra —
 * escolhidas tres ou quatro unidades (do mesmo predio ou de predios
 * diferentes), qual delas vale mais a pena? Cada linha destaca o melhor.
 */

/** Quatro colunas cabem na tela; a quinta viraria rolagem horizontal. */
const MAXIMO = 4

interface Props {
  /** Todos os empreendimentos, para escolher unidades de qualquer um deles. */
  lista: Empreendimento[]
  /** Empreendimento de onde a tela abriu — as unidades dele vem marcadas. */
  empreendimentoInicial: Empreendimento
  onFechar: () => void
}

interface Escolhida {
  unidade: Unidade
  empreendimento: Empreendimento
}

/** Como comparar cada linha: maior vence, menor vence, ou nao ha vencedor. */
type Direcao = 'maior' | 'menor' | 'nenhuma'

interface Linha {
  rotulo: string
  direcao: Direcao
  /** O numero que decide o vencedor (null = fora da disputa). */
  valor: (item: Escolhida) => number | null
  /** O que aparece na celula. */
  texto: (item: Escolhida) => string
  detalhe?: (item: Escolhida) => string | null
}

export function CompararUnidades({ lista, empreendimentoInicial, onFechar }: Props) {
  /**
   * Abre com DUAS unidades marcadas, não com as quatro.
   *
   * Preenchendo o limite todo com o prédio de origem, os chips dos outros
   * empreendimentos nasciam desabilitados — e a tela passava a impressão de
   * que só dava para comparar dentro do mesmo prédio, que é o oposto do que
   * ela faz.
   */
  const [escolhidas, setEscolhidas] = useState<number[]>(() =>
    empreendimentoInicial.unidades.slice(0, 2).map((u) => u.id),
  )
  const [busca, setBusca] = useState('')

  /** Todas as unidades da base, com o empreendimento de cada uma. */
  const disponiveis = useMemo(() => {
    const todas: Escolhida[] = []
    for (const empreendimento of lista) {
      for (const unidade of empreendimento.unidades) todas.push({ unidade, empreendimento })
    }
    return todas
  }, [lista])

  /** Os empreendimentos com unidades, já filtrados pela busca. */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lista
      .filter((e) => e.unidades.length > 0)
      .map((e) => {
        if (!termo) return e
        // O termo casa com o nome do empreendimento OU com o da unidade: quem
        // procura "cobertura" quer as coberturas de todos os prédios.
        if (e.nome.toLowerCase().includes(termo)) return e
        const unidades = e.unidades.filter((u) =>
          [u.identificacao, u.numero, u.tipologia, u.torre].some((campo) =>
            (campo || '').toLowerCase().includes(termo),
          ),
        )
        return { ...e, unidades }
      })
      .filter((e) => e.unidades.length > 0)
  }, [lista, busca])

  const selecionadas = useMemo(
    () =>
      escolhidas
        .map((id) => disponiveis.find((item) => item.unidade.id === id))
        .filter((item): item is Escolhida => item !== undefined),
    [escolhidas, disponiveis],
  )

  /** A análise de cada coluna — a mesma conta das outras telas. */
  const analises = useMemo(
    () =>
      selecionadas.map((item) => ({
        ...item,
        analise: analisarUnidade(item.unidade, item.empreendimento.unidades),
      })),
    [selecionadas],
  )

  function alternar(id: number) {
    setEscolhidas((atual) => {
      if (atual.includes(id)) return atual.filter((outro) => outro !== id)
      if (atual.length >= MAXIMO) return atual
      return [...atual, id]
    })
  }

  const linhas: Linha[] = [
    {
      rotulo: 'Valor',
      direcao: 'menor',
      valor: (i) => analiseDe(i)?.valor ?? null,
      texto: (i) => moeda(analiseDe(i)?.valor),
    },
    {
      rotulo: 'Valor por m²',
      direcao: 'menor',
      valor: (i) => analiseDe(i)?.valorM2 ?? null,
      texto: (i) => moeda(analiseDe(i)?.valorM2),
      detalhe: (i) => {
        const a = analiseDe(i)
        if (!a || a.diferencaParaMedia === null) return null
        return a.diferencaParaMedia < 0
          ? `${fmtPercentual(Math.abs(a.diferencaParaMedia), 1)} abaixo da média do prédio`
          : `${fmtPercentual(a.diferencaParaMedia, 1)} acima da média do prédio`
      },
    },
    {
      rotulo: 'Metragem',
      direcao: 'maior',
      valor: (i) => i.unidade.metragem ?? i.unidade.metragem_total,
      texto: (i) => fmtArea(i.unidade.metragem ?? i.unidade.metragem_total),
    },
    {
      rotulo: 'Dormitórios',
      direcao: 'maior',
      valor: (i) => i.unidade.dormitorios,
      texto: (i) => fmtInteiro(i.unidade.dormitorios),
    },
    {
      rotulo: 'Vagas',
      direcao: 'maior',
      valor: (i) => i.unidade.vagas,
      texto: (i) => fmtInteiro(i.unidade.vagas),
    },
    {
      rotulo: 'Entrada',
      direcao: 'menor',
      valor: (i) => analiseDe(i)?.entrada ?? null,
      texto: (i) => moeda(analiseDe(i)?.entrada),
      detalhe: (i) => porcento(analiseDe(i)?.pctEntrada, 'do valor'),
    },
    {
      rotulo: 'Durante a obra',
      direcao: 'menor',
      valor: (i) => analiseDe(i)?.durante ?? null,
      texto: (i) => moeda(analiseDe(i)?.durante),
      detalhe: (i) => {
        const a = analiseDe(i)
        // O valor de CADA parcela, não só o total: é o número que o cliente
        // pergunta primeiro, e duas tabelas com o mesmo total podem ter
        // parcelas bem diferentes.
        return a ? textoDoParcelamento(a, (v) => fmtMoeda(v, true)) : null
      },
    },
    {
      rotulo: 'Capital até a entrega',
      direcao: 'menor',
      valor: (i) => analiseDe(i)?.ateAEntrega ?? null,
      texto: (i) => moeda(analiseDe(i)?.ateAEntrega),
      detalhe: (i) => porcento(analiseDe(i)?.pctAteAEntrega, 'do valor'),
    },
    {
      rotulo: 'Saldo na entrega',
      direcao: 'nenhuma',
      valor: () => null,
      texto: (i) => moeda(analiseDe(i)?.saldo),
      detalhe: (i) => porcento(analiseDe(i)?.pctFinanciavel, 'financiável'),
    },
  ]

  function analiseDe(item: Escolhida) {
    return analises.find((a) => a.unidade.id === item.unidade.id)?.analise ?? null
  }

  function moeda(valor: number | null | undefined) {
    return valor === null || valor === undefined ? TRACO : fmtMoeda(valor)
  }

  function porcento(valor: number | null | undefined, sufixo: string) {
    return valor === null || valor === undefined ? null : `${fmtPercentual(valor, 1)} ${sufixo}`
  }

  /** Quem vence a linha — só quando há mais de um número para comparar. */
  function vencedores(linha: Linha): Set<number> {
    if (linha.direcao === 'nenhuma') return new Set()
    const valores = analises
      .map((item) => ({ id: item.unidade.id, valor: linha.valor(item) }))
      .filter((v): v is { id: number; valor: number } => v.valor !== null)

    if (valores.length < 2) return new Set()

    const melhor =
      linha.direcao === 'maior'
        ? Math.max(...valores.map((v) => v.valor))
        : Math.min(...valores.map((v) => v.valor))

    // Empate destaca os dois: fingir um vencedor seria inventar diferença.
    return new Set(valores.filter((v) => v.valor === melhor).map((v) => v.id))
  }

  return (
    <Modal
      titulo="Comparar unidades"
      subtitulo={`Qual oportunidade é melhor — até ${MAXIMO} unidades lado a lado, de qualquer empreendimento`}
      largo
      onFechar={onFechar}
      rodape={
        <div className="direita">
          <button type="button" className="btn btn--primario" onClick={onFechar}>
            Fechar
          </button>
        </div>
      }
    >
      <section className="form-secao form-secao--dados">
        <h3 className="form-secao__titulo">
          <Icone nome="predio" tamanho={13} />
          Escolha as unidades
          <span className="form-secao__opcional">
            — {escolhidas.length} de {MAXIMO}
          </span>
        </h3>

        {disponiveis.length === 0 ? (
          <Estado
            icone="predio"
            titulo="Nenhuma unidade cadastrada"
            texto="Cadastre as unidades dos empreendimentos para poder compará-las."
          />
        ) : (
          <div className="comparar-escolha">
            <p className="instrucao-do-grupo">
              Marque as unidades que quer comparar — elas podem ser de <strong>empreendimentos
              diferentes</strong>.
            </p>

            {/* Com muitas unidades na base, achar a certa vira o trabalho. */}
            {disponiveis.length > 10 && (
              <div className="busca">
                <span className="busca__icone">
                  <Icone nome="busca" tamanho={15} />
                </span>
                <input
                  className="entrada"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar por unidade ou empreendimento…"
                />
                {busca && (
                  <button type="button" className="busca__limpar" onClick={() => setBusca('')} aria-label="Limpar">
                    <Icone nome="fechar" tamanho={13} />
                  </button>
                )}
              </div>
            )}

            {visiveis.length === 0 && (
              <p className="campo__dica">Nenhuma unidade encontrada para "{busca}".</p>
            )}

            {visiveis.map((empreendimento) => (
                <div key={empreendimento.id} className="comparar-grupo">
                  <span className="comparar-grupo__nome">{empreendimento.nome}</span>
                  <div className="comparar-grupo__chips">
                    {empreendimento.unidades.map((unidade, indice) => {
                      const marcada = escolhidas.includes(unidade.id)
                      const cheio = !marcada && escolhidas.length >= MAXIMO
                      return (
                        <button
                          key={unidade.id}
                          type="button"
                          className={`chip${marcada ? ' chip--ativo' : ''}`}
                          onClick={() => alternar(unidade.id)}
                          disabled={cheio}
                          title={
                            cheio
                              ? `Já são ${MAXIMO} unidades — desmarque uma para colocar esta no lugar`
                              : `Comparar ${rotuloUnidade(unidade, indice)} de ${empreendimento.nome}`
                          }
                        >
                          <Icone nome={marcada ? 'check' : 'mais'} tamanho={12} />
                          {rotuloUnidade(unidade, indice)}
                        </button>
                      )
                    })}
                  </div>
                </div>
            ))}
          </div>
        )}
      </section>

      {analises.length === 0 ? (
        <Estado
          icone="balanca"
          titulo="Escolha ao menos uma unidade"
          texto="Marque as unidades acima para ver os números lado a lado."
        />
      ) : (
        <section className="form-secao form-secao--resultado">
          <h3 className="form-secao__titulo">
            <Icone nome="balanca" tamanho={13} />
            Lado a lado
            <span className="form-secao__complemento">— o melhor de cada linha em destaque</span>
          </h3>

          <div className="comparar-area">
            <table className="comparar">
              <thead>
                <tr>
                  <th />
                  {analises.map((item, indice) => (
                    <th key={item.unidade.id}>
                      <div className="comparar__coluna">
                        <span className="comparar__unidade">{rotuloUnidade(item.unidade, indice)}</span>
                        <span className="comparar__empreendimento">{item.empreendimento.nome}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {linhas.map((linha) => {
                  const ganhadores = vencedores(linha)
                  return (
                    <tr key={linha.rotulo}>
                      <th scope="row">{linha.rotulo}</th>
                      {analises.map((item) => {
                        const venceu = ganhadores.has(item.unidade.id)
                        const detalhe = linha.detalhe?.(item) ?? null
                        return (
                          <td key={item.unidade.id} className={venceu ? 'comparar__vence' : undefined}>
                            <span className="comparar__valor">
                              {venceu && <Icone nome="check" tamanho={12} />}
                              {linha.texto(item)}
                            </span>
                            {detalhe && <span className="comparar__detalhe">{detalhe}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="campo__dica linha-calculo">
            <Icone nome="info" tamanho={12} /> O destaque marca o melhor de cada linha — <strong>menor</strong> para
            preço, entrada e capital; <strong>maior</strong> para metragem, dormitórios e vagas. O saldo na entrega não
            entra na disputa: mais saldo é pior para quem tem capital e melhor para quem depende de financiamento.
          </p>
        </section>
      )}
    </Modal>
  )
}

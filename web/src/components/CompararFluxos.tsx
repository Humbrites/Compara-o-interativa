import { useMemo, useState } from 'react'

import { exportarPdfFluxos, type LinhaDeFluxos } from '../lib/exportarComparativo'
import {
  compararFluxosDetalhado,
  ladosPadraoDaComparacao,
  nomeDoFluxo,
  ROTULO_TIPO_FLUXO,
} from '../lib/fluxos'
import { fmtMoeda, TRACO } from '../lib/format'
import type { FluxoPagamento } from '../types'
import { Icone } from './Icones'
import { Campo, Modal } from './ui'

/**
 * As duas tabelas de venda da MESMA unidade, bloco a bloco.
 *
 * A pergunta do atendimento é "o que muda se o cliente aceitar a minha
 * proposta em vez da tabela da construtora?" — e a resposta é a coluna da
 * DIFERENÇA. Ninguém vence aqui: entrada maior é pior para quem tem pouco
 * caixa e melhor para quem quer parcela baixa, então eleger um vencedor seria
 * opinar sobre o bolso de quem compra.
 */

interface Props {
  /** Os fluxos da unidade — a tela só abre com dois ou mais. */
  fluxos: FluxoPagamento[]
  /** Preço da unidade: entra nas contas quando a tabela não tem valor próprio. */
  valorDaUnidade?: number | null
  /** Nome da unidade, para o cabeçalho e o arquivo exportado. */
  titulo?: string
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  onFechar: () => void
}

export function CompararFluxos({ fluxos, valorDaUnidade = null, titulo = 'Unidade', avisar, onFechar }: Props) {
  const padrao = useMemo(() => ladosPadraoDaComparacao(fluxos), [fluxos])
  const [idA, setIdA] = useState<number | null>(padrao?.a ?? null)
  const [idB, setIdB] = useState<number | null>(padrao?.b ?? null)

  const fluxoA = fluxos.find((f) => f.id === idA) ?? null
  const fluxoB = fluxos.find((f) => f.id === idB) ?? null

  const comparacao = useMemo(
    () => (fluxoA && fluxoB ? compararFluxosDetalhado(fluxoA, fluxoB, valorDaUnidade) : null),
    [fluxoA, fluxoB, valorDaUnidade],
  )

  /** O nome da tabela como ela aparece na unidade — o tipo vai na linha de baixo. */
  function rotuloDoLado(fluxo: FluxoPagamento | null): string {
    if (!fluxo) return TRACO
    const indice = fluxos.findIndex((f) => f.id === fluxo.id)
    return nomeDoFluxo(fluxo, indice)
  }

  function tipoDoLado(fluxo: FluxoPagamento | null): string | null {
    return fluxo?.tipo ? ROTULO_TIPO_FLUXO[fluxo.tipo] : null
  }

  const seletor = (valor: number | null, aoTrocar: (id: number) => void, rotulo: string, dica: string) => (
    <Campo rotulo={rotulo} dica={dica}>
      <select className="entrada" value={valor ?? ''} onChange={(evento) => aoTrocar(Number(evento.target.value))}>
        {fluxos.map((fluxo, indice) => (
          <option key={fluxo.id} value={fluxo.id}>
            {nomeDoFluxo(fluxo, indice)}
            {fluxo.tipo ? ` — ${ROTULO_TIPO_FLUXO[fluxo.tipo]}` : ''}
          </option>
        ))}
      </select>
    </Campo>
  )

  /** O papel recebe as MESMAS linhas da tela, já formatadas. */
  function aoExportarPdf() {
    if (!comparacao) return

    const linhas: LinhaDeFluxos[] = comparacao.linhas.map((linha) => ({
      rotulo: linha.rotulo,
      textoA: linha.textoA,
      textoB: linha.textoB,
      textoDiferenca: linha.textoDiferenca,
      detalheA: linha.detalheA,
      detalheB: linha.detalheB,
      diferenca: linha.diferenca,
    }))

    const abriu = exportarPdfFluxos({
      titulo,
      nomeA: rotuloDoLado(fluxoA),
      nomeB: rotuloDoLado(fluxoB),
      linhas,
    })
    if (!abriu) avisar('O navegador bloqueou a janela de impressão — libere os pop-ups do site', 'erro')
  }

  // Duas tabelas montadas sobre valores de imóvel diferentes comparam preços
  // diferentes: a diferença continua certa, mas quem lê precisa saber disso.
  const basesDivergem =
    comparacao !== null &&
    comparacao.baseA !== null &&
    comparacao.baseB !== null &&
    Math.abs(comparacao.baseA - comparacao.baseB) > 1

  return (
    <Modal
      titulo="Comparar fluxos"
      subtitulo={`O que muda de uma tabela para a outra · ${titulo}`}
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button
            type="button"
            className="btn btn--secundario"
            onClick={aoExportarPdf}
            disabled={comparacao === null}
            title="Abre a folha de impressão para salvar em PDF"
          >
            <Icone nome="lista" tamanho={15} />
            Exportar PDF
          </button>
          <div className="direita">
            <button type="button" className="btn btn--primario" onClick={onFechar}>
              Fechar
            </button>
          </div>
        </>
      }
    >
      <section className="form-secao form-secao--dados">
        <h3 className="form-secao__titulo">
          <Icone nome="cartao" tamanho={13} />
          Escolha as tabelas
        </h3>

        <div className="grade">
          {seletor(idA, setIdA, 'Lado A', 'a tabela de referência')}
          {seletor(idB, setIdB, 'Lado B', 'a que se compara com ela')}
        </div>
      </section>

      {comparacao === null ? (
        <div className="observacao">
          Esta unidade precisa de <strong>duas tabelas</strong> cadastradas para a comparação.
        </div>
      ) : (
        <section className="form-secao form-secao--resultado">
          <h3 className="form-secao__titulo">
            <Icone nome="balanca" tamanho={13} />
            Bloco a bloco
            <span className="form-secao__complemento">— a diferença é o lado B menos o lado A</span>
          </h3>

          {basesDivergem && (
            <p className="campo__dica linha-calculo linha-calculo--alerta">
              <Icone nome="alerta" tamanho={12} />
              As tabelas partem de valores de imóvel diferentes ({fmtMoeda(comparacao.baseA)} e{' '}
              {fmtMoeda(comparacao.baseB)}) — a diferença de cada bloco continua valendo, mas o negócio comparado não
              é o mesmo.
            </p>
          )}

          <div className="comparar-area">
            <table className="comparar">
              <thead>
                <tr>
                  <th />
                  <th>
                    <div className="comparar__coluna">
                      <span className="comparar__unidade">{rotuloDoLado(fluxoA)}</span>
                      <span className="comparar__empreendimento">{tipoDoLado(fluxoA) ?? 'sem tipo'}</span>
                    </div>
                  </th>
                  <th>
                    <div className="comparar__coluna">
                      <span className="comparar__unidade">{rotuloDoLado(fluxoB)}</span>
                      <span className="comparar__empreendimento">{tipoDoLado(fluxoB) ?? 'sem tipo'}</span>
                    </div>
                  </th>
                  <th>
                    <div className="comparar__coluna">
                      <span className="comparar__unidade">Diferença</span>
                      <span className="comparar__empreendimento">B − A</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparacao.linhas.map((linha) => (
                  <tr key={linha.chave}>
                    <th scope="row">{linha.rotulo}</th>
                    <td>
                      <span className="comparar__valor">{linha.textoA}</span>
                      {linha.detalheA && <span className="comparar__detalhe">{linha.detalheA}</span>}
                    </td>
                    <td>
                      <span className="comparar__valor">{linha.textoB}</span>
                      {linha.detalheB && <span className="comparar__detalhe">{linha.detalheB}</span>}
                    </td>
                    <td>
                      <span
                        className={`comparar__valor${
                          linha.diferenca === null || Math.abs(linha.diferenca) < 0.005
                            ? ''
                            : linha.diferenca > 0
                              ? ' comparar__diferenca--acima'
                              : ' comparar__diferenca--abaixo'
                        }`}
                      >
                        {linha.textoDiferenca}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
            <Icone nome="info" tamanho={12} />
            O pós-chaves fica fora do total durante a obra — ele é parcelado depois da entrega. Linha com um lado em
            branco não tem diferença: campo vazio é informação que falta, não zero.
          </p>
        </section>
      )}
    </Modal>
  )
}

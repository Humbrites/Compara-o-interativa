import { useMemo } from 'react'
import type { FluxoPagamento } from '../types'
import { fmtMoeda, fmtPct, TRACO } from '../lib/format'
import { fmtPercentual } from '../lib/cub'
import { detalharFluxo, nomeDoFluxo, ROTULO_TIPO_FLUXO, type ParteDoFluxo } from '../lib/fluxos'
import { exportarCsv, exportarPdf } from '../lib/exportarSimulacao'
import { usePedirApresentacao } from './DadosApresentacao'
import { Icone, type NomeIcone } from './Icones'
import { GraficoLinha } from './GraficoSvg'
import { Modal } from './ui'

/**
 * As condições de uma tabela de venda, calculadas.
 *
 * O cartão do fluxo mostra o que foi cadastrado ("20%", "36x", "3 reforços");
 * aqui aparece quanto é cada parte em reais, quanto sai do bolso até a
 * entrega e o que sobra para o financiamento. Quando a tabela veio da
 * calculadora do CUB, entra também a evolução das parcelas mês a mês.
 */

const ICONES: Record<ParteDoFluxo['chave'], NomeIcone> = {
  entrada: 'cartao',
  parcelas: 'calendario',
  reforcos: 'seta_cima',
  chaves: 'chave',
  financiamento: 'banco',
  pos_parcelas: 'calendario',
  pos_reforcos: 'seta_cima',
}

function Linha({ parte }: { parte: ParteDoFluxo }) {
  const vazio = parte.valor === null
  return (
    <div className={`parte${vazio ? ' parte--vazia' : ''}`}>
      <span className="parte__rotulo">
        <Icone nome={ICONES[parte.chave]} tamanho={13} />
        {parte.rotulo}
      </span>
      <span className="parte__valor">{parte.valor === null ? TRACO : fmtMoeda(parte.valor)}</span>
      <span className="parte__percentual">{parte.percentual === null ? '' : fmtPct(parte.percentual)}</span>
      <span className="parte__detalhe">{parte.detalhe ?? ''}</span>
    </div>
  )
}

interface Props {
  fluxo: FluxoPagamento
  indice: number
  /** Preço da unidade — entra quando a tabela não guardou o valor do imóvel. */
  valorDaUnidade?: number | null
  /** Nome do imóvel/unidade, para o cabeçalho e os arquivos exportados. */
  titulo?: string
  /** Abre uma PROPOSTA copiada desta tabela (escrita — some no modo leitura). */
  onPersonalizar?: () => void
  onFechar: () => void
}

export function DetalheFluxo({
  fluxo,
  indice,
  valorDaUnidade = null,
  titulo = 'Fluxo',
  onPersonalizar,
  onFechar,
}: Props) {
  const { pedir, modal } = usePedirApresentacao()
  const detalhe = useMemo(() => detalharFluxo(fluxo, valorDaUnidade), [fluxo, valorDaUnidade])
  const nome = nomeDoFluxo(fluxo, indice)
  const { base, partes, durante, posChaves, alocado, diferenca, simulacao } = detalhe

  // Barra de composição: só as partes com valor entram, na proporção do total.
  const comValor = partes.filter((p) => (p.valor ?? 0) > 0)
  const totalDaBarra = comValor.reduce((soma, p) => soma + (p.valor as number), 0)

  const pontosDaParcela = useMemo(
    () =>
      (simulacao?.linhas ?? []).map((linha) => ({
        rotulo: `Mês ${linha.mes}`,
        valor: linha.parcelaAtual,
        detalhe: `${fmtPercentual(linha.percentual)} de reajuste`,
      })),
    [simulacao],
  )

  const nomeDoArquivo = `${titulo} — ${nome}`

  return (
    <Modal
      titulo={nome}
      // O tipo entra no subtítulo quando existir: a mesma unidade passa a ter
      // duas tabelas parecidas, e o nome sozinho não diz qual é qual.
      subtitulo={[fluxo.tipo ? ROTULO_TIPO_FLUXO[fluxo.tipo] : null, 'Condições calculadas', titulo]
        .filter(Boolean)
        .join(' · ')}
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={onFechar}>
            Fechar
          </button>
          {/* A proposta sai daqui porque é olhando as contas desta tabela que o
              corretor decide o que vai mudar para o cliente. */}
          {onPersonalizar && (
            <button type="button" className="btn btn--secundario" onClick={onPersonalizar}>
              <Icone nome="copiar" tamanho={15} />
              Criar fluxo personalizado
            </button>
          )}
          {simulacao && (
            <div className="direita">
              <button
                type="button"
                className="btn btn--fantasma"
                onClick={() => exportarCsv(simulacao, nomeDoArquivo)}
              >
                <Icone nome="grafico" tamanho={15} />
                Exportar Excel
              </button>
              {/* Quem assina e para quem: o cabeçalho sai igual em toda exportação. */}
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => pedir((apresentacao) => exportarPdf(simulacao, nomeDoArquivo, apresentacao))}
              >
                <Icone nome="lista" tamanho={15} />
                Exportar PDF
              </button>
            </div>
          )}
        </>
      }
    >
      <section className="form-secao">
        <h3 className="form-secao__titulo">
          <Icone nome="dinheiro" tamanho={13} />
          Composição do valor
        </h3>

        {base === null ? (
          <div className="observacao">
            Esta tabela não tem o <strong>valor total do imóvel</strong>, e sem ele não dá para transformar os
            percentuais em reais. Edite o fluxo (ou a unidade) e informe o valor — as contas aparecem aqui na hora.
          </div>
        ) : (
          <>
            <div className="preco" style={{ marginBottom: 'var(--e4)' }}>
              <div className="preco__bloco">
                <span className="preco__rotulo">Valor do imóvel</span>
                <span className="preco__valor">{fmtMoeda(base)}</span>
                <span className="preco__dica">
                  {detalhe.baseDoFluxo ? 'informado nesta tabela' : 'preço da unidade — a tabela não tem valor próprio'}
                </span>
              </div>
              <div className="preco__bloco preco__bloco--secundario">
                <span className="preco__rotulo">Até a entrega</span>
                <span className="preco__valor preco__valor--menor">{fmtMoeda(durante)}</span>
                <span className="preco__dica">
                  entrada + parcelas + reforços
                  {base > 0 && ` · ${fmtPct((durante / base) * 100)} do valor`}
                </span>
              </div>
              {/* Pós-chaves fica num bloco SEPARADO: é dinheiro que sai depois
                  da entrega, e somá-lo ao "até a entrega" faria a obra parecer
                  o dobro do que custa para quem ainda vai decidir a compra. */}
              {posChaves > 0 && (
                <div className="preco__bloco preco__bloco--secundario">
                  <span className="preco__rotulo">Depois das chaves</span>
                  <span className="preco__valor preco__valor--menor">{fmtMoeda(posChaves)}</span>
                  <span className="preco__dica">
                    mensais + semestrais pós-entrega
                    {base > 0 && ` · ${fmtPct((posChaves / base) * 100)} do valor`}
                  </span>
                </div>
              )}
            </div>

            {totalDaBarra > 0 && (
              <div className="composicao" role="presentation">
                {comValor.map((parte) => (
                  <span
                    key={parte.chave}
                    className={`composicao__fatia composicao__fatia--${parte.chave}`}
                    style={{ width: `${((parte.valor as number) / totalDaBarra) * 100}%` }}
                    title={`${parte.rotulo}: ${fmtMoeda(parte.valor)}`}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="partes">
          <div className="parte parte--cabecalho">
            <span className="parte__rotulo">Parte</span>
            <span className="parte__valor">Valor</span>
            <span className="parte__percentual">% do imóvel</span>
            <span className="parte__detalhe">Como foi cadastrado</span>
          </div>
          {partes.map((parte) => (
            <Linha key={parte.chave} parte={parte} />
          ))}
        </div>

        {base !== null && (
          <p className={`campo__dica linha-calculo${Math.abs(diferenca ?? 0) > 1 ? ' linha-calculo--alerta' : ''}`}>
            <Icone nome={Math.abs(diferenca ?? 0) > 1 ? 'alerta' : 'check'} tamanho={12} />
            {Math.abs(diferenca ?? 0) <= 1 ? (
              <>As partes somam {fmtMoeda(alocado)} — a tabela fecha o valor do imóvel.</>
            ) : (diferenca as number) > 0 ? (
              <>
                As partes somam {fmtMoeda(alocado)}: faltam <strong>{fmtMoeda(diferenca as number)}</strong> para
                fechar o valor do imóvel. Normal quando a tabela não descreve todas as etapas — só confira se não é
                campo esquecido.
              </>
            ) : (
              <>
                As partes somam {fmtMoeda(alocado)}, <strong>{fmtMoeda(Math.abs(diferenca as number))} acima</strong>{' '}
                do valor do imóvel. Confira os percentuais de chaves e financiamento.
              </>
            )}
          </p>
        )}
      </section>

      {simulacao && detalhe.cub && (
        <>
          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="grafico" tamanho={13} />
              Reajuste pelo CUB
              <span className="form-secao__complemento">
                — {fmtPercentual(detalhe.cub.percentual)} ao mês por {detalhe.cub.meses} meses
              </span>
            </h3>

            <div className="inv-cartoes">
              <Cartao rotulo="Parcela inicial" valor={fmtMoeda(simulacao.resumo.parcelaInicial, true)} icone="cartao" />
              <Cartao
                rotulo="Parcela final"
                valor={fmtMoeda(simulacao.resumo.parcelaFinal, true)}
                dica={`${fmtPercentual(simulacao.resumo.percentualAcumulado, 2)} acumulados`}
                icone="seta_cima"
              />
              <Cartao
                rotulo="Total das parcelas"
                valor={fmtMoeda(simulacao.resumo.totalPago)}
                dica={`${fmtMoeda(simulacao.resumo.totalReajuste)} são reajuste`}
                icone="dinheiro"
              />
              <Cartao
                rotulo="Entrada + parcelas"
                valor={fmtMoeda(simulacao.resumo.totalDesembolsado)}
                dica={
                  simulacao.resumo.percentualDoImovel !== null
                    ? `${fmtPercentual(simulacao.resumo.percentualDoImovel, 2)} do imóvel`
                    : undefined
                }
                icone="banco"
              />
              {simulacao.resumo.saldoAoFimDaObra !== null && (
                <Cartao
                  rotulo={simulacao.resumo.saldoAoFimDaObra >= 0 ? 'Saldo na entrega' : 'Pago além do saldo'}
                  valor={fmtMoeda(Math.abs(simulacao.resumo.saldoAoFimDaObra))}
                  dica={
                    simulacao.resumo.saldoAoFimDaObra >= 0
                      ? 'o que vai para o financiamento'
                      : 'as parcelas passaram do saldo'
                  }
                  icone="chave"
                />
              )}
              <Cartao
                rotulo="Sem reajuste seria"
                valor={fmtMoeda(simulacao.resumo.totalSemReajuste)}
                dica="mantendo a parcela inicial"
                icone="igual"
              />
            </div>

            <GraficoLinha
              titulo="Parcela ao longo da obra"
              descricao={`de ${fmtMoeda(simulacao.resumo.parcelaInicial, true)} a ${fmtMoeda(
                simulacao.resumo.parcelaFinal,
                true,
              )}`}
              pontos={pontosDaParcela}
              formatar={(v) => fmtMoeda(v, true)}
            />
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="lista" tamanho={13} />
              Mês a mês
            </h3>

            <div className="tabela-cub__area">
              <table className="tabela-cub">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Parcela antes</th>
                    <th>% CUB</th>
                    <th>Reajuste</th>
                    <th>Parcela atual</th>
                    <th>Acumulado pago</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.linhas.map((linha) => (
                    <tr key={linha.mes}>
                      <td>{linha.mes}</td>
                      <td>{fmtMoeda(linha.parcelaAntes, true)}</td>
                      <td>{fmtPercentual(linha.percentual)}</td>
                      <td className="tabela-cub__reajuste">{fmtMoeda(linha.reajuste, true)}</td>
                      <td className="tabela-cub__forte">{fmtMoeda(linha.parcelaAtual, true)}</td>
                      <td>{fmtMoeda(linha.acumuladoPago, true)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td />
                    <td className="tabela-cub__reajuste">{fmtMoeda(simulacao.resumo.totalReajuste, true)}</td>
                    <td />
                    <td className="tabela-cub__forte">{fmtMoeda(simulacao.resumo.totalPago, true)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {(fluxo.descricao?.trim() || fluxo.observacoes?.trim()) && (
        <section className="form-secao">
          <h3 className="form-secao__titulo">
            <Icone nome="lista" tamanho={13} />
            O que está escrito na tabela
          </h3>
          {fluxo.descricao?.trim() && <div className="observacao">{fluxo.descricao}</div>}
          {fluxo.observacoes?.trim() && (
            <div className="observacao" style={{ marginTop: 'var(--e2)', color: 'var(--texto-3)' }}>
              {fluxo.observacoes}
            </div>
          )}
        </section>
      )}

      {modal}
    </Modal>
  )
}

function Cartao({
  icone,
  rotulo,
  valor,
  dica,
}: {
  icone: NomeIcone
  rotulo: string
  valor: string
  dica?: string
}) {
  return (
    <div className="inv-cartao inv-cartao--neutro">
      <span className="inv-cartao__rotulo">
        <Icone nome={icone} tamanho={12} />
        {rotulo}
      </span>
      <span className="inv-cartao__valor">{valor}</span>
      {dica && <span className="inv-cartao__dica">{dica}</span>}
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { FluxoInput } from '../types'
import { indiceFixo, lerNumero, simular, fmtPercentual, MAX_MESES, type Simulacao } from '../lib/cub'
import { exportarCsv, exportarPdf } from '../lib/exportarSimulacao'
import { fmtMoeda, fmtMoedaCurta } from '../lib/format'
import { usePedirApresentacao } from './DadosApresentacao'
import { Campo, Modal } from './ui'
import { Icone } from './Icones'
import { GraficoBarras, GraficoLinha } from './GraficoSvg'

/** Percentuais que aparecem no dia a dia — atalho para não digitar. */
const ATALHOS_CUB = [0.35, 0.6, 0.7, 0.75, 1]

interface Formulario {
  valorImovel: string
  entrada: string
  parcelaInicial: string
  meses: string
  percentual: string
}

const VAZIO: Formulario = { valorImovel: '', entrada: '', parcelaInicial: '', meses: '', percentual: '' }

function validar(form: Formulario): { erros: Record<string, string>; entrada: ReturnType<typeof montar> | null } {
  const erros: Record<string, string> = {}

  const parcela = lerNumero(form.parcelaInicial)
  if (parcela === null || parcela <= 0) erros.parcelaInicial = 'Informe a parcela inicial'

  const meses = lerNumero(form.meses)
  if (meses === null || meses < 1) erros.meses = 'Informe quantos meses faltam de obra'
  else if (meses > MAX_MESES) erros.meses = `No máximo ${MAX_MESES} meses`

  const percentual = lerNumero(form.percentual)
  if (percentual === null) erros.percentual = 'Informe o percentual mensal do CUB'
  else if (percentual < 0) erros.percentual = 'O percentual não pode ser negativo'
  else if (percentual > 20) erros.percentual = 'Percentual mensal acima de 20% — confira'

  const valorImovel = form.valorImovel.trim() ? lerNumero(form.valorImovel) : null
  if (form.valorImovel.trim() && (valorImovel === null || valorImovel <= 0)) {
    erros.valorImovel = 'Valor do imóvel inválido'
  }

  const entrada = form.entrada.trim() ? lerNumero(form.entrada) : 0
  if (form.entrada.trim() && (entrada === null || entrada < 0)) {
    erros.entrada = 'Valor de entrada inválido'
  } else if (entrada !== null && valorImovel !== null && entrada > valorImovel) {
    erros.entrada = 'A entrada não pode passar do valor do imóvel'
  }

  if (Object.keys(erros).length > 0) return { erros, entrada: null }
  return {
    erros,
    entrada: montar(valorImovel, entrada ?? 0, parcela as number, meses as number, percentual as number),
  }
}

function montar(
  valorImovel: number | null,
  entrada: number,
  parcelaInicial: number,
  meses: number,
  percentual: number,
) {
  return {
    valorImovel,
    entrada,
    parcelaInicial,
    meses: Math.trunc(meses),
    percentual,
    // A fonte de indice e o ponto de troca: quando existir a tabela oficial
    // do CUB, e aqui que ela entra no lugar do percentual fixo.
    fonte: indiceFixo(percentual),
  }
}

function ItemResumo({
  rotulo,
  valor,
  dica,
  destaque,
}: {
  rotulo: string
  valor: string
  dica?: string
  destaque?: boolean
}) {
  return (
    <div className={`resumo-cub__item${destaque ? ' resumo-cub__item--destaque' : ''}`}>
      <span className="resumo-cub__rotulo">{rotulo}</span>
      <span className="resumo-cub__valor">{valor}</span>
      {dica && <span className="resumo-cub__dica">{dica}</span>}
    </div>
  )
}

interface Props {
  /** Aparece no cabeçalho e nos arquivos exportados. */
  titulo: string
  /** Pré-preenche o valor do imóvel (valor da unidade, quando houver). */
  valorSugerido?: number | null
  onFechar: () => void
  /**
   * Cria o fluxo de pagamento com o resultado. Ausente quando ainda não há
   * onde pendurar o fluxo (cadastro novo, sem salvar) — aí a calculadora vale
   * só como simulação.
   */
  onGerarFluxo?: (dados: FluxoInput) => Promise<void>
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function CalculadoraCub({ titulo, valorSugerido, onFechar, onGerarFluxo, avisar }: Props) {
  const [form, setForm] = useState<Formulario>(() => ({
    ...VAZIO,
    valorImovel: valorSugerido ? String(valorSugerido) : '',
  }))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null)
  const [gerando, setGerando] = useState(false)
  const { pedir, modal } = usePedirApresentacao()

  function mudar(campo: keyof Formulario, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: '' }))
  }

  function aoSimular() {
    const { erros: novosErros, entrada } = validar(form)
    setErros(novosErros)
    if (!entrada) {
      setSimulacao(null)
      avisar('Revise os campos destacados', 'erro')
      return
    }
    setSimulacao(simular(entrada))
  }

  function limpar() {
    setForm(VAZIO)
    setErros({})
    setSimulacao(null)
  }

  const pontos = useMemo(() => {
    if (!simulacao) return { parcelas: [], reajustes: [], acumulado: [] }
    const rotulo = (mes: number) => `Mês ${mes}`
    return {
      parcelas: simulacao.linhas.map((l) => ({
        rotulo: rotulo(l.mes),
        valor: l.parcelaAtual,
        detalhe: `reajuste de ${fmtMoeda(l.reajuste, true)}`,
      })),
      reajustes: simulacao.linhas.map((l) => ({
        rotulo: rotulo(l.mes),
        valor: l.reajuste,
        detalhe: `sobre ${fmtMoeda(l.parcelaAntes, true)}`,
      })),
      acumulado: simulacao.linhas.map((l) => ({
        rotulo: rotulo(l.mes),
        valor: l.acumuladoPago,
        detalhe: `${l.mes} de ${simulacao.resumo.meses} meses`,
      })),
    }
  }, [simulacao])

  function baixarPdf() {
    if (!simulacao) return
    // Quem assina e para quem: o cabeçalho do PDF sai igual em toda exportação.
    pedir((apresentacao) => {
      const abriu = exportarPdf(simulacao, titulo, apresentacao)
      if (!abriu) avisar('O navegador bloqueou a janela de impressão — libere os pop-ups do site', 'erro')
    })
  }

  async function gerarFluxo() {
    if (!simulacao || !onGerarFluxo) return
    const { resumo } = simulacao

    const percentualInformado = lerNumero(form.percentual) ?? 0
    // Saldo negativo = as parcelas ja passaram do valor do imovel; nada a financiar.
    const saldoDaObra =
      resumo.saldoAoFimDaObra !== null && resumo.saldoAoFimDaObra > 0 ? resumo.saldoAoFimDaObra : null

    setGerando(true)
    try {
      await onGerarFluxo({
        nome: `CUB ${fmtPercentual(percentualInformado)} · ${resumo.meses}x`,
        parcelas: resumo.meses,
        parcela_valor: resumo.parcelaInicial,
        entrada_valor: resumo.entrada > 0 ? resumo.entrada : null,
        entrada_pct: resumo.percentualEntrada !== null && resumo.entrada > 0 ? resumo.percentualEntrada : null,
        // O que sobra para o banco na entrega. Aqui a conta e melhor que a do
        // formulario: as parcelas foram corrigidas mes a mes pelo CUB.
        financiamento_valor: saldoDaObra,
        financiamento_pct:
          saldoDaObra !== null && resumo.valorImovel !== null && resumo.valorImovel > 0
            ? (saldoDaObra / resumo.valorImovel) * 100
            : null,
        descricao:
          `Parcelas corrigidas pelo CUB a ${resumo.fonte}. ` +
          `A parcela sai de ${fmtMoeda(resumo.parcelaInicial, true)} e chega a ${fmtMoeda(resumo.parcelaFinal, true)} ` +
          `no último mês de obra (${fmtPercentual(resumo.percentualAcumulado, 2)} de reajuste acumulado).`,
        observacoes:
          `Total pago na obra: ${fmtMoeda(resumo.totalPago, true)} — ` +
          `${fmtMoeda(resumo.totalReajuste, true)} a mais do que manter a parcela inicial.` +
          (resumo.entrada > 0
            ? ` Com a entrada de ${fmtMoeda(resumo.entrada)}, o desembolso até a entrega fica em ` +
              `${fmtMoeda(resumo.totalDesembolsado, true)}.`
            : '') +
          (resumo.saldoAoFimDaObra !== null && resumo.saldoAoFimDaObra > 0
            ? ` Restam ${fmtMoeda(resumo.saldoAoFimDaObra)} do saldo para financiar na entrega.`
            : ''),
        cub_percentual: percentualInformado,
        cub_meses: resumo.meses,
        cub_valor_imovel: resumo.valorImovel,
        cub_entrada: resumo.entrada,
        cub_parcela_inicial: resumo.parcelaInicial,
      })
      onFechar()
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao gerar o fluxo', 'erro')
    } finally {
      setGerando(false)
    }
  }

  const resumo = simulacao?.resumo

  return (
    <Modal
      titulo="Calcular valor com CUB"
      subtitulo={`${titulo} — simule o reajuste das parcelas até o fim da obra`}
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={limpar}>
            <Icone nome="fechar" tamanho={15} />
            Limpar
          </button>
          <div className="direita">
            {simulacao && onGerarFluxo && (
              <button type="button" className="btn btn--secundario" onClick={() => void gerarFluxo()} disabled={gerando}>
                {gerando ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Gerando…
                  </>
                ) : (
                  <>
                    <Icone nome="cartao" tamanho={15} />
                    Gerar fluxo de pagamento
                  </>
                )}
              </button>
            )}
            <button type="button" className="btn btn--primario" onClick={aoSimular}>
              <Icone nome="grafico" tamanho={15} />
              Simular
            </button>
          </div>
        </>
      }
    >
      <section className="form-secao">
        <h3 className="form-secao__titulo">
          <Icone nome="dinheiro" tamanho={13} />
          Dados da simulação
        </h3>

        <div className="grade">
          <Campo rotulo="Valor do imóvel" erro={erros.valorImovel}>
            <input
              className={`entrada${erros.valorImovel ? ' entrada--erro' : ''}`}
              value={form.valorImovel}
              onChange={(e) => mudar('valorImovel', e.target.value)}
              placeholder="450.000,00"
              inputMode="decimal"
            />
          </Campo>

          <Campo rotulo="Entrada" dica="R$" erro={erros.entrada}>
            <input
              className={`entrada${erros.entrada ? ' entrada--erro' : ''}`}
              value={form.entrada}
              onChange={(e) => mudar('entrada', e.target.value)}
              placeholder="50.000,00"
              inputMode="decimal"
            />
          </Campo>

          <Campo rotulo="Parcela inicial" obrigatorio dica="R$" erro={erros.parcelaInicial}>
            <input
              className={`entrada${erros.parcelaInicial ? ' entrada--erro' : ''}`}
              value={form.parcelaInicial}
              onChange={(e) => mudar('parcelaInicial', e.target.value)}
              placeholder="2.000,00"
              inputMode="decimal"
              autoFocus
            />
          </Campo>

          <Campo rotulo="Meses de obra" obrigatorio dica="restantes" erro={erros.meses}>
            <input
              className={`entrada${erros.meses ? ' entrada--erro' : ''}`}
              value={form.meses}
              onChange={(e) => mudar('meses', e.target.value)}
              placeholder="36"
              inputMode="numeric"
            />
          </Campo>

          <Campo rotulo="CUB mensal" obrigatorio dica="% ao mês" erro={erros.percentual}>
            <input
              className={`entrada${erros.percentual ? ' entrada--erro' : ''}`}
              value={form.percentual}
              onChange={(e) => mudar('percentual', e.target.value)}
              placeholder="0,70"
              inputMode="decimal"
            />
          </Campo>
        </div>

        <div className="atalhos-cub">
          <span className="campo__dica">Usar:</span>
          {ATALHOS_CUB.map((valor) => (
            <button
              key={valor}
              type="button"
              className={`atalho${lerNumero(form.percentual) === valor ? ' atalho--ativo' : ''}`}
              onClick={() => mudar('percentual', String(valor).replace('.', ','))}
            >
              {fmtPercentual(valor)}
            </button>
          ))}
        </div>

        <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
          <Icone nome="info" tamanho={12} /> A entrada abate o valor do imóvel; o reajuste incide só sobre a parcela,
          mês a mês e composto. Valor do imóvel e entrada são opcionais — sem eles a simulação mostra apenas a evolução
          das parcelas. Quando houver a tabela oficial do CUB, ela entra no lugar deste percentual sem mudar o cálculo.
        </p>
      </section>

      {resumo && simulacao && !onGerarFluxo && (
        <p className="campo__dica" style={{ marginBottom: 'var(--e4)' }}>
          <Icone nome="info" tamanho={12} /> Salve o empreendimento para transformar esta simulação em um fluxo de
          pagamento.
        </p>
      )}

      {resumo && simulacao && (
        <>
          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="alvo" tamanho={13} />
              Resumo da obra
            </h3>

            <div className="resumo-cub">
              <ItemResumo rotulo="Valor do imóvel" valor={resumo.valorImovel === null ? '—' : fmtMoeda(resumo.valorImovel)} />
              <ItemResumo
                rotulo="Entrada"
                valor={resumo.entrada > 0 ? fmtMoeda(resumo.entrada) : '—'}
                dica={
                  resumo.percentualEntrada !== null && resumo.entrada > 0
                    ? `${fmtPercentual(resumo.percentualEntrada, 2)} do imóvel`
                    : undefined
                }
              />
              <ItemResumo
                rotulo="Saldo após a entrada"
                valor={resumo.saldo === null ? '—' : fmtMoeda(resumo.saldo, true)}
                dica={resumo.saldo === null ? 'informe o valor do imóvel' : 'o que as parcelas atacam'}
              />
              <ItemResumo rotulo="Meses restantes" valor={String(resumo.meses)} />
              <ItemResumo rotulo="Parcela inicial" valor={fmtMoeda(resumo.parcelaInicial, true)} />
              <ItemResumo rotulo="CUB aplicado" valor={resumo.fonte} />
              <ItemResumo
                rotulo="Parcela final"
                valor={fmtMoeda(resumo.parcelaFinal, true)}
                dica="no último mês de obra"
                destaque
              />
              <ItemResumo
                rotulo="Reajuste acumulado"
                valor={fmtPercentual(resumo.percentualAcumulado, 2)}
                dica="sobre a parcela"
                destaque
              />
              <ItemResumo
                rotulo="Total pago na obra"
                valor={fmtMoeda(resumo.totalPago, true)}
                dica="só as parcelas"
                destaque
              />
              <ItemResumo
                rotulo="Entrada + parcelas"
                valor={fmtMoeda(resumo.totalDesembolsado, true)}
                dica={
                  resumo.percentualDoImovel !== null
                    ? `${fmtPercentual(resumo.percentualDoImovel, 2)} do valor do imóvel`
                    : 'desembolso até a entrega'
                }
                destaque
              />
              {resumo.saldoAoFimDaObra !== null && (
                <ItemResumo
                  rotulo={resumo.saldoAoFimDaObra >= 0 ? 'Saldo na entrega' : 'Pago a mais que o saldo'}
                  valor={fmtMoeda(Math.abs(resumo.saldoAoFimDaObra), true)}
                  dica={
                    resumo.saldoAoFimDaObra >= 0
                      ? 'o que sobra para financiar'
                      : 'as parcelas passaram do saldo'
                  }
                  destaque
                />
              )}
              <ItemResumo
                rotulo="Total de reajuste"
                valor={fmtMoeda(resumo.totalReajuste, true)}
                dica={`a mais que ${fmtMoeda(resumo.totalSemReajuste, true)} sem correção`}
                destaque
              />
            </div>

            <div className="acoes-exportar">
              <button type="button" className="btn btn--secundario btn--pequeno" onClick={baixarPdf}>
                <Icone nome="lista" tamanho={13} />
                Exportar PDF
              </button>
              <button
                type="button"
                className="btn btn--secundario btn--pequeno"
                onClick={() => exportarCsv(simulacao, titulo)}
              >
                <Icone nome="grafico" tamanho={13} />
                Exportar Excel
              </button>
            </div>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="grafico" tamanho={13} />
              Evolução mês a mês
            </h3>

            <GraficoLinha
              titulo="Parcela ao longo da obra"
              descricao={`de ${fmtMoeda(resumo.parcelaInicial, true)} a ${fmtMoeda(resumo.parcelaFinal, true)}`}
              pontos={pontos.parcelas}
              formatar={(v) => fmtMoeda(v, true)}
              formatarEixo={fmtMoedaCurta}
            />

            <GraficoBarras
              titulo="Reajuste de cada mês"
              descricao="quanto o CUB acrescenta na parcela do mês"
              pontos={pontos.reajustes}
              formatar={(v) => fmtMoeda(v, true)}
              formatarEixo={fmtMoedaCurta}
            />

            <GraficoLinha
              titulo="Total pago acumulado"
              descricao={`chega a ${fmtMoeda(resumo.totalPago, true)} no fim da obra`}
              pontos={pontos.acumulado}
              formatar={(v) => fmtMoeda(v, true)}
              formatarEixo={fmtMoedaCurta}
              comArea
            />
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="lista" tamanho={13} />
              Tabela de evolução
            </h3>

            <div className="tabela-cub__area">
              <table className="tabela-cub">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Parcela antes</th>
                    <th>% CUB</th>
                    <th>Valor do reajuste</th>
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
                    <td className="tabela-cub__reajuste">{fmtMoeda(resumo.totalReajuste, true)}</td>
                    <td />
                    <td className="tabela-cub__forte">{fmtMoeda(resumo.totalPago, true)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {modal}
    </Modal>
  )
}

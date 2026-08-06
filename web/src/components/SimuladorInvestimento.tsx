import { useMemo, useState } from 'react'
import type { Empreendimento, Unidade } from '../types'
import { lerNumero, fmtPercentual } from '../lib/cub'
import {
  fmtArea,
  fmtEntrega,
  fmtFaixaInteiro,
  fmtFaixaMetragem,
  fmtInteiro,
  fmtMoeda,
  fmtMoedaCurta,
  TRACO,
} from '../lib/format'
import {
  mesesAteAEntrega,
  saldoDevedorSugerido,
  simularInvestimento,
  textoDoPrazo,
  type ResultadoInvestimento,
  type UnidadePrazo,
} from '../lib/investimento'
import { exportarPdfInvestimento, type ImovelDaSimulacao } from '../lib/exportarSimulacao'
import { resumoUnidades, rotuloUnidade, valorM2Da } from '../lib/unidades'
import { Campo, Modal } from './ui'
import { Icone, type NomeIcone } from './Icones'
import { GraficoLinha } from './GraficoSvg'

/** Expectativas de valorizacao que aparecem nas conversas de venda. */
const ATALHOS_VALORIZACAO = [5, 8, 10, 12, 15, 20]

interface Formulario {
  valorCompra: string
  entrada: string
  valorPago: string
  saldoDevedor: string
  prazo: string
  unidadePrazo: UnidadePrazo
  valorizacao: string
}

const VAZIO: Formulario = {
  valorCompra: '',
  entrada: '',
  valorPago: '',
  saldoDevedor: '',
  prazo: '',
  unidadePrazo: 'meses',
  valorizacao: '',
}

function validar(form: Formulario) {
  const erros: Record<string, string> = {}

  const valorCompra = lerNumero(form.valorCompra)
  if (valorCompra === null || valorCompra <= 0) erros.valorCompra = 'Informe o valor de compra'

  const prazo = lerNumero(form.prazo)
  if (prazo === null || prazo < 0) erros.prazo = 'Informe o tempo até a entrega'
  else if (form.unidadePrazo === 'anos' && prazo > 50) erros.prazo = 'No máximo 50 anos'
  else if (form.unidadePrazo === 'meses' && prazo > 600) erros.prazo = 'No máximo 600 meses'

  const valorizacao = lerNumero(form.valorizacao)
  if (valorizacao === null) erros.valorizacao = 'Informe a valorização anual'
  else if (valorizacao < -100) erros.valorizacao = 'Valorização inválida'
  else if (valorizacao > 100) erros.valorizacao = 'Valorização anual acima de 100% — confira'

  const opcional = (campo: keyof Formulario, rotulo: string) => {
    const texto = form[campo] as string
    if (!texto.trim()) return 0
    const valor = lerNumero(texto)
    if (valor === null || valor < 0) {
      erros[campo] = `${rotulo} inválido`
      return 0
    }
    return valor
  }

  const entrada = opcional('entrada', 'Valor de entrada')
  const valorPago = opcional('valorPago', 'Valor já pago')
  const saldoDevedor = opcional('saldoDevedor', 'Saldo devedor')

  if (Object.keys(erros).length > 0) return { erros, entrada: null }

  return {
    erros,
    entrada: {
      valorCompra: valorCompra as number,
      entrada,
      valorPago,
      saldoDevedor,
      prazo: prazo as number,
      unidadePrazo: form.unidadePrazo,
      valorizacaoAnual: valorizacao as number,
    },
  }
}

function Cartao({
  icone,
  rotulo,
  valor,
  dica,
  tom = 'neutro',
}: {
  icone: NomeIcone
  rotulo: string
  valor: string
  dica?: string
  tom?: 'neutro' | 'marca' | 'ganho'
}) {
  return (
    <div className={`inv-cartao inv-cartao--${tom}`}>
      <span className="inv-cartao__rotulo">
        <Icone nome={icone} tamanho={12} />
        {rotulo}
      </span>
      <span className="inv-cartao__valor">{valor}</span>
      {dica && <span className="inv-cartao__dica">{dica}</span>}
    </div>
  )
}

/** Numero no formato que o campo aceita de volta: "300.000,00". */
function textoDoValor(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Os dados do imovel que abrem o PDF. Com unidade escolhida, os numeros sao os
 * dela; sem unidade, valem as faixas das unidades cadastradas e, na falta
 * delas, os campos gerais do empreendimento — a mesma leitura do painel.
 */
function imovelParaPdf(empreendimento: Empreendimento | null, unidade: Unidade | null): ImovelDaSimulacao | null {
  if (!empreendimento) return null

  const resumo = resumoUnidades(empreendimento.unidades)
  const temUnidades = empreendimento.unidades.length > 0
  const localizacao = [empreendimento.bairro, empreendimento.cidade].filter((p) => p && p.trim()).join(', ')

  return {
    nome: empreendimento.nome,
    subtitulo: [empreendimento.construtora, localizacao, empreendimento.tipo]
      .filter((p) => p && p.trim())
      .join(' · '),
    unidade: unidade ? rotuloUnidade(unidade) : null,
    metragem: unidade
      ? fmtArea(unidade.metragem)
      : temUnidades
        ? fmtFaixaMetragem(resumo.metragem.min, resumo.metragem.max)
        : fmtFaixaMetragem(empreendimento.metragem_min, empreendimento.metragem_max),
    dormitorios: unidade
      ? fmtInteiro(unidade.dormitorios)
      : temUnidades
        ? fmtFaixaInteiro(resumo.dormitorios.min, resumo.dormitorios.max)
        : fmtInteiro(empreendimento.dormitorios),
    suites: unidade ? fmtInteiro(unidade.suites) : fmtInteiro(empreendimento.suites),
    vagas: unidade
      ? fmtInteiro(unidade.vagas)
      : temUnidades
        ? fmtFaixaInteiro(resumo.vagas.min, resumo.vagas.max)
        : fmtInteiro(empreendimento.vagas),
    valorM2: unidade ? fmtMoeda(valorM2Da(unidade)) : fmtMoeda(empreendimento.valor_m2),
    entrega: fmtEntrega(empreendimento.entrega),
    status: empreendimento.status_obra,
  }
}

/**
 * O que um imovel cadastrado consegue preencher sozinho. O resto (quanto ja
 * foi pago, saldo devedor, expectativa de valorizacao) e do usuario — o
 * simulador continua funcionando sem escolher imovel nenhum.
 */
function dadosDoImovel(empreendimento: Empreendimento, unidade: Unidade | null) {
  const valorCompra = unidade?.valor ?? valorDoEmpreendimento(empreendimento)
  const meses = mesesAteAEntrega(empreendimento.entrega)
  // Entrada cadastrada em algum fluxo daquele imovel (o da unidade tem prioridade).
  const fluxos = [...(unidade?.fluxos ?? []), ...empreendimento.fluxos]
  const entrada = fluxos.find((f) => f.entrada_valor !== null)?.entrada_valor ?? null

  return { valorCompra, meses, entrada }
}

/** Sem unidade escolhida, o preco sai do valor do m² pela menor metragem. */
function valorDoEmpreendimento(e: Empreendimento): number | null {
  if (e.unidades.length > 0) {
    const valores = e.unidades.map((u) => u.valor).filter((v): v is number => v !== null)
    if (valores.length > 0) return Math.min(...valores)
  }
  if (e.valor_m2 !== null && e.metragem_min !== null) return e.valor_m2 * e.metragem_min
  return null
}

/** Aplica sobre o formulario o que o imovel escolhido sabe preencher. */
function comImovel(base: Formulario, alvo: Empreendimento | null, unidadeAlvo: Unidade | null): Formulario {
  if (!alvo) return base
  const { valorCompra, meses, entrada } = dadosDoImovel(alvo, unidadeAlvo)

  return {
    ...base,
    valorCompra: valorCompra !== null ? String(Math.round(valorCompra)) : base.valorCompra,
    prazo: meses !== null ? String(meses) : base.prazo,
    unidadePrazo: meses !== null ? 'meses' : base.unidadePrazo,
    entrada: entrada !== null ? String(Math.round(entrada)) : base.entrada,
  }
}

interface Props {
  /** Imoveis cadastrados, para o atalho de preenchimento. */
  lista?: Empreendimento[]
  /** Ja abre com este imovel escolhido (quando vem do painel de detalhe). */
  empreendimentoInicial?: number | null
  onFechar: () => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function SimuladorInvestimento({
  lista = [],
  empreendimentoInicial = null,
  onFechar,
  avisar,
}: Props) {
  // Aberto pelo painel de um imovel: os campos ja nascem preenchidos com ele.
  const [form, setForm] = useState<Formulario>(() =>
    comImovel(VAZIO, lista.find((e) => e.id === empreendimentoInicial) ?? null, null),
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<ResultadoInvestimento | null>(null)
  const [empreendimentoId, setEmpreendimentoId] = useState<number | null>(empreendimentoInicial)
  const [unidadeId, setUnidadeId] = useState<number | null>(null)
  // O saldo devedor sai da conta sozinho ate alguem digitar outro valor ali.
  const [saldoManual, setSaldoManual] = useState(false)

  const empreendimento = useMemo(
    () => lista.find((e) => e.id === empreendimentoId) ?? null,
    [lista, empreendimentoId],
  )
  const unidade = useMemo(
    () => empreendimento?.unidades.find((u) => u.id === unidadeId) ?? null,
    [empreendimento, unidadeId],
  )

  /** Copia o que o imovel sabe para os campos, sem mexer no resto. */
  function aplicarImovel(alvo: Empreendimento | null, unidadeAlvo: Unidade | null) {
    if (!alvo) return
    setForm((atual) => comImovel(atual, alvo, unidadeAlvo))
    setErros({})
  }

  function escolherEmpreendimento(id: number | null) {
    setEmpreendimentoId(id)
    setUnidadeId(null)
    aplicarImovel(lista.find((e) => e.id === id) ?? null, null)
  }

  function escolherUnidade(id: number | null) {
    setUnidadeId(id)
    aplicarImovel(empreendimento, empreendimento?.unidades.find((u) => u.id === id) ?? null)
  }

  function mudar(campo: keyof Formulario, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: '' }))
  }

  /** O que falta pagar da compra — enquanto ninguem sobrescreve o campo. */
  const saldoAutomatico = useMemo(
    () => saldoDevedorSugerido(lerNumero(form.valorCompra), lerNumero(form.valorPago)),
    [form.valorCompra, form.valorPago],
  )
  const saldoNoCampo = saldoManual
    ? form.saldoDevedor
    : saldoAutomatico !== null
      ? textoDoValor(saldoAutomatico)
      : ''
  // O calculo automatico so vale se o "ja pago" tiver mesmo somado a entrada.
  const entradaDigitada = lerNumero(form.entrada)
  const pagoDigitado = lerNumero(form.valorPago)
  const entradaForaDoPago =
    !saldoManual && entradaDigitada !== null && pagoDigitado !== null && entradaDigitada > pagoDigitado

  function mudarSaldo(valor: string) {
    setSaldoManual(true)
    mudar('saldoDevedor', valor)
  }

  function voltarAoSaldoAutomatico() {
    setSaldoManual(false)
    setForm((atual) => ({ ...atual, saldoDevedor: '' }))
    setErros((atual) => ({ ...atual, saldoDevedor: '' }))
  }

  function aoSimular() {
    // O campo do saldo pode estar so na tela (calculado) — a simulacao usa o que se ve.
    const { erros: novosErros, entrada } = validar({ ...form, saldoDevedor: saldoNoCampo })
    setErros(novosErros)
    if (!entrada) {
      setResultado(null)
      avisar('Revise os campos destacados', 'erro')
      return
    }
    setResultado(simularInvestimento(entrada))
  }

  function limpar() {
    setForm(VAZIO)
    setErros({})
    setResultado(null)
    setSaldoManual(false)
  }

  function aoExportarPdf() {
    if (!resultado) return
    const abriu = exportarPdfInvestimento(resultado, imovelParaPdf(empreendimento, unidade))
    if (!abriu) avisar('O navegador bloqueou a janela de impressão — libere os pop-ups do site', 'erro')
  }

  const pontos = useMemo(
    () =>
      (resultado?.evolucao ?? []).map((ponto) => ({
        rotulo: ponto.mes === 0 ? 'Hoje' : `Mês ${ponto.mes}`,
        valor: ponto.valor,
        detalhe:
          ponto.mes === 0
            ? 'valor de compra'
            : `${fmtPercentual((ponto.valor / (resultado?.valorCompra || 1) - 1) * 100, 2)} de valorização`,
      })),
    [resultado],
  )

  function entradaMonetaria(campo: keyof Formulario, placeholder: string) {
    return (
      <input
        className={`entrada${erros[campo] ? ' entrada--erro' : ''}`}
        value={form[campo] as string}
        onChange={(e) => mudar(campo, e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
      />
    )
  }

  return (
    <Modal
      titulo="Simulador de investimento"
      subtitulo="Quanto o imóvel pode render até a entrega — todos os dados são informados aqui"
      largo
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={limpar}>
            <Icone nome="fechar" tamanho={15} />
            Limpar
          </button>
          <div className="direita">
            <button
              type="button"
              className="btn btn--fantasma"
              onClick={aoExportarPdf}
              disabled={!resultado}
              title={resultado ? 'Abre a folha de impressão para salvar em PDF' : 'Simule primeiro'}
            >
              <Icone nome="lista" tamanho={15} />
              Exportar PDF
            </button>
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
          Dados do investimento
        </h3>

        {lista.length > 0 && (
          <div className="seletor-imovel">
            <Campo rotulo="Usar um imóvel cadastrado" dica="opcional — preenche os campos">
              <select
                className="entrada"
                value={empreendimentoId ?? ''}
                onChange={(e) => escolherEmpreendimento(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Digitar tudo à mão</option>
                {lista.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {empreendimento && empreendimento.unidades.length > 0 && (
              <Campo rotulo="Unidade" dica="usa o preço dela">
                <select
                  className="entrada"
                  value={unidadeId ?? ''}
                  onChange={(e) => escolherUnidade(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Empreendimento (menor preço)</option>
                  {empreendimento.unidades.map((item, indice) => (
                    <option key={item.id} value={item.id}>
                      {rotuloUnidade(item, indice)}
                      {item.valor !== null ? ` — ${fmtMoeda(item.valor)}` : ''}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {empreendimento && (
              <p className="campo__dica seletor-imovel__aviso">
                <Icone nome="info" tamanho={12} /> Preenchi valor de compra
                {unidade
                  ? ` (${fmtMoeda(unidade.valor)} da unidade${
                      valorM2Da(unidade) !== null ? `, ${fmtMoeda(valorM2Da(unidade))}/m²` : ''
                    })`
                  : ''}
                {mesesAteAEntrega(empreendimento.entrega) !== null ? ' e o prazo até a entrega prevista' : ''}. O que já
                foi pago e a valorização esperada continuam com você — o saldo devedor sai da conta sozinho.
              </p>
            )}
          </div>
        )}

        <div className="grade">
          <Campo rotulo="Valor de compra" obrigatorio dica="R$" erro={erros.valorCompra}>
            {entradaMonetaria('valorCompra', '450.000,00')}
          </Campo>

          <Campo rotulo="Entrada" dica="R$" erro={erros.entrada}>
            {entradaMonetaria('entrada', '90.000,00')}
          </Campo>

          <Campo rotulo="Valor já pago" dica="R$" erro={erros.valorPago}>
            {entradaMonetaria('valorPago', '150.000,00')}
          </Campo>

          <Campo
            rotulo="Saldo devedor"
            dica={saldoManual ? 'informado à mão' : 'valor de compra − valor já pago'}
            erro={erros.saldoDevedor}
          >
            <input
              className={`entrada${erros.saldoDevedor ? ' entrada--erro' : ''}${
                saldoManual ? '' : ' entrada--calculada'
              }`}
              value={saldoNoCampo}
              onChange={(e) => mudarSaldo(e.target.value)}
              placeholder="300.000,00"
              inputMode="decimal"
            />
          </Campo>

          <Campo rotulo="Tempo até a entrega" obrigatorio erro={erros.prazo}>
            <div className="entrada-com-unidade">
              <input
                className={`entrada${erros.prazo ? ' entrada--erro' : ''}`}
                value={form.prazo}
                onChange={(e) => mudar('prazo', e.target.value)}
                placeholder="36"
                inputMode="numeric"
              />
              <select
                className="entrada"
                value={form.unidadePrazo}
                onChange={(e) => mudar('unidadePrazo', e.target.value)}
                aria-label="Unidade do prazo"
              >
                <option value="meses">meses</option>
                <option value="anos">anos</option>
              </select>
            </div>
          </Campo>

          <Campo rotulo="Valorização anual" obrigatorio dica="% ao ano" erro={erros.valorizacao}>
            {entradaMonetaria('valorizacao', '10')}
          </Campo>
        </div>

        {saldoManual && (
          <p className="campo__dica linha-calculo">
            <Icone nome="lapis" tamanho={12} /> Saldo devedor informado à mão.
            <button type="button" className="link-acao" onClick={voltarAoSaldoAutomatico}>
              Voltar ao cálculo automático
            </button>
          </p>
        )}

        {entradaForaDoPago && (
          <p className="campo__dica linha-calculo linha-calculo--alerta">
            <Icone nome="alerta" tamanho={12} /> A entrada está maior que o valor já pago — some a entrada ali, senão o
            saldo devedor calculado fica maior que o real.
          </p>
        )}

        <div className="atalhos-cub">
          <span className="campo__dica">Usar:</span>
          {ATALHOS_VALORIZACAO.map((valor) => (
            <button
              key={valor}
              type="button"
              className={`atalho${lerNumero(form.valorizacao) === valor ? ' atalho--ativo' : ''}`}
              onClick={() => mudar('valorizacao', String(valor))}
            >
              {valor}%
            </button>
          ))}
        </div>

        <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
          <Icone nome="info" tamanho={12} /> A valorização é composta sobre o valor de compra e a expectativa é sua —
          o simulador não busca índice de mercado. O <strong>valor já pago</strong> soma entrada, parcelas, reforços e
          balões — é ele que define a rentabilidade.
        </p>
      </section>

      {resultado && (
        <>
          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="alvo" tamanho={13} />
              Projeção da entrega
            </h3>

            <div className="inv-hero">
              <div className="inv-hero__principal">
                <span className="inv-hero__rotulo">Valor estimado na entrega</span>
                <span className="inv-hero__valor">{fmtMoeda(resultado.valorEstimadoEntrega)}</span>
                <span className="inv-hero__dica">
                  {fmtMoeda(resultado.valorCompra)} hoje · {fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano por{' '}
                  {textoDoPrazo(resultado.meses)} · {fmtPercentual(resultado.valorizacaoTotal, 2)} no período
                </span>
              </div>

              {resultado.multiplicador !== null && (
                <div className="inv-hero__lado">
                  <span className="inv-hero__rotulo">ROI</span>
                  <span className="inv-hero__valor inv-hero__valor--menor">
                    {fmtMoeda(resultado.multiplicador, true)}
                  </span>
                  <span className="inv-hero__dica">
                    de patrimônio para cada R$ 1,00 investido
                    {resultado.rentabilidade !== null && ` · ${fmtPercentual(resultado.rentabilidade, 2)} de retorno`}
                  </span>
                </div>
              )}
            </div>

            <div className="inv-cartoes">
              <Cartao icone="dinheiro" rotulo="Valor de compra" valor={fmtMoeda(resultado.valorCompra)} />
              <Cartao
                icone="cartao"
                rotulo="Entrada"
                valor={resultado.entrada > 0 ? fmtMoeda(resultado.entrada) : TRACO}
                dica={
                  resultado.entrada > 0 && resultado.valorCompra > 0
                    ? `${fmtPercentual((resultado.entrada / resultado.valorCompra) * 100, 2)} da compra`
                    : undefined
                }
              />
              <Cartao
                icone="banco"
                rotulo="Valor investido"
                valor={resultado.valorInvestido > 0 ? fmtMoeda(resultado.valorInvestido) : TRACO}
                dica="tudo que já saiu do bolso"
                tom="marca"
              />
              <Cartao
                icone="chave"
                rotulo="Saldo devedor"
                valor={resultado.saldoDevedor > 0 ? fmtMoeda(resultado.saldoDevedor) : 'quitado'}
              />
              <Cartao
                icone="seta_cima"
                rotulo="Ganho patrimonial"
                valor={fmtMoeda(resultado.ganhoPatrimonialBruto)}
                dica="quanto o imóvel valorizou"
                tom="ganho"
              />
              <Cartao
                icone="predio"
                rotulo="Patrimônio líquido"
                valor={fmtMoeda(resultado.patrimonioLiquido)}
                dica="já sem a dívida"
                tom="ganho"
              />
              <Cartao
                icone="grafico"
                rotulo="Lucro potencial"
                valor={fmtMoeda(resultado.lucroPotencial)}
                dica="sem descontar o saldo devedor"
                tom="ganho"
              />
              <Cartao
                icone="alvo"
                rotulo="Rentabilidade"
                valor={resultado.rentabilidade === null ? TRACO : fmtPercentual(resultado.rentabilidade, 2)}
                dica={resultado.rentabilidade === null ? 'informe o valor já pago' : 'sobre o valor investido'}
                tom="marca"
              />
            </div>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="grafico" tamanho={13} />
              Valorização até a entrega
            </h3>

            <GraficoLinha
              titulo="Valor estimado do imóvel"
              descricao={`de ${fmtMoeda(resultado.valorCompra)} a ${fmtMoeda(resultado.valorEstimadoEntrega)}`}
              pontos={pontos}
              formatar={(v) => fmtMoeda(v)}
              formatarEixo={fmtMoedaCurta}
            />
          </section>
        </>
      )}
    </Modal>
  )
}

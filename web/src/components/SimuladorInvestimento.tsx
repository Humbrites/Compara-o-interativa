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
  fmtNumero,
  TRACO,
} from '../lib/format'
import {
  mesesAteAEntrega,
  mesesDoPrazo,
  saldoDevedorSugerido,
  simularInvestimento,
  textoDaConclusao,
  textoDoPrazo,
  type Conclusao,
  type ResultadoInvestimento,
  type UnidadePrazo,
} from '../lib/investimento'
import { exportarPdfInvestimento, type ImovelDaSimulacao } from '../lib/exportarSimulacao'
import { precoDaUnidade, resumoUnidades, rotuloUnidade, valorM2Da, valorNoFluxo } from '../lib/unidades'
import { Campo, Modal } from './ui'
import { Icone, type NomeIcone } from './Icones'
import { GraficoLinha } from './GraficoSvg'

/** Expectativas de valorizacao que aparecem nas conversas de venda. */
const ATALHOS_VALORIZACAO = [5, 8, 10, 12, 15, 20]

/** Os mesmos percentuais mensais da calculadora do CUB. */
const ATALHOS_CUB = [0.35, 0.6, 0.7, 0.75, 1]

interface Formulario {
  valorCompra: string
  entrada: string
  valorPago: string
  saldoDevedor: string
  prazo: string
  unidadePrazo: UnidadePrazo
  valorizacao: string
  cub: string
}

const VAZIO: Formulario = {
  valorCompra: '',
  entrada: '',
  valorPago: '',
  saldoDevedor: '',
  prazo: '',
  unidadePrazo: 'meses',
  valorizacao: '',
  cub: '',
}

function validar(form: Formulario, usarCub: boolean) {
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

  // O CUB so e cobrado quando a opcao esta marcada; desmarcada, o campo nem existe.
  const cub = usarCub ? lerNumero(form.cub) : null
  if (usarCub) {
    if (cub === null) erros.cub = 'Informe o percentual mensal do CUB'
    else if (cub < 0) erros.cub = 'O percentual não pode ser negativo'
    else if (cub > 20) erros.cub = 'Percentual mensal acima de 20% — confira'
  }

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
      cubMensal: cub,
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

/** Uma das duas leituras do investimento, lado a lado com a outra. */
function CartaoConclusao({
  titulo,
  dica,
  icone,
  resultado,
  conclusao,
  destaque = false,
  rotuloSaldo,
}: {
  titulo: string
  dica: string
  icone: NomeIcone
  resultado: ResultadoInvestimento
  conclusao: Conclusao
  destaque?: boolean
  rotuloSaldo: string
}) {
  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: rotuloSaldo, valor: conclusao.saldoDevedor > 0 ? fmtMoeda(conclusao.saldoDevedor) : 'quitado' },
    { rotulo: 'Patrimônio líquido', valor: fmtMoeda(conclusao.patrimonioLiquido) },
    { rotulo: 'Lucro potencial', valor: fmtMoeda(conclusao.lucroPotencial) },
    {
      rotulo: 'Rentabilidade',
      valor: conclusao.rentabilidade === null ? TRACO : fmtPercentual(conclusao.rentabilidade, 2),
    },
    // Aqui o ROI vai sem o "R$": no cartao ele nao tem a legenda do hero para
    // explicar que e patrimonio por real investido, e "1,99×" ja diz sozinho.
    { rotulo: 'ROI', valor: conclusao.multiplicador === null ? TRACO : `${fmtNumero(conclusao.multiplicador)}×` },
  ]

  return (
    <article className={`inv-conclusao${destaque ? ' inv-conclusao--cub' : ''}`}>
      <header className="inv-conclusao__topo">
        <span className="inv-conclusao__titulo">
          <Icone nome={icone} tamanho={13} />
          {titulo}
        </span>
        <span className="inv-conclusao__dica">{dica}</span>
      </header>

      <dl className="inv-conclusao__linhas">
        {linhas.map((linha) => (
          <div key={linha.rotulo} className="inv-conclusao__linha">
            <dt>{linha.rotulo}</dt>
            <dd>{linha.valor}</dd>
          </div>
        ))}
      </dl>

      <p className="inv-conclusao__frase">{textoDaConclusao(resultado, conclusao)}</p>
    </article>
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
  // Com unidade escolhida manda o preco DELA — inclusive quando ele so existe
  // na tabela de pagamento. Sem isso a tela mantinha o preco do empreendimento
  // e o cliente via o numero de outra unidade.
  const valorCompra = (unidade ? precoDaUnidade(unidade) : null) ?? valorDoEmpreendimento(empreendimento)
  const meses = mesesAteAEntrega(empreendimento.entrega)
  // Entrada cadastrada em algum fluxo daquele imovel (o da unidade tem prioridade).
  const fluxos = [...(unidade?.fluxos ?? []), ...empreendimento.fluxos]
  const entrada = fluxos.find((f) => f.entrada_valor !== null)?.entrada_valor ?? null

  return { valorCompra, meses, entrada }
}

/**
 * Sem unidade escolhida, vale a unidade mais barata; sem preco em nenhuma
 * delas, o valor do m² pela menor metragem. A tabela geral do empreendimento
 * entra antes do palpite do m²: la o preco foi digitado, aqui e conta.
 */
function valorDoEmpreendimento(e: Empreendimento): number | null {
  const valores = e.unidades.map(precoDaUnidade).filter((v): v is number => v !== null)
  if (valores.length > 0) return Math.min(...valores)

  const daTabela = valorNoFluxo(e.fluxos)
  if (daTabela !== null) return daTabela

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
  // Desmarcado, o simulador conclui so com os valores do empreendimento.
  const [usarCub, setUsarCub] = useState(false)

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

  /**
   * O CUB e digitado ao mes, mas quem decide olha o periodo inteiro: 0,60% ao
   * mes por 36 meses viram 24% de correcao. Mostrar isso antes de simular evita
   * a surpresa de ver a divida crescer tanto.
   */
  const cubNoPeriodo = useMemo(() => {
    const percentual = lerNumero(form.cub)
    const prazo = lerNumero(form.prazo)
    if (!usarCub || percentual === null || prazo === null) return null
    return (Math.pow(1 + percentual / 100, mesesDoPrazo(prazo, form.unidadePrazo)) - 1) * 100
  }, [usarCub, form.cub, form.prazo, form.unidadePrazo])

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
    const { erros: novosErros, entrada } = validar({ ...form, saldoDevedor: saldoNoCampo }, usarCub)
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
    setUsarCub(false)
  }

  /** Desmarcar o CUB apaga o percentual e o erro dele — nada fica pendurado. */
  function alternarCub(marcado: boolean) {
    setUsarCub(marcado)
    if (!marcado) {
      setForm((atual) => ({ ...atual, cub: '' }))
      setErros((atual) => ({ ...atual, cub: '' }))
    }
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
                      {precoDaUnidade(item) !== null ? ` — ${fmtMoeda(precoDaUnidade(item))}` : ''}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {empreendimento && (
              <p className="campo__dica seletor-imovel__aviso">
                <Icone nome="info" tamanho={12} /> Preenchi valor de compra
                {unidade && precoDaUnidade(unidade) !== null
                  ? ` (${fmtMoeda(precoDaUnidade(unidade))} da unidade${
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

          {/* Logo depois da valorizacao porque e a segunda taxa da conta — uma
              empurra o valor do imovel para cima, a outra empurra a divida. */}
          <div className="col-inteira opcao">
            <label className="opcao__marcar">
              <input type="checkbox" checked={usarCub} onChange={(e) => alternarCub(e.target.checked)} />
              <span>Considerar a correção do CUB no saldo devedor</span>
            </label>
            <span className="campo__dica opcao__dica">
              liga a segunda conclusão, com a dívida corrigida até a entrega
            </span>
          </div>

          {usarCub && (
            <Campo rotulo="CUB mensal" obrigatorio dica="% ao mês" erro={erros.cub}>
              {entradaMonetaria('cub', '0,60')}
            </Campo>
          )}
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
          <span className="campo__dica">Valorização:</span>
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

        {usarCub && (
          <div className="atalhos-cub">
            <span className="campo__dica">CUB:</span>
            {ATALHOS_CUB.map((valor) => (
              <button
                key={valor}
                type="button"
                className={`atalho${lerNumero(form.cub) === valor ? ' atalho--ativo' : ''}`}
                onClick={() => mudar('cub', String(valor).replace('.', ','))}
              >
                {fmtPercentual(valor)}
              </button>
            ))}
            {cubNoPeriodo !== null && (
              <span className="campo__dica">≈ {fmtPercentual(cubNoPeriodo, 2)} de correção no período</span>
            )}
          </div>
        )}

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
              {resultado.cub && (
                <span className="form-secao__complemento">— só com os valores do empreendimento</span>
              )}
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

          {resultado.cub && (
            <section className="form-secao">
              <h3 className="form-secao__titulo">
                <Icone nome="lista" tamanho={13} />
                Conclusão
                <span className="form-secao__complemento">— com e sem a correção do CUB</span>
              </h3>

              <div className="inv-conclusoes">
                <CartaoConclusao
                  titulo="Só o empreendimento"
                  icone="predio"
                  dica={`valorização de ${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano · saldo devedor parado`}
                  resultado={resultado}
                  conclusao={resultado}
                  rotuloSaldo="Saldo devedor"
                />
                <CartaoConclusao
                  titulo="Com o CUB"
                  icone="grafico"
                  dica={`a mesma valorização · saldo corrigido em ${fmtPercentual(resultado.cub.cubMensal)} ao mês`}
                  resultado={resultado}
                  conclusao={resultado.cub}
                  rotuloSaldo="Saldo corrigido"
                  destaque
                />
              </div>

              {resultado.saldoDevedor > 0 ? (
                <p className="campo__dica linha-calculo">
                  <Icone nome="info" tamanho={12} /> O CUB de {fmtPercentual(resultado.cub.cubMensal)} ao mês acumula{' '}
                  {fmtPercentual(resultado.cub.cubAcumulado, 2)} em {textoDoPrazo(resultado.meses)}: acrescenta{' '}
                  {fmtMoeda(resultado.cub.correcao)} ao saldo devedor e tira o mesmo do patrimônio líquido. A
                  valorização do imóvel é a mesma nas duas leituras — o que muda é a dívida.
                </p>
              ) : (
                <p className="campo__dica linha-calculo">
                  <Icone nome="info" tamanho={12} /> Sem saldo devedor não há o que corrigir: com o imóvel quitado, as
                  duas conclusões dão no mesmo.
                </p>
              )}
            </section>
          )}

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

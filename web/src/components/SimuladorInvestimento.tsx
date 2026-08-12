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
  anualDoIndice,
  mensalDoIndice,
  mesesAteAEntrega,
  mesesDoPrazo,
  saldoDevedorSugerido,
  simularInvestimento,
  taxaEfetivaAnual,
  textoDaConclusao,
  textoDoPrazo,
  type CondicaoDoFinanciamento,
  type Conclusao,
  type FinanciamentoChaves,
  type MesDaObra,
  type ResultadoInvestimento,
  type UnidadeIndice,
  type UnidadePrazo,
} from '../lib/investimento'
import { useIndicesDeMercado, type TaxaDoIndice } from '../lib/indicadores'
import { exportarPdfInvestimento, type ImovelDaSimulacao } from '../lib/exportarSimulacao'
import { precoDaUnidade, resumoUnidades, rotuloUnidade, valorM2Da, valorNoFluxo } from '../lib/unidades'
import { Campo, Modal } from './ui'
import { Icone, type NomeIcone } from './Icones'
import { GraficoLinha } from './GraficoSvg'

/** Expectativas de valorizacao que aparecem nas conversas de venda. */
const ATALHOS_VALORIZACAO = [5, 8, 10, 12, 15, 20]

/** Os mesmos percentuais mensais da calculadora do CUB. */
const ATALHOS_CUB = [0.35, 0.6, 0.7, 0.75, 1]
/** Ao ano os numeros redondos sao outros — o INCC costuma rodar nessa faixa. */
const ATALHOS_CUB_ANO = [4, 6, 8, 10, 12]

/**
 * O indice que corrige o saldo devedor DURANTE A OBRA. Um so por vez: sao duas
 * leituras alternativas do mesmo custo, e somar as duas nao existe no contrato.
 * 'nenhum' = simular so com os valores do empreendimento.
 */
type IndiceDaObra = 'nenhum' | 'cub' | 'incc'

/** O indexador do financiamento que comeca NAS CHAVES. */
type IndiceDasChaves = 'nenhum' | 'ipca' | 'igpm' | 'inpc' | 'cub'

interface OpcaoDeIndice<T> {
  valor: T
  rotulo: string
  /** A chave da serie no serviço de indicadores; ausente = o corretor digita. */
  serie?: string
  dica: string
}

const INDICES_DA_OBRA: OpcaoDeIndice<Exclude<IndiceDaObra, 'nenhum'>>[] = [
  { valor: 'cub', rotulo: 'CUB', dica: 'você informa o percentual do sindicato da sua região' },
  { valor: 'incc', rotulo: 'INCC', serie: 'incc', dica: 'puxado do Banco Central, sem digitar nada' },
]

const INDICES_DAS_CHAVES: OpcaoDeIndice<Exclude<IndiceDasChaves, 'nenhum'>>[] = [
  { valor: 'ipca', rotulo: 'IPCA', serie: 'ipca', dica: 'inflação oficial' },
  { valor: 'igpm', rotulo: 'IGP-M', serie: 'igpm', dica: 'índice geral de preços' },
  { valor: 'inpc', rotulo: 'INPC', serie: 'inpc', dica: 'inflação das famílias de menor renda' },
  { valor: 'cub', rotulo: 'CUB', dica: 'você informa o percentual' },
]

interface Formulario {
  valorCompra: string
  entrada: string
  saldoDevedor: string
  prazo: string
  unidadePrazo: UnidadePrazo
  valorizacao: string
  parcelaMensal: string
  parcelasRestantes: string
  reforcosQtd: string
  reforcoValor: string
  /* Durante a obra */
  indiceObra: IndiceDaObra
  cub: string
  unidadeCub: UnidadeIndice
  /* Chaves — o financiamento que comeca na entrega */
  indiceChaves: IndiceDasChaves
  cubChaves: string
  unidadeCubChaves: UnidadeIndice
  juroChaves: string
  prazoChaves: string
}

const VAZIO: Formulario = {
  valorCompra: '',
  entrada: '',
  saldoDevedor: '',
  prazo: '',
  unidadePrazo: 'meses',
  valorizacao: '',
  parcelaMensal: '',
  parcelasRestantes: '',
  reforcosQtd: '',
  reforcoValor: '',
  indiceObra: 'nenhum',
  cub: '',
  unidadeCub: 'mes',
  indiceChaves: 'nenhum',
  cubChaves: '',
  unidadeCubChaves: 'ano',
  juroChaves: '',
  prazoChaves: '',
}

/** O que as duas seções de índice resolveram — já em número, já na unidade certa. */
interface IndicesResolvidos {
  /** Correção da obra, em % ao mês. null = nenhum índice escolhido. */
  obraMensal: number | null
  /** Indexador do financiamento, em % ao ano. */
  chavesAnual: number | null
}

function validar(form: Formulario, indices: IndicesResolvidos) {
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

  /* --- Durante a obra ------------------------------------------------ */

  // O percentual so e cobrado no CUB: o INCC vem pronto do Banco Central, e
  // no 'nenhum' o campo nem existe.
  if (form.indiceObra === 'cub') {
    const digitado = lerNumero(form.cub)
    // O teto muda com a unidade: 20% ao mes e absurdo, 20% ao ano e rotina.
    const teto = form.unidadeCub === 'mes' ? 20 : 100
    if (digitado === null) erros.cub = `Informe o percentual do CUB (% ao ${form.unidadeCub})`
    else if (digitado < 0) erros.cub = 'O percentual não pode ser negativo'
    else if (digitado > teto) erros.cub = `Percentual acima de ${teto}% ao ${form.unidadeCub} — confira`
  } else if (form.indiceObra === 'incc' && indices.obraMensal === null) {
    erros.indiceObra = 'O INCC não respondeu agora — escolha o CUB e informe o percentual'
  }

  /* --- Chaves (financiamento) ---------------------------------------- */

  let financiamento: CondicaoDoFinanciamento | null = null
  if (form.indiceChaves !== 'nenhum') {
    if (form.indiceChaves === 'cub') {
      const digitado = lerNumero(form.cubChaves)
      const teto = form.unidadeCubChaves === 'mes' ? 20 : 100
      if (digitado === null) erros.cubChaves = `Informe o percentual do CUB (% ao ${form.unidadeCubChaves})`
      else if (digitado < 0) erros.cubChaves = 'O percentual não pode ser negativo'
      else if (digitado > teto) erros.cubChaves = `Percentual acima de ${teto}% ao ${form.unidadeCubChaves} — confira`
    } else if (indices.chavesAnual === null) {
      erros.indiceChaves = 'Este índice não respondeu agora — escolha outro ou use o CUB'
    }

    const juro = lerNumero(form.juroChaves)
    if (juro === null) erros.juroChaves = 'Informe o juro do banco ou da construtora (% ao ano)'
    else if (juro < 0) erros.juroChaves = 'O juro não pode ser negativo'
    else if (juro > 50) erros.juroChaves = 'Juro acima de 50% ao ano — confira'

    const anos = lerNumero(form.prazoChaves)
    if (anos === null || anos <= 0) erros.prazoChaves = 'Informe o prazo do financiamento (anos)'
    else if (anos > 40) erros.prazoChaves = 'No máximo 40 anos'

    if (indices.chavesAnual !== null && juro !== null && anos !== null && anos > 0) {
      financiamento = { indiceAnual: indices.chavesAnual, juroAnual: juro, anos }
    }
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
  const saldoDevedor = opcional('saldoDevedor', 'Saldo devedor')
  const parcelaMensal = opcional('parcelaMensal', 'Valor da parcela')
  const parcelasRestantes = opcional('parcelasRestantes', 'Número de parcelas')
  const reforcosQtd = opcional('reforcosQtd', 'Quantidade de reforços')
  const reforcoValor = opcional('reforcoValor', 'Valor do reforço')

  if (Object.keys(erros).length > 0) return { erros, entrada: null }

  return {
    erros,
    entrada: {
      valorCompra: valorCompra as number,
      entrada,
      // O que ja saiu do bolso e a entrada: e ela que a rentabilidade compara
      // com o patrimonio no fim.
      valorPago: entrada,
      saldoDevedor,
      prazo: prazo as number,
      unidadePrazo: form.unidadePrazo,
      valorizacaoAnual: valorizacao as number,
      parcelaMensal,
      parcelasRestantes: parcelasRestantes || null,
      reforcosQtd,
      reforcoValor,
      cubMensal: indices.obraMensal,
      financiamento,
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

/**
 * A leitura publicada de um indice, quando quem escolhe nao digita nada.
 *
 * Mostra as DUAS formas do numero (12 meses e o equivalente mensal) porque e o
 * mensal que entra na conta da obra, e uma tela que so exibisse "6,46% ao ano"
 * deixaria o corretor sem saber de onde saiu o 0,52% do cronograma.
 */
function TaxaAutomatica({
  taxa,
  carregando,
  mensalUsado,
  periodo,
}: {
  taxa: TaxaDoIndice | null
  carregando: boolean
  mensalUsado: number | null
  periodo: number | null
}) {
  if (carregando && !taxa) {
    return (
      <p className="campo__dica linha-calculo">
        <Icone nome="spinner" tamanho={12} className="girando" /> Consultando o índice no Banco Central…
      </p>
    )
  }

  if (!taxa || taxa.anual === null) {
    return (
      <p className="campo__dica linha-calculo linha-calculo--alerta">
        <Icone nome="alerta" tamanho={12} /> Não foi possível ler este índice agora. Escolha o CUB e informe o
        percentual à mão.
      </p>
    )
  }

  return (
    <div className="taxa-automatica">
      <div className="taxa-automatica__numero">
        <span className="taxa-automatica__valor">{fmtPercentual(taxa.anual, 2)}</span>
        <span className="taxa-automatica__unidade">ao ano · acumulado de 12 meses</span>
      </div>
      <ul className="taxa-automatica__linhas">
        <li>
          <span>Na conta da obra</span>
          <strong>{mensalUsado !== null ? `${fmtPercentual(mensalUsado, 4)} ao mês` : TRACO}</strong>
        </li>
        <li>
          <span>Último mês publicado</span>
          <strong>{fmtPercentual(taxa.mensalPublicado, 2)}</strong>
        </li>
        {periodo !== null && (
          <li>
            <span>Correção no período</span>
            <strong>{fmtPercentual(periodo, 2)}</strong>
          </li>
        )}
      </ul>
      <p className="campo__dica">
        {taxa.defasado ? (
          <>
            <Icone nome="alerta" tamanho={12} /> A série não respondeu na última consulta — leitura de{' '}
            {taxa.referencia}.
          </>
        ) : (
          <>
            <Icone nome="info" tamanho={12} /> Fonte: Banco Central · leitura de {taxa.referencia}. O simulador projeta
            pelos <strong>12 meses</strong>, não pelo mês corrente — um mês atípico distorceria a obra inteira.
          </>
        )}
      </p>
    </div>
  )
}

/** O financiamento das chaves, na tela e no mesmo formato do PDF. */
function QuadroFinanciamento({
  financiamento,
  titulo,
  dica,
  destaque = false,
}: {
  financiamento: FinanciamentoChaves
  titulo: string
  dica: string
  destaque?: boolean
}) {
  return (
    <article className={`inv-conclusao${destaque ? ' inv-conclusao--cub' : ''}`}>
      <header className="inv-conclusao__topo">
        <span className="inv-conclusao__titulo">
          <Icone nome="chave" tamanho={13} />
          {titulo}
        </span>
        <span className="inv-conclusao__dica">{dica}</span>
      </header>

      <dl className="inv-conclusao__linhas">
        <div className="inv-conclusao__linha">
          <dt>Saldo financiado</dt>
          <dd>{fmtMoeda(financiamento.saldoFinanciado)}</dd>
        </div>
        <div className="inv-conclusao__linha">
          <dt>Taxa efetiva</dt>
          <dd>
            {fmtPercentual(financiamento.efetivaAnual, 2)} a.a.
            <span className="inv-conclusao__nota">{fmtPercentual(financiamento.efetivaMensal, 4)} a.m.</span>
          </dd>
        </div>
        <div className="inv-conclusao__linha">
          <dt>Parcela (Price)</dt>
          <dd>{fmtMoeda(financiamento.price.parcela)}</dd>
        </div>
        <div className="inv-conclusao__linha">
          <dt>Total pago (Price)</dt>
          <dd>{fmtMoeda(financiamento.price.total)}</dd>
        </div>
        <div className="inv-conclusao__linha">
          <dt>1ª parcela (SAC)</dt>
          <dd>
            {fmtMoeda(financiamento.sac.primeira)}
            <span className="inv-conclusao__nota">última {fmtMoeda(financiamento.sac.ultima)}</span>
          </dd>
        </div>
        <div className="inv-conclusao__linha">
          <dt>Total pago (SAC)</dt>
          <dd>{fmtMoeda(financiamento.sac.total)}</dd>
        </div>
      </dl>

      <p className="inv-conclusao__frase">
        {fmtMoeda(financiamento.saldoFinanciado)} em {textoDoPrazo(financiamento.meses)} a{' '}
        {fmtPercentual(financiamento.efetivaAnual, 2)} ao ano: a Price começa em{' '}
        {fmtMoeda(financiamento.price.parcela)} por mês e não muda; a SAC começa em{' '}
        {fmtMoeda(financiamento.sac.primeira)} e cai até {fmtMoeda(financiamento.sac.ultima)}, custando{' '}
        {fmtMoeda(financiamento.price.total - financiamento.sac.total)} a menos no total.
      </p>
    </article>
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
    // Com parcelas na conta, os dois cenarios desembolsam valores diferentes
    // (a parcela tambem e reajustada) — sem essas duas linhas a comparacao
    // esconderia metade do custo do indice.
    ...(conclusao.pagoNoPeriodo > 0
      ? [
          { rotulo: 'Pago durante a obra', valor: fmtMoeda(conclusao.pagoNoPeriodo) },
          { rotulo: 'Investido até a entrega', valor: fmtMoeda(conclusao.investidoTotal) },
        ]
      : []),
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

/**
 * Uma linha por ano de obra (mais o ultimo mes) — obra de 36 meses vira 4
 * linhas, e quem quiser conferir mes a mes abre a tabela inteira.
 */
function resumirObra(linhas: MesDaObra[]): MesDaObra[] {
  if (linhas.length <= 13) return linhas
  const marcos = linhas.filter((linha) => linha.mes % 12 === 0)
  const ultima = linhas[linhas.length - 1]
  return marcos.some((linha) => linha.mes === ultima.mes) ? marcos : [...marcos, ultima]
}

/** A obra mes a mes: quanto a divida subiu pelo indice e quanto foi abatido. */
function TabelaDaObra({ resultado }: { resultado: ResultadoInvestimento }) {
  const [tudo, setTudo] = useState(false)

  // Com CUB, a tabela mostra o cenario corrigido — e o que vai ser cobrado.
  const cronograma = resultado.cub?.evolucao ?? resultado.evolucao
  const semIndice = resultado.evolucao
  const comCub = resultado.cub !== null
  const linhas = tudo ? cronograma : resumirObra(cronograma)
  const resumida = linhas.length < cronograma.length

  const ultima = cronograma[cronograma.length - 1]

  return (
    <>
      <div className="tabela-cub__area" style={{ marginTop: 'var(--e4)' }}>
        <table className="tabela-cub">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Saldo no início</th>
              {comCub && <th>Correção</th>}
              <th>Pago no mês</th>
              <th>Saldo no fim</th>
              {comCub && <th>Sem correção</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.mes}>
                <td>{linha.mes}</td>
                <td>{fmtMoeda(linha.saldoInicial)}</td>
                {comCub && <td className="tabela-cub__reajuste">{fmtMoeda(linha.correcao)}</td>}
                <td>{linha.pagamento > 0 ? fmtMoeda(linha.pagamento) : TRACO}</td>
                <td className="tabela-cub__forte">{fmtMoeda(linha.saldoFinal)}</td>
                {comCub && <td>{fmtMoeda(semIndice[linha.mes - 1]?.saldoFinal)}</td>}
              </tr>
            ))}
          </tbody>
          {ultima && (
            <tfoot>
              <tr>
                <td>Entrega</td>
                <td />
                {comCub && <td className="tabela-cub__reajuste">{fmtMoeda(ultima.correcaoAcumulada)}</td>}
                <td>{fmtMoeda(ultima.pagoAcumulado)}</td>
                <td className="tabela-cub__forte">{fmtMoeda(ultima.saldoFinal)}</td>
                {comCub && <td>{fmtMoeda(semIndice[semIndice.length - 1]?.saldoFinal)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(resumida || tudo) && (
        <p className="campo__dica linha-calculo">
          <Icone nome="info" tamanho={12} />
          {resumida ? 'Uma linha por ano de obra.' : `Todos os ${cronograma.length} meses.`}
          <button type="button" className="link-acao" onClick={() => setTudo(!tudo)}>
            {tudo ? 'Resumir por ano' : 'Ver mês a mês'}
          </button>
        </p>
      )}
    </>
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
  // Sem unidade escolhida, o preco veio da mais barata: a tabela de venda tem
  // de vir da MESMA unidade, senao a parcela seria de um imovel e o preco de
  // outro.
  const referencia = unidade ?? unidadeMaisBarata(empreendimento)
  // Entrada cadastrada em algum fluxo daquele imovel (o da unidade tem prioridade).
  const fluxos = [...(referencia?.fluxos ?? []), ...empreendimento.fluxos]
  const entradaValor = fluxos.find((f) => f.entrada_valor !== null)?.entrada_valor ?? null
  const entradaPct = fluxos.find((f) => f.entrada_pct !== null)?.entrada_pct ?? null
  const entrada =
    entradaValor ?? (entradaPct !== null && valorCompra !== null ? (valorCompra * entradaPct) / 100 : null)

  // O parcelamento sai da mesma tabela de venda: e o que a obra ainda vai
  // consumir do bolso do cliente, e sem isso a divida ficava parada ate a
  // entrega — o erro que inflava a leitura com CUB.
  const comParcela = fluxos.find((f) => f.parcela_valor !== null)
  const comReforco = fluxos.find((f) => f.reforco_valor !== null)

  return {
    valorCompra,
    meses,
    entrada,
    parcelaMensal: comParcela?.parcela_valor ?? null,
    parcelasRestantes: comParcela?.parcelas ?? null,
    reforcosQtd: comReforco?.reforcos_qtd ?? null,
    reforcoValor: comReforco?.reforco_valor ?? null,
  }
}

/**
 * Sem unidade escolhida, vale a unidade mais barata; sem preco em nenhuma
 * delas, o valor do m² pela menor metragem. A tabela geral do empreendimento
 * entra antes do palpite do m²: la o preco foi digitado, aqui e conta.
 */
/** A unidade de menor preco — a que o "Empreendimento" do seletor representa. */
function unidadeMaisBarata(e: Empreendimento): Unidade | null {
  const comPreco = e.unidades.filter((u) => precoDaUnidade(u) !== null)
  if (comPreco.length === 0) return null
  return comPreco.reduce((menor, atual) =>
    (precoDaUnidade(atual) as number) < (precoDaUnidade(menor) as number) ? atual : menor,
  )
}

function valorDoEmpreendimento(e: Empreendimento): number | null {
  const valores = e.unidades.map(precoDaUnidade).filter((v): v is number => v !== null)
  if (valores.length > 0) return Math.min(...valores)

  const daTabela = valorNoFluxo(e.fluxos)
  if (daTabela !== null) return daTabela

  if (e.valor_m2 !== null && e.metragem_min !== null) return e.valor_m2 * e.metragem_min
  return null
}

/** Numero cadastrado que vira texto de campo; null mantem o que ja estava. */
function ouMantem(valor: number | null, atual: string): string {
  return valor !== null && Number.isFinite(valor) ? String(Math.round(valor)) : atual
}

/** Aplica sobre o formulario o que o imovel escolhido sabe preencher. */
function comImovel(base: Formulario, alvo: Empreendimento | null, unidadeAlvo: Unidade | null): Formulario {
  if (!alvo) return base
  const dados = dadosDoImovel(alvo, unidadeAlvo)

  return {
    ...base,
    valorCompra: ouMantem(dados.valorCompra, base.valorCompra),
    prazo: dados.meses !== null ? String(dados.meses) : base.prazo,
    unidadePrazo: dados.meses !== null ? 'meses' : base.unidadePrazo,
    entrada: ouMantem(dados.entrada, base.entrada),
    parcelaMensal: ouMantem(dados.parcelaMensal, base.parcelaMensal),
    parcelasRestantes: ouMantem(dados.parcelasRestantes, base.parcelasRestantes),
    reforcosQtd: ouMantem(dados.reforcosQtd, base.reforcosQtd),
    reforcoValor: ouMantem(dados.reforcoValor, base.reforcoValor),
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

  // Os indices publicados (INCC, IPCA, IGP-M, INPC) — a consulta ao Banco
  // Central e do servidor, com cache; aqui e so leitura.
  const { taxas, carregando: carregandoIndices } = useIndicesDeMercado()

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

  /** Valor de compra menos a entrada — enquanto ninguem sobrescreve o campo. */
  const saldoAutomatico = useMemo(
    () => saldoDevedorSugerido(lerNumero(form.valorCompra), lerNumero(form.entrada)),
    [form.valorCompra, form.entrada],
  )
  const saldoNoCampo = saldoManual
    ? form.saldoDevedor
    : saldoAutomatico !== null
      ? textoDoValor(saldoAutomatico)
      : ''

  /** A taxa publicada de uma serie, ou null quando ela nao respondeu. */
  const taxaDaSerie = (chave: string | undefined): TaxaDoIndice | null =>
    chave ? taxas[chave] ?? null : null

  const incc = taxaDaSerie('incc')

  /**
   * O indice da obra sempre em % ao mes — e nessa unidade que a obra e
   * simulada. O CUB vem do campo; o INCC vem do acumulado de 12 meses do
   * Banco Central, convertido por raiz.
   */
  const cubMensal = useMemo(() => {
    if (form.indiceObra === 'cub') {
      const percentual = lerNumero(form.cub)
      return percentual === null ? null : mensalDoIndice(percentual, form.unidadeCub)
    }
    if (form.indiceObra === 'incc') {
      return incc?.anual !== null && incc?.anual !== undefined ? mensalDoIndice(incc.anual, 'ano') : null
    }
    return null
  }, [form.indiceObra, form.cub, form.unidadeCub, incc])

  const indiceDasChaves = useMemo(
    () => INDICES_DAS_CHAVES.find((opcao) => opcao.valor === form.indiceChaves) ?? null,
    [form.indiceChaves],
  )
  const taxaDasChaves = taxaDaSerie(indiceDasChaves?.serie)

  /** O indexador do financiamento, em % ao ano. */
  const indiceChavesAnual = useMemo(() => {
    if (form.indiceChaves === 'nenhum') return null
    if (form.indiceChaves === 'cub') {
      const percentual = lerNumero(form.cubChaves)
      if (percentual === null) return null
      // Digitado ao mes, vira anual por composicao — 0,6% ao mes sao 7,44% ao ano.
      return form.unidadeCubChaves === 'ano' ? percentual : anualDoIndice(percentual)
    }
    return taxaDasChaves?.anual ?? null
  }, [form.indiceChaves, form.cubChaves, form.unidadeCubChaves, taxaDasChaves])

  const indicesResolvidos: IndicesResolvidos = { obraMensal: cubMensal, chavesAnual: indiceChavesAnual }

  /**
   * A previa do financiamento enquanto se digita — antes mesmo de simular. E o
   * numero que o corretor quer ver na hora: "sai a X% ao ano".
   */
  const efetivaDasChaves = useMemo(() => {
    const juro = lerNumero(form.juroChaves)
    if (indiceChavesAnual === null || juro === null) return null
    return taxaEfetivaAnual(indiceChavesAnual, juro)
  }, [indiceChavesAnual, form.juroChaves])

  /**
   * O indice acumulado no periodo inteiro: 0,60% ao mes por 36 meses viram 24%
   * de correcao. Mostrar isso antes de simular evita a surpresa de ver a
   * divida crescer tanto — e denuncia na hora quem digitou o anual no mensal.
   */
  const cubNoPeriodo = useMemo(() => {
    const prazo = lerNumero(form.prazo)
    if (cubMensal === null || prazo === null) return null
    return (Math.pow(1 + cubMensal / 100, mesesDoPrazo(prazo, form.unidadePrazo)) - 1) * 100
  }, [cubMensal, form.prazo, form.unidadePrazo])

  /**
   * O que ainda vai ser pago ate a entrega, sem correcao nenhuma. Serve de
   * conferencia: parcela × meses + reforcos, o numero que o corretor tem na
   * cabeca ao olhar a tabela de venda.
   */
  const pagamentoPrevisto = useMemo(() => {
    const prazo = lerNumero(form.prazo)
    if (prazo === null) return null
    const meses = mesesDoPrazo(prazo, form.unidadePrazo)
    const parcela = lerNumero(form.parcelaMensal) ?? 0
    const quantas = Math.min(meses, lerNumero(form.parcelasRestantes) ?? meses)
    const reforcos = (lerNumero(form.reforcosQtd) ?? 0) * (lerNumero(form.reforcoValor) ?? 0)
    const total = parcela * Math.max(0, quantas) + reforcos
    return total > 0 ? { total, meses: Math.max(0, quantas) } : null
  }, [form.prazo, form.unidadePrazo, form.parcelaMensal, form.parcelasRestantes, form.reforcosQtd, form.reforcoValor])

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
    const { erros: novosErros, entrada } = validar({ ...form, saldoDevedor: saldoNoCampo }, indicesResolvidos)
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

  /**
   * Os botoes de indice funcionam como radio, com uma diferenca: clicar no que
   * ja esta ativo DESLIGA. Sem isso nao haveria como voltar para "simular so
   * com os valores do empreendimento" depois de espiar um indice.
   */
  function escolherIndiceObra(valor: Exclude<IndiceDaObra, 'nenhum'>) {
    setForm((atual) => {
      const novo = atual.indiceObra === valor ? 'nenhum' : valor
      // Trocar de indice nao pode deixar o percentual do outro pendurado.
      return { ...atual, indiceObra: novo, cub: novo === 'cub' ? atual.cub : '' }
    })
    setErros((atual) => ({ ...atual, cub: '', indiceObra: '' }))
  }

  function escolherIndiceChaves(valor: Exclude<IndiceDasChaves, 'nenhum'>) {
    setForm((atual) => {
      const novo = atual.indiceChaves === valor ? 'nenhum' : valor
      return { ...atual, indiceChaves: novo, cubChaves: novo === 'cub' ? atual.cubChaves : '' }
    })
    setErros((atual) => ({ ...atual, cubChaves: '', indiceChaves: '', juroChaves: '', prazoChaves: '' }))
  }

  function aoExportarPdf() {
    if (!resultado) return
    const abriu = exportarPdfInvestimento(resultado, imovelParaPdf(empreendimento, unidade))
    if (!abriu) avisar('O navegador bloqueou a janela de impressão — libere os pop-ups do site', 'erro')
  }

  const pontos = useMemo(
    () =>
      (resultado?.evolucaoValor ?? []).map((ponto) => ({
        rotulo: ponto.mes === 0 ? 'Hoje' : `Mês ${ponto.mes}`,
        valor: ponto.valor,
        detalhe:
          ponto.mes === 0
            ? 'valor de compra'
            : `${fmtPercentual((ponto.valor / (resultado?.valorCompra || 1) - 1) * 100, 2)} de valorização`,
      })),
    [resultado],
  )

  /**
   * A divida mes a mes. Com CUB, a linha mostrada e a corrigida — e ela que o
   * cliente vai pagar; a leitura sem indice fica na tabela, lado a lado.
   */
  const pontosDaDivida = useMemo(() => {
    const cronograma = resultado?.cub?.evolucao ?? resultado?.evolucao ?? []
    if (!resultado || cronograma.length === 0) return []
    const passo = cronograma.length <= 48 ? 1 : cronograma.length <= 120 ? 3 : 12

    const inicio = {
      rotulo: 'Hoje',
      valor: resultado.saldoDevedorHoje,
      detalhe: 'saldo devedor de hoje',
    }
    const linhas = cronograma
      .filter((_, indice) => indice % passo === 0 || indice === cronograma.length - 1)
      .map((linha) => ({
        rotulo: `Mês ${linha.mes}`,
        valor: linha.saldoFinal,
        detalhe: `${fmtMoeda(linha.pagoAcumulado)} pagos · ${fmtMoeda(linha.correcaoAcumulada)} de correção`,
      }))
    return [inicio, ...linhas]
  }, [resultado])

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
                {mesesAteAEntrega(empreendimento.entrega) !== null ? ' e o prazo até a entrega prevista' : ''}, além da
                entrada e do parcelamento da tabela de venda. A valorização esperada continua com você — o saldo devedor
                sai da conta sozinho.
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

          <Campo
            rotulo="Saldo devedor"
            dica={saldoManual ? 'informado à mão' : 'valor de compra − entrada'}
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

        <p className="campo__dica" style={{ marginTop: 'var(--e3)' }}>
          <Icone nome="info" tamanho={12} /> A valorização é composta sobre o valor de compra e a expectativa é{' '}
          <strong>sua</strong> — esta é a única taxa que o simulador não busca no mercado. O saldo devedor já desconta
          a entrada; as parcelas que ainda vão ser pagas entram mais abaixo.
        </p>
      </section>

      {/* ---------------------------------------------------------------
          Durante a obra: qual índice corrige o saldo devedor até a entrega.
          Um OU outro — são duas leituras alternativas do mesmo custo, e no
          contrato só uma delas está escrita.
          --------------------------------------------------------------- */}
      <section className="form-secao">
        <h3 className="form-secao__titulo">
          <Icone nome="obra" tamanho={13} />
          Durante a obra
          <span className="form-secao__opcional">— opcional; sem índice a dívida não é corrigida</span>
        </h3>

        <p className="campo__dica">Selecione o índice que deseja calcular</p>

        <div className="seletor-indice" role="group" aria-label="Índice da obra">
          {INDICES_DA_OBRA.map((opcao) => {
            const ativa = form.indiceObra === opcao.valor
            const taxa = taxaDaSerie(opcao.serie)
            return (
              <button
                key={opcao.valor}
                type="button"
                className={`seletor-indice__opcao${ativa ? ' seletor-indice__opcao--ativa' : ''}`}
                aria-pressed={ativa}
                onClick={() => escolherIndiceObra(opcao.valor)}
                title={ativa ? 'Clique de novo para não usar índice nenhum' : undefined}
              >
                <span className="seletor-indice__nome">{opcao.rotulo}</span>
                <span className="seletor-indice__dica">
                  {opcao.serie
                    ? taxa?.anual !== null && taxa?.anual !== undefined
                      ? `${fmtPercentual(taxa.anual, 2)} ao ano`
                      : carregandoIndices
                        ? 'consultando…'
                        : 'indisponível agora'
                    : opcao.dica}
                </span>
              </button>
            )
          })}
        </div>

        {erros.indiceObra && (
          <p className="campo__dica linha-calculo linha-calculo--alerta">
            <Icone nome="alerta" tamanho={12} /> {erros.indiceObra}
          </p>
        )}

        {form.indiceObra === 'cub' && (
          <>
            <div className="grade">
              <Campo
                rotulo="Percentual do CUB"
                obrigatorio
                dica={
                  form.unidadeCub === 'mes'
                    ? cubMensal !== null
                      ? `${fmtPercentual(anualDoIndice(cubMensal), 2)} ao ano`
                      : 'como o índice é publicado'
                    : cubMensal !== null
                      ? `${fmtPercentual(cubMensal)} ao mês`
                      : 'convertido para o mês'
                }
                erro={erros.cub}
              >
                <div className="entrada-com-unidade">
                  <input
                    className={`entrada${erros.cub ? ' entrada--erro' : ''}`}
                    value={form.cub}
                    onChange={(e) => mudar('cub', e.target.value)}
                    placeholder={form.unidadeCub === 'mes' ? '0,60' : '7,5'}
                    inputMode="decimal"
                  />
                  <select
                    className="entrada"
                    value={form.unidadeCub}
                    onChange={(e) => mudar('unidadeCub', e.target.value)}
                    aria-label="Unidade do CUB"
                  >
                    <option value="mes">% ao mês</option>
                    <option value="ano">% ao ano</option>
                  </select>
                </div>
              </Campo>
            </div>

            <div className="atalhos-cub">
              <span className="campo__dica">CUB:</span>
              {(form.unidadeCub === 'mes' ? ATALHOS_CUB : ATALHOS_CUB_ANO).map((valor) => (
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
          </>
        )}

        {form.indiceObra === 'incc' && (
          <TaxaAutomatica taxa={incc} carregando={carregandoIndices} mensalUsado={cubMensal} periodo={cubNoPeriodo} />
        )}
      </section>

      {/* ---------------------------------------------------------------
          Chaves: o que sobra na entrega vai para o banco, corrigido por um
          índice e remunerado por um juro. Os dois se compõem — nunca somam.
          --------------------------------------------------------------- */}
      <section className="form-secao">
        <h3 className="form-secao__titulo">
          <Icone nome="chave" tamanho={13} />
          Chaves
          <span className="form-secao__opcional">— cálculo do financiamento; opcional</span>
        </h3>

        <p className="campo__dica">Selecione o índice que corrige o financiamento</p>

        <div className="seletor-indice seletor-indice--quatro" role="group" aria-label="Índice do financiamento">
          {INDICES_DAS_CHAVES.map((opcao) => {
            const ativa = form.indiceChaves === opcao.valor
            const taxa = taxaDaSerie(opcao.serie)
            return (
              <button
                key={opcao.valor}
                type="button"
                className={`seletor-indice__opcao${ativa ? ' seletor-indice__opcao--ativa' : ''}`}
                aria-pressed={ativa}
                onClick={() => escolherIndiceChaves(opcao.valor)}
                title={ativa ? 'Clique de novo para não calcular o financiamento' : opcao.dica}
              >
                <span className="seletor-indice__nome">{opcao.rotulo}</span>
                <span className="seletor-indice__dica">
                  {opcao.serie
                    ? taxa?.anual !== null && taxa?.anual !== undefined
                      ? `${fmtPercentual(taxa.anual, 2)} ao ano`
                      : carregandoIndices
                        ? 'consultando…'
                        : 'indisponível agora'
                    : opcao.dica}
                </span>
              </button>
            )
          })}
        </div>

        {erros.indiceChaves && (
          <p className="campo__dica linha-calculo linha-calculo--alerta">
            <Icone nome="alerta" tamanho={12} /> {erros.indiceChaves}
          </p>
        )}

        {form.indiceChaves !== 'nenhum' && (
          <>
            <div className="grade">
              {form.indiceChaves === 'cub' && (
                <Campo
                  rotulo="Percentual do CUB"
                  obrigatorio
                  dica={
                    indiceChavesAnual !== null
                      ? `${fmtPercentual(indiceChavesAnual, 2)} ao ano`
                      : 'a correção do contrato'
                  }
                  erro={erros.cubChaves}
                >
                  <div className="entrada-com-unidade">
                    <input
                      className={`entrada${erros.cubChaves ? ' entrada--erro' : ''}`}
                      value={form.cubChaves}
                      onChange={(e) => mudar('cubChaves', e.target.value)}
                      placeholder={form.unidadeCubChaves === 'mes' ? '0,60' : '7,5'}
                      inputMode="decimal"
                    />
                    <select
                      className="entrada"
                      value={form.unidadeCubChaves}
                      onChange={(e) => mudar('unidadeCubChaves', e.target.value)}
                      aria-label="Unidade do CUB das chaves"
                    >
                      <option value="mes">% ao mês</option>
                      <option value="ano">% ao ano</option>
                    </select>
                  </div>
                </Campo>
              )}

              <Campo
                rotulo="Juro do banco ou da construtora"
                obrigatorio
                dica="% ao ano"
                erro={erros.juroChaves}
              >
                {entradaMonetaria('juroChaves', '9,5')}
              </Campo>

              <Campo rotulo="Prazo do financiamento" obrigatorio dica="anos" erro={erros.prazoChaves}>
                {entradaMonetaria('prazoChaves', '30')}
              </Campo>
            </div>

            {efetivaDasChaves !== null ? (
              <p className="campo__dica linha-calculo">
                <Icone nome="info" tamanho={12} /> {indiceDasChaves?.rotulo} de{' '}
                {fmtPercentual(indiceChavesAnual ?? 0, 2)} com juro de {fmtPercentual(lerNumero(form.juroChaves) ?? 0, 2)}{' '}
                dão <strong>{fmtPercentual(efetivaDasChaves, 2)} ao ano</strong> (
                {fmtPercentual(mensalDoIndice(efetivaDasChaves, 'ano'), 4)} ao mês). As duas taxas se compõem sobre a
                mesma dívida — somar as duas subestimaria a parcela.
              </p>
            ) : (
              <p className="campo__dica linha-calculo">
                <Icone nome="info" tamanho={12} /> O financiamento é calculado sobre o saldo que sobrar na entrega.
                Preencha o juro e o prazo para ver a parcela.
              </p>
            )}
          </>
        )}
      </section>

      {/* O que ainda sai do bolso ate a entrega. E o que faz a divida andar:
          sem isso o saldo devedor ficava parado ate a entrega e a correcao do
          CUB era cobrada sobre o valor cheio o tempo todo. */}
      <section className="form-secao">
        <h3 className="form-secao__titulo">
          <Icone nome="cartao" tamanho={13} />
          Pagamentos até a entrega
          <span className="form-secao__opcional">— opcional; sem eles a dívida fica parada</span>
        </h3>

        <div className="grade">
          <Campo rotulo="Parcela mensal" dica="R$" erro={erros.parcelaMensal}>
            {entradaMonetaria('parcelaMensal', '2.500,00')}
          </Campo>

          <Campo
            rotulo="Parcelas restantes"
            dica={form.parcelaMensal.trim() ? 'em branco = até a entrega' : 'nº de parcelas'}
            erro={erros.parcelasRestantes}
          >
            {entradaMonetaria('parcelasRestantes', '24')}
          </Campo>

          <Campo rotulo="Reforços" dica="quantidade até a entrega" erro={erros.reforcosQtd}>
            {entradaMonetaria('reforcosQtd', '3')}
          </Campo>

          <Campo rotulo="Valor do reforço" dica="R$" erro={erros.reforcoValor}>
            {entradaMonetaria('reforcoValor', '15.000,00')}
          </Campo>
        </div>

        <p className="campo__dica linha-calculo">
          <Icone nome="info" tamanho={12} />
          {pagamentoPrevisto ? (
            <>
              Previsto até a entrega: <strong>{fmtMoeda(pagamentoPrevisto.total)}</strong> sem correção
              {pagamentoPrevisto.meses > 0 && ` (${pagamentoPrevisto.meses} parcelas)`}. Com o CUB marcado, cada parcela
              é reajustada pelo índice e o saldo devedor é corrigido antes de receber o pagamento — mês a mês, como a
              construtora faz.
            </>
          ) : (
            'Preencha a parcela mensal (e os reforços, se houver) para o saldo devedor evoluir durante a obra. Escolher uma unidade cadastrada acima já traz os números da tabela de venda.'
          )}
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
                rotulo="Investido até a entrega"
                valor={resultado.investidoTotal > 0 ? fmtMoeda(resultado.investidoTotal) : TRACO}
                dica={
                  resultado.pagoNoPeriodo > 0
                    ? `${fmtMoeda(resultado.valorPago)} já pagos + ${fmtMoeda(resultado.pagoNoPeriodo)} na obra`
                    : 'tudo que já saiu do bolso'
                }
                tom="marca"
              />
              <Cartao
                icone="chave"
                rotulo="Saldo na entrega"
                valor={resultado.saldoDevedor > 0 ? fmtMoeda(resultado.saldoDevedor) : 'quitado'}
                dica={
                  resultado.pagoNoPeriodo > 0
                    ? `de ${fmtMoeda(resultado.saldoDevedorHoje)} hoje, sem correção`
                    : 'a dívida fica parada sem parcelas'
                }
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
                dica={resultado.rentabilidade === null ? 'informe o valor já pago' : 'sobre o investido até a entrega'}
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
                  dica={`valorização de ${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano · ${
                    resultado.pagoNoPeriodo > 0 ? 'parcelas sem reajuste' : 'saldo devedor parado'
                  }`}
                  resultado={resultado}
                  conclusao={resultado}
                  rotuloSaldo="Saldo devedor"
                />
                <CartaoConclusao
                  titulo="Com o CUB"
                  icone="grafico"
                  dica={`a mesma valorização · ${fmtPercentual(resultado.cub.cubMensal)} ao mês sobre a dívida${
                    resultado.pagoNoPeriodo > 0 ? ' e sobre as parcelas' : ''
                  }`}
                  resultado={resultado}
                  conclusao={resultado.cub}
                  rotuloSaldo="Saldo corrigido"
                  destaque
                />
              </div>

              {resultado.saldoDevedorHoje > 0 ? (
                <p className="campo__dica linha-calculo">
                  <Icone nome="info" tamanho={12} /> O índice de {fmtPercentual(resultado.cub.cubMensal)} ao mês acumula{' '}
                  {fmtPercentual(resultado.cub.cubAcumulado, 2)} em {textoDoPrazo(resultado.meses)} e acrescenta{' '}
                  {fmtMoeda(resultado.cub.correcao)} à dívida ao longo da obra
                  {resultado.cub.custoNoDesembolso > 0.5 &&
                    ` — ${fmtMoeda(resultado.cub.custoNoDesembolso)} disso sai do bolso nas parcelas reajustadas`}
                  . No fim, o patrimônio líquido é {fmtMoeda(resultado.cub.custoNoPatrimonio)} menor. A valorização do
                  imóvel é a mesma nas duas leituras — o que muda é a dívida.
                </p>
              ) : (
                <p className="campo__dica linha-calculo">
                  <Icone nome="info" tamanho={12} /> Sem saldo devedor não há o que corrigir: com o imóvel quitado, as
                  duas conclusões dão no mesmo.
                </p>
              )}
            </section>
          )}

          {/* O que acontece DEPOIS da entrega: o saldo que sobra vira
              financiamento, e a parcela e a pergunta que o cliente faz. */}
          {(resultado.financiamento || resultado.cub?.financiamento) && (
            <section className="form-secao">
              <h3 className="form-secao__titulo">
                <Icone nome="chave" tamanho={13} />
                Financiamento nas chaves
                <span className="form-secao__complemento">
                  — {indiceDasChaves?.rotulo} + juro de {fmtPercentual(lerNumero(form.juroChaves) ?? 0, 2)} ao ano
                </span>
              </h3>

              <div className="inv-conclusoes">
                {resultado.financiamento && (
                  <QuadroFinanciamento
                    financiamento={resultado.financiamento}
                    titulo={resultado.cub ? 'Sem correção na obra' : 'Financiamento na entrega'}
                    dica={`${textoDoPrazo(resultado.financiamento.meses)} · sobre o saldo da entrega`}
                  />
                )}
                {resultado.cub?.financiamento && (
                  <QuadroFinanciamento
                    financiamento={resultado.cub.financiamento}
                    titulo="Com a obra corrigida"
                    dica={`a dívida chega maior nas chaves · ${textoDoPrazo(resultado.cub.financiamento.meses)}`}
                    destaque
                  />
                )}
              </div>

              {resultado.financiamento && resultado.cub?.financiamento && (
                <p className="campo__dica linha-calculo">
                  <Icone nome="info" tamanho={12} /> A correção da obra acrescenta{' '}
                  {fmtMoeda(
                    resultado.cub.financiamento.saldoFinanciado - resultado.financiamento.saldoFinanciado,
                  )}{' '}
                  ao que vai ser financiado — e{' '}
                  {fmtMoeda(resultado.cub.financiamento.price.parcela - resultado.financiamento.price.parcela)} por mês
                  na parcela da Price, por {textoDoPrazo(resultado.cub.financiamento.meses)}.
                </p>
              )}
            </section>
          )}

          {/* A obra mes a mes: e aqui que se ve a divida subir pelo indice e
              cair pelo pagamento, em vez de so o numero final. */}
          {resultado.evolucao.length > 0 && resultado.saldoDevedorHoje > 0 && (
            <section className="form-secao">
              <h3 className="form-secao__titulo">
                <Icone nome="chave" tamanho={13} />
                Evolução do saldo devedor
                <span className="form-secao__complemento">
                  {resultado.cub ? '— com a correção do índice' : '— sem correção'}
                </span>
              </h3>

              <GraficoLinha
                titulo="Saldo devedor até a entrega"
                descricao={`de ${fmtMoeda(resultado.saldoDevedorHoje)} a ${fmtMoeda(
                  (resultado.cub ?? resultado).saldoDevedor,
                )}`}
                pontos={pontosDaDivida}
                formatar={(v) => fmtMoeda(v)}
                formatarEixo={fmtMoedaCurta}
              />

              <TabelaDaObra resultado={resultado} />
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

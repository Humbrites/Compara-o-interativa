import type { Simulacao } from './cub'
import { fmtPercentual } from './cub'
import { fmtMoeda, fmtNumero, TRACO } from './format'
import { textoDaConclusao, textoDoPrazo, type Conclusao, type ResultadoInvestimento } from './investimento'

/**
 * Exportacoes sem biblioteca externa:
 * - Excel: CSV com BOM e ";" — o que o Excel pt-BR abre com dois cliques.
 * - PDF: janela de impressao do proprio navegador ("Salvar como PDF"), com o
 *   resumo e a tabela mes a mes. Os graficos ficam so na tela: no papel eles
 *   ocupavam o espaco que a tabela usa melhor.
 */

function baixar(conteudo: BlobPart, nomeArquivo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Deixa o navegador terminar o download antes de soltar o objeto.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Numero em pt-BR sem simbolo, para a celula ficar numerica no Excel. */
function numero(valor: number, casas = 2): string {
  return valor.toFixed(casas).replace('.', ',')
}

/** Texto do usuario dentro do HTML da folha impressa. */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nomeBase(titulo: string): string {
  const limpo = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return limpo || 'simulacao-cub'
}

export function exportarCsv(simulacao: Simulacao, titulo: string) {
  const { linhas, resumo } = simulacao

  const conteudo = [
    ['Simulação de reajuste pelo CUB'],
    [titulo],
    [],
    ['Valor do imóvel', resumo.valorImovel === null ? 'não informado' : numero(resumo.valorImovel)],
    ['Valor de entrada', numero(resumo.entrada)],
    ['Saldo após a entrada', resumo.saldo === null ? 'não informado' : numero(resumo.saldo)],
    ['Meses restantes de obra', String(resumo.meses)],
    ['Parcela inicial', numero(resumo.parcelaInicial)],
    ['Índice aplicado', resumo.fonte],
    ['Parcela final', numero(resumo.parcelaFinal)],
    ['Total pago durante a obra (parcelas)', numero(resumo.totalPago)],
    ['Entrada + parcelas', numero(resumo.totalDesembolsado)],
    ['Saldo na entrega', resumo.saldoAoFimDaObra === null ? 'não informado' : numero(resumo.saldoAoFimDaObra)],
    ['Total sem reajuste', numero(resumo.totalSemReajuste)],
    ['Total de reajuste', numero(resumo.totalReajuste)],
    ['Reajuste acumulado na parcela (%)', numero(resumo.percentualAcumulado)],
    [],
    ['Mês', 'Parcela antes', '% CUB', 'Valor do reajuste', 'Parcela atual', 'Acumulado pago'],
    ...linhas.map((linha) => [
      String(linha.mes),
      numero(linha.parcelaAntes),
      numero(linha.percentual, 4),
      numero(linha.reajuste),
      numero(linha.parcelaAtual),
      numero(linha.acumuladoPago),
    ]),
  ]
    .map((colunas) => colunas.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  // O BOM e o que faz o Excel entender os acentos.
  baixar(`\ufeff${conteudo}`, `${nomeBase(titulo)}.csv`, 'text/csv;charset=utf-8')
}

/** Estilos da folha impressa — a janela nova nao herda o CSS do app. */
const ESTILO_IMPRESSAO = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
         color: #161d2e; margin: 28px; font-size: 12px; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .sub { color: #4d5871; font-size: 12.5px; margin-bottom: 18px; }
  .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .item { border: 1px solid #e3e8f0; border-radius: 8px; padding: 8px 10px; }
  .rotulo { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #7b8599; }
  .valor { font-size: 14px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #e3e8f0; text-align: right;
           font-variant-numeric: tabular-nums; }
  th { background: #f0f3f8; font-size: 9.5px; text-transform: uppercase;
       letter-spacing: .04em; color: #4d5871; }
  th:first-child, td:first-child { text-align: left; }
  tfoot td { font-weight: 700; border-top: 2px solid #cfd7e5; }
  @page { margin: 14mm; }
  @media print { thead { display: table-header-group; } tr { break-inside: avoid; } }

  /* Blocos da apresentacao de investimento. */
  h2 { font-size: 15px; margin: 0 0 2px; }
  .secao { margin-bottom: 18px; break-inside: avoid; }
  .secao__titulo { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
                   color: #7b8599; font-weight: 700; margin: 0 0 8px;
                   border-bottom: 1px solid #e3e8f0; padding-bottom: 4px; }
  .imovel { border: 1px solid #e3e8f0; border-left: 3px solid #2f6df6; border-radius: 8px;
            padding: 10px 12px; margin-bottom: 18px; }
  .imovel__linha { color: #4d5871; font-size: 11.5px; margin-bottom: 8px; }
  .imovel .resumo { grid-template-columns: repeat(4, 1fr); margin: 0; gap: 8px; }
  .hero { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 18px; }
  .hero__principal, .hero__lado { border-radius: 8px; padding: 12px 14px; }
  .hero__principal { background: #1b3a7a; color: #fff; }
  .hero__lado { border: 1px solid #bfe3c9; background: #f0faf3; color: #1d6b3a; }
  .hero__rotulo { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; opacity: .85; }
  .hero__valor { font-size: 24px; font-weight: 700; line-height: 1.2; }
  .hero__valor--menor { font-size: 19px; }
  .hero__dica { font-size: 10.5px; opacity: .9; }
  .nota { color: #7b8599; font-size: 10px; line-height: 1.5; margin-top: 14px;
          border-top: 1px solid #e3e8f0; padding-top: 8px; }

  /* As duas conclusoes (com e sem CUB), lado a lado como na tela. */
  .conclusoes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .conclusao { border: 1px solid #e3e8f0; border-radius: 8px; padding: 10px 12px; }
  .conclusao--cub { border-color: #d97706; background: #fef4e6; }
  .conclusao__titulo { font-size: 13px; font-weight: 700; }
  .conclusao--cub .conclusao__titulo { color: #d97706; }
  .conclusao__dica { font-size: 10px; color: #7b8599; margin-bottom: 8px; }
  .conclusao__linha { display: flex; justify-content: space-between; gap: 10px;
                      font-size: 11.5px; padding: 2px 0; }
  .conclusao__linha b { font-variant-numeric: tabular-nums; }
  .conclusao__frase { margin: 8px 0 0; padding-top: 6px; border-top: 1px solid #e3e8f0;
                      font-size: 10.5px; line-height: 1.5; color: #4d5871; }
  .conclusao--cub .conclusao__frase { border-top-color: #d97706; }
`

export function exportarPdf(simulacao: Simulacao, titulo: string) {
  const { linhas, resumo } = simulacao

  const item = (rotulo: string, valor: string) =>
    `<div class="item"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div></div>`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${esc(titulo)} — simulação CUB</title>
  <style>${ESTILO_IMPRESSAO}</style>
</head>
<body>
  <h1>Simulação de reajuste pelo CUB</h1>
  <div class="sub">${esc(titulo)} · ${resumo.fonte} · ${resumo.meses} meses de obra${
    resumo.entrada > 0 ? ` · entrada de ${fmtMoeda(resumo.entrada)}` : ''
  }</div>

  <div class="resumo">
    ${item('Valor do imóvel', resumo.valorImovel === null ? '—' : fmtMoeda(resumo.valorImovel))}
    ${item('Entrada', resumo.entrada > 0 ? fmtMoeda(resumo.entrada) : '—')}
    ${item('Saldo após a entrada', resumo.saldo === null ? '—' : fmtMoeda(resumo.saldo, true))}
    ${item('Meses restantes', String(resumo.meses))}
    ${item('Parcela inicial', fmtMoeda(resumo.parcelaInicial, true))}
    ${item('Parcela final', fmtMoeda(resumo.parcelaFinal, true))}
    ${item('Reajuste acumulado', fmtPercentual(resumo.percentualAcumulado, 2))}
    ${item('Total de reajuste', fmtMoeda(resumo.totalReajuste, true))}
    ${item('Total pago na obra', fmtMoeda(resumo.totalPago, true))}
    ${item('Entrada + parcelas', fmtMoeda(resumo.totalDesembolsado, true))}
    ${item(
      resumo.saldoAoFimDaObra !== null && resumo.saldoAoFimDaObra < 0 ? 'Pago a mais que o saldo' : 'Saldo na entrega',
      resumo.saldoAoFimDaObra === null ? '—' : fmtMoeda(Math.abs(resumo.saldoAoFimDaObra), true),
    )}
    ${item('Total sem reajuste', fmtMoeda(resumo.totalSemReajuste, true))}
  </div>

  <table>
    <thead>
      <tr><th>Mês</th><th>Parcela antes</th><th>% CUB</th><th>Reajuste</th><th>Parcela atual</th><th>Acumulado</th></tr>
    </thead>
    <tbody>
      ${linhas
        .map(
          (linha) => `<tr>
        <td>${linha.mes}</td>
        <td>${fmtMoeda(linha.parcelaAntes, true)}</td>
        <td>${fmtPercentual(linha.percentual)}</td>
        <td>${fmtMoeda(linha.reajuste, true)}</td>
        <td>${fmtMoeda(linha.parcelaAtual, true)}</td>
        <td>${fmtMoeda(linha.acumuladoPago, true)}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
    <tfoot>
      <tr>
        <td>Total</td><td></td><td></td>
        <td>${fmtMoeda(resumo.totalReajuste, true)}</td><td></td>
        <td>${fmtMoeda(resumo.totalPago, true)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`

  return imprimir(html)
}

/** Abre a folha em outra aba e chama a impressao. false = pop-up bloqueado. */
function imprimir(html: string): boolean {
  const janela = window.open('', '_blank')
  if (!janela) return false

  janela.document.write(html)
  janela.document.close()
  // Espera o layout fechar antes de chamar a impressao.
  janela.addEventListener('load', () => {
    janela.focus()
    janela.print()
  })
  return true
}

/**
 * Dados do imovel que abrem a apresentacao do investimento. Chegam prontos em
 * texto: quem monta e a tela, que sabe se o numero veio da unidade escolhida
 * ou da faixa das unidades do empreendimento. Sem imovel escolhido (simulacao
 * livre), o PDF sai so com os numeros.
 */
export interface ImovelDaSimulacao {
  nome: string
  /** Construtora, cidade e bairro em uma linha. */
  subtitulo?: string | null
  unidade?: string | null
  metragem?: string | null
  dormitorios?: string | null
  suites?: string | null
  vagas?: string | null
  valorM2?: string | null
  entrega?: string | null
  status?: string | null
}

/** Uma linha da grade so aparece quando tem dado — celula vazia nao informa nada. */
function itensPreenchidos(pares: [string, string | null | undefined][]): string {
  return pares
    .filter(([, valor]) => valor && valor.trim() && valor !== TRACO)
    .map(
      ([rotulo, valor]) =>
        `<div class="item"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${esc(valor as string)}</div></div>`,
    )
    .join('')
}

function blocoDoImovel(imovel: ImovelDaSimulacao | null): string {
  if (!imovel) return ''

  const itens = itensPreenchidos([
    ['Unidade', imovel.unidade],
    ['Metragem', imovel.metragem],
    ['Dormitórios', imovel.dormitorios],
    ['Suítes', imovel.suites],
    ['Vagas', imovel.vagas],
    ['Valor do m²', imovel.valorM2],
    ['Entrega prevista', imovel.entrega],
    ['Status da obra', imovel.status],
  ])

  return `<div class="imovel">
    <h2>${esc(imovel.nome)}</h2>
    ${imovel.subtitulo ? `<div class="imovel__linha">${esc(imovel.subtitulo)}</div>` : ''}
    ${itens ? `<div class="resumo">${itens}</div>` : ''}
  </div>`
}

/** Um dos dois quadros de conclusao da apresentacao. */
function blocoDaConclusao(
  resultado: ResultadoInvestimento,
  conclusao: Conclusao,
  titulo: string,
  dica: string,
  rotuloSaldo: string,
  destaque = false,
): string {
  const linha = (rotulo: string, valor: string) =>
    `<div class="conclusao__linha"><span>${rotulo}</span><b>${valor}</b></div>`

  return `<div class="conclusao${destaque ? ' conclusao--cub' : ''}">
    <div class="conclusao__titulo">${esc(titulo)}</div>
    <div class="conclusao__dica">${esc(dica)}</div>
    ${linha(rotuloSaldo, conclusao.saldoDevedor > 0 ? fmtMoeda(conclusao.saldoDevedor) : 'quitado')}
    ${linha('Patrimônio líquido', fmtMoeda(conclusao.patrimonioLiquido))}
    ${linha('Lucro potencial', fmtMoeda(conclusao.lucroPotencial))}
    ${linha(
      'Rentabilidade',
      conclusao.rentabilidade === null ? TRACO : fmtPercentual(conclusao.rentabilidade, 2),
    )}
    ${linha('ROI', conclusao.multiplicador === null ? TRACO : `${fmtNumero(conclusao.multiplicador)}×`)}
    <p class="conclusao__frase">${esc(textoDaConclusao(resultado, conclusao))}</p>
  </div>`
}

/**
 * As duas conclusoes so vao ao papel quando o CUB foi considerado — sem ele a
 * unica leitura ja esta na projecao, e repetir seria enche-lo de ruido.
 */
function blocoDasConclusoes(resultado: ResultadoInvestimento): string {
  const cub = resultado.cub
  if (!cub) return ''

  const conclusoes = `<div class="conclusoes">
    ${blocoDaConclusao(
      resultado,
      resultado,
      'Só o empreendimento',
      `valorização de ${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano · ${
        resultado.pagoNoPeriodo > 0 ? 'parcelas sem reajuste' : 'saldo devedor parado'
      }`,
      'Saldo devedor',
    )}
    ${blocoDaConclusao(
      resultado,
      cub,
      'Com o CUB',
      `a mesma valorização · ${fmtPercentual(cub.cubMensal)} ao mês sobre a dívida${
        resultado.pagoNoPeriodo > 0 ? ' e sobre as parcelas' : ''
      }`,
      'Saldo corrigido',
      true,
    )}
  </div>`

  const comparacao =
    resultado.saldoDevedorHoje > 0
      ? `<p class="conclusao__frase" style="border:0;padding:0;margin-top:8px">
          O índice de ${fmtPercentual(cub.cubMensal)} ao mês acumula ${fmtPercentual(cub.cubAcumulado, 2)} em
          ${textoDoPrazo(resultado.meses)} e acrescenta ${fmtMoeda(cub.correcao)} à dívida ao longo da obra${
            cub.custoNoDesembolso > 0.5
              ? ` — ${fmtMoeda(cub.custoNoDesembolso)} disso sai do bolso nas parcelas reajustadas`
              : ''
          }. No fim, o patrimônio líquido é ${fmtMoeda(cub.custoNoPatrimonio)} menor. A valorização do imóvel é a
          mesma nas duas leituras — o que muda é a dívida.
        </p>`
      : `<p class="conclusao__frase" style="border:0;padding:0;margin-top:8px">
          Sem saldo devedor não há o que corrigir: com o imóvel quitado, as duas conclusões dão no mesmo.
        </p>`

  return `<div class="secao">
    <div class="secao__titulo">Conclusão — com e sem a correção do CUB</div>
    ${conclusoes}
    ${comparacao}
  </div>`
}

/**
 * A obra mes a mes no papel. Uma linha por ano (mais a entrega): mes a mes o
 * papel viraria tabela de dez paginas, e quem quer o detalhe tem a tela.
 */
function blocoDaObra(resultado: ResultadoInvestimento): string {
  const cronograma = resultado.cub?.evolucao ?? resultado.evolucao
  if (cronograma.length === 0 || resultado.saldoDevedorHoje <= 0) return ''

  const comCub = resultado.cub !== null
  const marcos =
    cronograma.length <= 13
      ? cronograma
      : cronograma.filter((linha, indice) => linha.mes % 12 === 0 || indice === cronograma.length - 1)

  const linhas = marcos
    .map(
      (linha) => `<tr>
      <td>Mês ${linha.mes}</td>
      <td>${fmtMoeda(linha.saldoInicial)}</td>
      ${comCub ? `<td>${fmtMoeda(linha.correcao)}</td>` : ''}
      <td>${linha.pagamento > 0 ? fmtMoeda(linha.pagamento) : TRACO}</td>
      <td>${fmtMoeda(linha.saldoFinal)}</td>
    </tr>`,
    )
    .join('')

  const ultima = cronograma[cronograma.length - 1]

  return `<div class="secao">
    <div class="secao__titulo">Evolução do saldo devedor durante a obra</div>
    <table>
      <thead>
        <tr>
          <th>Período</th><th>Saldo no início</th>${comCub ? '<th>Correção</th>' : ''}
          <th>Pago no mês</th><th>Saldo no fim</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td>Entrega</td><td></td>
          ${comCub ? `<td>${fmtMoeda(ultima.correcaoAcumulada)}</td>` : ''}
          <td>${fmtMoeda(ultima.pagoAcumulado)}</td>
          <td>${fmtMoeda(ultima.saldoFinal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>`
}

/**
 * Apresentacao da simulacao de investimento para levar ao cliente: o imovel
 * primeiro (nome, metragem, dormitorios), depois o que foi simulado e o que a
 * projecao devolve. Mesma mecanica do PDF do CUB — a folha de impressao do
 * navegador, sem biblioteca.
 */
export function exportarPdfInvestimento(
  resultado: ResultadoInvestimento,
  imovel: ImovelDaSimulacao | null = null,
): boolean {
  const titulo = imovel?.nome ?? 'Simulação de investimento'

  // Sem CUB a leitura valida e a base; com CUB, a que o cliente vai pagar.
  const cenario = resultado.cub ?? resultado

  const investido = itensPreenchidos([
    ['Valor de compra', fmtMoeda(resultado.valorCompra)],
    ['Entrada', resultado.entrada > 0 ? fmtMoeda(resultado.entrada) : null],
    ['Valor já pago', resultado.valorPago > 0 ? fmtMoeda(resultado.valorPago) : null],
    ['Saldo devedor hoje', resultado.saldoDevedorHoje > 0 ? fmtMoeda(resultado.saldoDevedorHoje) : 'quitado'],
    ['A pagar até a entrega', cenario.pagoNoPeriodo > 0 ? fmtMoeda(cenario.pagoNoPeriodo) : null],
    ['Investido até a entrega', cenario.investidoTotal > 0 ? fmtMoeda(cenario.investidoTotal) : null],
    ['Prazo até a entrega', textoDoPrazo(resultado.meses)],
    ['Valorização considerada', `${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano`],
    ['CUB considerado', resultado.cub ? `${fmtPercentual(resultado.cub.cubMensal)} ao mês` : null],
  ])

  const projecao = itensPreenchidos([
    ['Ganho patrimonial', fmtMoeda(resultado.ganhoPatrimonialBruto)],
    ['Saldo na entrega', cenario.saldoDevedor > 0 ? fmtMoeda(cenario.saldoDevedor) : 'quitado'],
    ['Patrimônio líquido', fmtMoeda(cenario.patrimonioLiquido)],
    ['Lucro potencial', fmtMoeda(cenario.lucroPotencial)],
    ['Rentabilidade', cenario.rentabilidade === null ? null : fmtPercentual(cenario.rentabilidade, 2)],
    ['Valorização no período', fmtPercentual(resultado.valorizacaoTotal, 2)],
  ])

  const linhas = resultado.evolucaoValor
    .map((ponto) => {
      const acumulada = resultado.valorCompra > 0 ? (ponto.valor / resultado.valorCompra - 1) * 100 : 0
      return `<tr>
      <td>${ponto.mes === 0 ? 'Hoje' : `Mês ${ponto.mes}`}</td>
      <td>${fmtMoeda(ponto.valor)}</td>
      <td>${fmtPercentual(acumulada, 2)}</td>
      <td>${fmtMoeda(ponto.valor - resultado.valorCompra)}</td>
    </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${esc(titulo)} — simulação de investimento</title>
  <style>${ESTILO_IMPRESSAO}</style>
</head>
<body>
  <h1>Simulação de investimento</h1>
  <div class="sub">Projeção de valorização até a entrega${
    resultado.meses > 0 ? ` · ${textoDoPrazo(resultado.meses)}` : ''
  } · ${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano</div>

  ${blocoDoImovel(imovel)}

  <div class="hero">
    <div class="hero__principal">
      <div class="hero__rotulo">Valor estimado na entrega</div>
      <div class="hero__valor">${fmtMoeda(resultado.valorEstimadoEntrega)}</div>
      <div class="hero__dica">${fmtMoeda(resultado.valorCompra)} hoje · ${fmtPercentual(
        resultado.valorizacaoTotal,
        2,
      )} de valorização no período</div>
    </div>
    ${
      resultado.multiplicador !== null
        ? `<div class="hero__lado">
      <div class="hero__rotulo">ROI</div>
      <div class="hero__valor hero__valor--menor">${fmtMoeda(resultado.multiplicador, true)}</div>
      <div class="hero__dica">de patrimônio para cada R$ 1,00 investido${
        resultado.rentabilidade !== null ? ` · ${fmtPercentual(resultado.rentabilidade, 2)} de retorno` : ''
      }</div>
    </div>`
        : ''
    }
  </div>

  <div class="secao">
    <div class="secao__titulo">O investimento</div>
    <div class="resumo">${investido}</div>
  </div>

  <div class="secao">
    <div class="secao__titulo">Projeção na entrega</div>
    <div class="resumo">${projecao}</div>
  </div>

  ${blocoDasConclusoes(resultado)}

  ${blocoDaObra(resultado)}

  <div class="secao">
    <div class="secao__titulo">Valorização até a entrega</div>
    <table>
      <thead>
        <tr><th>Período</th><th>Valor estimado</th><th>Valorização acumulada</th><th>Ganho sobre a compra</th></tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>

  <div class="nota">
    Projeção baseada na expectativa de valorização de ${fmtPercentual(resultado.valorizacaoAnual, 2)} ao ano informada
    na simulação — é uma estimativa, não uma garantia de rentabilidade. O <strong>lucro potencial</strong> não desconta
    o saldo devedor; o número já sem a dívida é o <strong>patrimônio líquido</strong>.${
      resultado.cub
        ? ` A leitura <strong>com o CUB</strong> corrige o saldo devedor em ${fmtPercentual(
            resultado.cub.cubMensal,
          )} ao mês e reajusta as parcelas pelo mesmo índice, mês a mês, como a construtora faz; o percentual informado
          é uma expectativa e o índice varia a cada mês.`
        : ''
    }${
      resultado.pagoNoPeriodo > 0
        ? ` As parcelas informadas abatem o saldo devedor durante a obra — o que sobra na entrega é o valor que
          costuma ir para o financiamento bancário.`
        : ''
    }
  </div>
</body>
</html>`

  return imprimir(html)
}

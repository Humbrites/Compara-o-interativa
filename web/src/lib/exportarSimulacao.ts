import type { Simulacao } from './cub'
import { fmtPercentual } from './cub'
import { fmtMoeda } from './format'

/**
 * Exportacoes sem biblioteca externa:
 * - Excel: CSV com BOM e ";" — o que o Excel pt-BR abre com dois cliques.
 * - PDF: janela de impressao do proprio navegador ("Salvar como PDF"), com
 *   os graficos ja renderizados indo junto.
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
  .graficos { display: grid; gap: 14px; margin-bottom: 20px; }
  .grafico__titulo { font-size: 11px; font-weight: 700; text-transform: uppercase;
                     letter-spacing: .04em; color: #7b8599; margin-bottom: 4px; }
  .grafico__descricao { display: block; text-transform: none; letter-spacing: 0;
                        font-weight: 500; color: #7b8599; }
  svg { max-width: 100%; }
  .grafico__grade { stroke: #e3e8f0; stroke-width: 1; }
  .grafico__tick { fill: #7b8599; font-size: 10px; }
  .grafico__linha { fill: none; stroke: #4169d6; stroke-width: 2; }
  .grafico__preenchimento { fill: rgba(65,105,214,.14); stroke: none; }
  .grafico__ponto { fill: #4169d6; stroke: #fff; stroke-width: 2; }
  .grafico__barra { fill: #4169d6; }
  .grafico__cursor, .grafico__tooltip { display: none; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #e3e8f0; text-align: right;
           font-variant-numeric: tabular-nums; }
  th { background: #f0f3f8; font-size: 9.5px; text-transform: uppercase;
       letter-spacing: .04em; color: #4d5871; }
  th:first-child, td:first-child { text-align: left; }
  tfoot td { font-weight: 700; border-top: 2px solid #cfd7e5; }
  @page { margin: 14mm; }
  @media print { thead { display: table-header-group; } tr { break-inside: avoid; } }
`

export function exportarPdf(simulacao: Simulacao, titulo: string, graficos: string[]) {
  const { linhas, resumo } = simulacao

  const item = (rotulo: string, valor: string) =>
    `<div class="item"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div></div>`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${titulo} — simulação CUB</title>
  <style>${ESTILO_IMPRESSAO}</style>
</head>
<body>
  <h1>Simulação de reajuste pelo CUB</h1>
  <div class="sub">${titulo} · ${resumo.fonte} · ${resumo.meses} meses de obra${
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

  <div class="graficos">${graficos.join('')}</div>

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

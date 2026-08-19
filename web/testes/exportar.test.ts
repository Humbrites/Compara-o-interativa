/**
 * O cabeçalho e a marca das folhas impressas.
 *
 * As três famílias de PDF (simulação, comparativo e fluxos) abrem pelo MESMO
 * esqueleto, e é ele que estes testes seguram: o que o corretor digita nunca
 * vira marcação, a linha de identificação some quando não foi preenchida, e a
 * marca d'água só aparece — e só onde — a conta mandou.
 *
 * Rodam sem navegador: a folha é montada em texto, e `imprimir` só precisa de
 * um `window.open` que aceite HTML (o mesmo dublê usado nos testes de fluxo).
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { indiceFixo, simular } from '../src/lib/cub.ts'
import {
  cabecalhoPdf,
  exportarPdf,
  type Apresentacao,
  type LogoDaApresentacao,
} from '../src/lib/exportarSimulacao.ts'
import { exportarPdfComparativo, exportarPdfUnidades } from '../src/lib/exportarComparativo.ts'

/** Janela de mentira: acumula o HTML que a folha escreveria. */
function janelaDeTeste() {
  let html = ''
  const janela = {
    document: {
      write: (texto: string) => {
        html += texto
      },
      close: () => {},
    },
    addEventListener: () => {},
    focus: () => {},
    print: () => {},
  }
  ;(globalThis as unknown as { window: unknown }).window = { open: () => janela }
  return () => html
}

const LOGO: LogoDaApresentacao = {
  url: 'http://localhost:3000/uploads/abc-123.png',
  posicao: 'marca-dagua',
  tamanho: 40,
  opacidade: 0.06,
}

const APRESENTACAO: Apresentacao = {
  cliente: 'Família Souza & Filhos',
  corretor: 'Ana <b>Souza</b>',
  creci: 'CRECI/RS 12.345-J',
  logo: LOGO,
}

/** Data de hoje no formato que o cabeçalho imprime. */
const HOJE = new Date().toLocaleDateString('pt-BR')

/* ------------------------------------------------------------------ */
/* O cabecalho                                                         */
/* ------------------------------------------------------------------ */

test('o cabeçalho escapa o que o corretor digitou e carimba a data da análise', () => {
  const html = cabecalhoPdf({
    chapeu: 'Relatório comparativo',
    titulo: 'Residencial Alfa',
    contra: 'Residencial Beta',
    empreendimento: 'Residencial Alfa',
    unidade: 'Apto 101',
    apresentacao: APRESENTACAO,
  })

  // Cliente e corretor saem na faixa de apresentação, cada um com seu rótulo.
  assert.match(html, /class="pdf-cabecalho__apresentacao"/)
  assert.match(
    html,
    /Preparado para<\/div>\s*<div class="pdf-cabecalho__valor pdf-cabecalho__valor--cliente">Família Souza &amp; Filhos</,
  )
  assert.match(
    html,
    /Apresentado por<\/div>\s*<div class="pdf-cabecalho__valor pdf-cabecalho__valor--corretor">Ana &lt;b&gt;Souza&lt;\/b&gt;</,
  )
  assert.doesNotMatch(html, /Ana <b>Souza<\/b>/, 'nome do corretor não pode virar marcação')
  // O CRECI sai EXATAMENTE como cadastrado — sem máscara, sem normalização —
  // e logo abaixo do nome de quem assina.
  assert.match(html, /<div class="pdf-cabecalho__creci">CRECI\/RS 12\.345-J<\/div>/)
  assert.match(html, new RegExp(`Data da análise</div>\\s*<div[^>]*>${HOJE.replace(/\//g, '\\/')}<`))
  assert.match(html, /Residencial Alfa · Apto 101/)
})

test('célula sem dado não aparece no papel', () => {
  const html = cabecalhoPdf({
    titulo: 'Comparativo de unidades',
    apresentacao: { corretor: 'Bruno Lima', cliente: null, creci: '' },
  })

  assert.match(html, /Apresentado por/)
  assert.match(html, /pdf-cabecalho__valor--corretor">Bruno Lima</)
  assert.doesNotMatch(html, /Preparado para/, 'sem cliente a célula dele não existe')
  assert.doesNotMatch(html, /pdf-cabecalho__creci/)
  // Sem imóvel e sem chapéu, as linhas nem existem — a data continua.
  assert.doesNotMatch(html, /pdf-cabecalho__imovel/)
  assert.match(html, /Data da análise/)
})

test('só o CRECI, sem corretor, vira a célula inteira', () => {
  const html = cabecalhoPdf({
    titulo: 'Comparativo de unidades',
    apresentacao: { creci: 'CRECI/RS 12345-F' },
  })

  assert.match(html, /class="pdf-cabecalho__apresentacao"/)
  assert.match(html, /pdf-cabecalho__rotulo">CRECI<\/div>/)
  assert.match(html, /pdf-cabecalho__valor--corretor">CRECI\/RS 12345-F</)
  assert.doesNotMatch(html, /Apresentado por/)
})

test('sem cliente, corretor nem CRECI a faixa some e sobra a linha da data', () => {
  const html = cabecalhoPdf({ titulo: 'Simulação de investimento' })

  assert.match(html, /Simulação de investimento/)
  assert.doesNotMatch(html, /pdf-cabecalho__apresentacao/, 'faixa vazia não vai ao papel')
  assert.match(html, /<div class="pdf-cabecalho__linha">/)
  assert.match(html, new RegExp(`Data da análise: ${HOJE.replace(/\//g, '\\/')}`))
  assert.doesNotMatch(html, /Preparado para|Apresentado por/)
  assert.doesNotMatch(html, /<img/, 'sem logo configurada nada de imagem entra na folha')

  // Com só um espaço digitado o campo continua vazio.
  const soEspaco = cabecalhoPdf({ titulo: 'X', apresentacao: { cliente: '  ', corretor: ' ' } })
  assert.doesNotMatch(soEspaco, /pdf-cabecalho__apresentacao/)
})

test('a logo da conta assina o cabeçalho em qualquer posição configurada', () => {
  const noTopo = cabecalhoPdf({
    titulo: 'Comparativo',
    apresentacao: { logo: { ...LOGO, posicao: 'topo', opacidade: 1 } },
  })
  assert.match(noTopo, /class="pdf-cabecalho__logo" src="http:\/\/localhost:3000\/uploads\/abc-123\.png"/)
  assert.match(noTopo, /width:40%;opacity:1/, 'no topo valem o tamanho e a opacidade da configuração')

  // Fora do topo a logo entra comedida e OPACA: a opacidade da configuração é
  // a da marca d'água (0,06 aqui) e apagaria a marca no cabeçalho.
  for (const posicao of ['marca-dagua', 'rodape'] as const) {
    const html = cabecalhoPdf({ titulo: 'X', apresentacao: { logo: { ...LOGO, posicao } } })
    assert.match(html, /class="pdf-cabecalho__logo pdf-cabecalho__logo--comedida"/)
    assert.match(html, /src="http:\/\/localhost:3000\/uploads\/abc-123\.png"/)
    assert.match(html, /style="opacity:1"/)
    assert.doesNotMatch(html, /opacity:0\.06/)
    assert.doesNotMatch(html, /width:40%/, 'o tamanho da marca d’água não manda no cabeçalho')
  }
})

/* ------------------------------------------------------------------ */
/* A folha inteira                                                     */
/* ------------------------------------------------------------------ */

const COMPARATIVO = {
  a: { etiqueta: 'Empreendimento A', nome: 'Residencial Alfa', subtitulo: 'Construtora X', vitorias: 2 },
  b: { etiqueta: 'Empreendimento B', nome: 'Residencial Beta', subtitulo: 'Construtora Y', vitorias: 1 },
  secoes: [
    {
      titulo: 'Características do empreendimento',
      nomeA: 'Residencial Alfa',
      nomeB: 'Residencial Beta',
      linhas: [
        {
          chave: 'valor_m2',
          rotulo: 'Valor do m² a partir de',
          textoA: 'R$ 9.000',
          textoB: 'R$ 9.500',
          vencedor: 'a' as const,
          criterio: 'menor vence',
        },
      ],
    },
  ],
}

test('a marca d’água entra fixa atrás do conteúdo, com o tamanho e a opacidade da conta', () => {
  const html = janelaDeTeste()
  const abriu = exportarPdfComparativo({ ...COMPARATIVO, apresentacao: APRESENTACAO })

  assert.equal(abriu, true)
  const folha = html()

  // A marca é um elemento próprio, fora do fluxo e com z-index negativo: ela
  // passa POR BAIXO das tabelas e nunca atrapalha a leitura.
  assert.match(folha, /<div class="pdf-marca"/)
  assert.match(folha, /src="http:\/\/localhost:3000\/uploads\/abc-123\.png"/)
  assert.match(folha, /width:40%;opacity:0\.06/)
  assert.match(folha, /\.pdf-marca \{ position: fixed; inset: 0; z-index: -1;/)
  assert.match(folha, /print-color-adjust: exact/)

  // O cabeçalho comum veio junto, com quem assina e para quem — e a mesma
  // logo assina o topo, opaca, sem deixar de ser marca d'água no fundo.
  assert.match(folha, /Preparado para/)
  assert.match(folha, /pdf-cabecalho__valor--cliente">Família Souza &amp; Filhos</)
  assert.match(folha, /class="pdf-cabecalho__logo pdf-cabecalho__logo--comedida"[^>]*style="opacity:1"/)
  assert.match(folha, /Data da análise/)
  // E o corpo continua vindo pronto da tela.
  assert.match(folha, /Valor do m² a partir de/)
  assert.doesNotMatch(folha, /class="pdf-assinatura"/)
})

test('sem logo configurada a folha não muda de forma', () => {
  const html = janelaDeTeste()
  exportarPdfComparativo({ ...COMPARATIVO, apresentacao: { cliente: 'Joana', logo: null } })

  const folha = html()
  assert.doesNotMatch(folha, /pdf-marca"/)
  assert.doesNotMatch(folha, /pdf-assinatura"/)
  assert.doesNotMatch(folha, /<img/)
  assert.match(folha, /pdf-cabecalho__valor--cliente">Joana</)
})

test('no rodapé a marca vira uma assinatura no fim do documento', () => {
  const html = janelaDeTeste()
  exportarPdfUnidades({
    colunas: [{ unidade: 'Apto 101', empreendimento: 'Residencial Alfa' }],
    linhas: [{ rotulo: 'Preço', celulas: [{ texto: 'R$ 800.000', vence: false }] }],
    apresentacao: { corretor: 'Ana', logo: { ...LOGO, posicao: 'rodape', opacidade: 1 } },
  })

  const folha = html()
  assert.match(folha, /<div class="pdf-assinatura">/)
  assert.doesNotMatch(folha, /<div class="pdf-marca"/)
  // A assinatura fica DEPOIS do corpo — é o fim da folha, não o começo.
  assert.ok(folha.indexOf('<div class="pdf-assinatura">') > folha.indexOf('Apto 101'))
  // Uma coluna só: o prédio dela identifica a folha no cabeçalho.
  assert.match(folha, /pdf-cabecalho__imovel">Residencial Alfa/)
})

test('a folha da simulação usa o mesmo cabeçalho das demais', () => {
  const html = janelaDeTeste()
  const simulacao = simular({ valorImovel: 800000, entrada: 80000, parcelaInicial: 4000, meses: 24, fonte: indiceFixo(0.6) })

  const abriu = exportarPdf(simulacao, 'Residencial Alfa — Tabela', {
    cliente: 'Joana & Cia',
    corretor: 'Ana',
    creci: 'CRECI 1',
    logo: LOGO,
  })

  assert.equal(abriu, true)
  const folha = html()
  assert.match(folha, /class="pdf-cabecalho"/)
  assert.match(folha, /pdf-cabecalho__valor--cliente">Joana &amp; Cia</)
  assert.match(folha, /Residencial Alfa — Tabela/)
  assert.match(folha, /<div class="pdf-marca"/)
  // O corpo da simulação continua igual: nada foi recalculado no papel.
  assert.match(folha, /Reajuste acumulado/)
})

import type { LinhaComparativo } from './comparar'
import { esc, montarFolha, type Apresentacao } from './exportarSimulacao'

/**
 * PDF das telas de comparacao — mesma mecanica das outras exportacoes: uma
 * folha de impressao autocontida aberta em outra aba, sem biblioteca.
 *
 * Nada e recalculado aqui: as telas ja tem as linhas prontas (quem venceu,
 * o texto de cada celula) e passam o resultado. Este arquivo so vira HTML.
 *
 * O visual e de relatorio de apresentacao — o corretor imprime e entrega ao
 * cliente. Por isso o vencedor nunca depende SO da cor: vem com selo e em
 * negrito, para continuar legivel na impressora preto e branco do escritorio.
 */

/**
 * Folha premium: petroleo nos titulos, cinzas quentes no corpo e um verde
 * discreto so no vencedor. Sem fonte externa — a folha e autocontida e uma
 * fonte que nao carrega estraga o papel inteiro.
 *
 * O cabecalho NAO mora aqui: ele e o mesmo de todas as exportacoes (identidade
 * da imobiliaria, cliente, corretor e data), e duplicar o desenho faria a folha
 * do comparativo envelhecer sozinha na primeira mudanca.
 */
const ESTILO_RELATORIO = `
  * { box-sizing: border-box; }

  :root {
    --tinta: #12212e;
    --tinta-2: #46586a;
    --tinta-3: #8b9aa8;
    --linha: #e2e0da;
    --linha-forte: #cbc7bd;
    --papel: #ffffff;
    --papel-2: #faf9f6;
    --petroleo: #143a4e;
    --petroleo-2: #1d5069;
    --ouro: #b08333;
    --vence: #1d6b48;
    --vence-fundo: #edf5f0;
  }

  body {
    font-family: system-ui, -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: var(--tinta); background: var(--papel);
    margin: 0; padding: 0 0 42px; font-size: 11.5px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .folha { padding: 0 26px; }

  /* O cabecalho vem do esqueleto comum e nasce colado nas bordas da folha;
     aqui ele ganha a mesma margem lateral do corpo. */
  .pdf-cabecalho { margin: 0 26px 22px; }
  .pdf-assinatura { margin: 22px 26px 0; }

  /* ---- Duelo A vs B ------------------------------------------------ */

  .duelo { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
           align-items: stretch; margin-bottom: 24px; break-inside: avoid; }
  .duelo__lado { background: var(--papel-2); border: 1px solid var(--linha);
                 border-top: 3px solid var(--petroleo); border-radius: 3px;
                 padding: 13px 15px 14px; }
  .duelo__lado--b { border-top-color: var(--ouro); }
  .duelo__etiqueta { font-size: 8px; text-transform: uppercase; letter-spacing: .18em;
                     color: var(--tinta-3); font-weight: 700; }
  .duelo__nome { font-size: 17px; font-weight: 700; letter-spacing: -.01em;
                 margin: 4px 0 3px; line-height: 1.2; }
  .duelo__meta { font-size: 10px; color: var(--tinta-2); }
  .duelo__x { align-self: center; font-size: 10px; font-weight: 700; letter-spacing: .14em;
              color: var(--tinta-3); border: 1px solid var(--linha-forte);
              border-radius: 999px; padding: 7px 4px; writing-mode: vertical-rl; }

  .placar { margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--linha);
            display: flex; align-items: baseline; gap: 7px; }
  .placar__numero { font-size: 27px; font-weight: 700; line-height: 1;
                    font-variant-numeric: tabular-nums; color: var(--petroleo); }
  .duelo__lado--b .placar__numero { color: var(--ouro); }
  .placar__texto { font-size: 8.5px; text-transform: uppercase; letter-spacing: .1em;
                   color: var(--tinta-2); font-weight: 700; }

  /* ---- Secoes ------------------------------------------------------ */

  .secao { margin-bottom: 22px; break-inside: avoid; }
  .secao__titulo { display: flex; align-items: center; gap: 10px;
                   font-size: 9.5px; text-transform: uppercase; letter-spacing: .16em;
                   font-weight: 700; color: var(--petroleo); margin: 0 0 9px; }
  .secao__titulo::after { content: ''; flex: 1; height: 1px; background: var(--linha); }

  /* ---- Tabelas ----------------------------------------------------- */

  table { width: 100%; border-collapse: collapse; font-size: 11px;
          font-variant-numeric: tabular-nums; }
  thead th { background: var(--petroleo-2); color: #fff; font-size: 8.5px;
             text-transform: uppercase; letter-spacing: .12em; font-weight: 700;
             text-align: left; padding: 8px 11px; vertical-align: bottom; }
  thead th:first-child { width: 27%; }
  thead .coluna__nome { display: block; font-size: 11.5px; text-transform: none;
                        letter-spacing: 0; font-weight: 700; }
  thead .coluna__meta { display: block; font-size: 8.5px; text-transform: none;
                        letter-spacing: 0; font-weight: 400; color: rgba(255,255,255,.7); }
  tbody th { text-align: left; font-weight: 600; color: var(--tinta-2); font-size: 10.5px; }
  tbody th, tbody td { padding: 7px 11px; border-bottom: 1px solid var(--linha); }
  tbody tr:nth-child(even) { background: var(--papel-2); }
  tbody tr { break-inside: avoid; }
  tbody tr:last-child th, tbody tr:last-child td { border-bottom: 1px solid var(--linha-forte); }

  td.vence { background: var(--vence-fundo); color: var(--vence); font-weight: 700; }
  tbody tr:nth-child(even) td.vence { background: var(--vence-fundo); }
  td.vazio { color: var(--tinta-3); }
  .selo { display: inline-block; margin-right: 6px; width: 13px; height: 13px;
          line-height: 13px; text-align: center; border-radius: 50%;
          background: var(--vence); color: #fff; font-size: 8.5px; font-weight: 700;
          vertical-align: 1px; }
  .empate { display: inline-block; margin-left: 7px; font-size: 8px; font-weight: 700;
            text-transform: uppercase; letter-spacing: .1em; color: var(--tinta-3);
            border: 1px solid var(--linha-forte); border-radius: 999px; padding: 1px 6px; }
  .detalhe { display: block; margin-top: 2px; font-size: 9px; font-weight: 400;
             color: var(--tinta-3); }
  td.vence .detalhe { color: var(--vence); opacity: .8; }

  /* ---- Textos livres ----------------------------------------------- */

  .livre { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .livre__cartao { border: 1px solid var(--linha); border-left: 3px solid var(--linha-forte);
                   background: var(--papel-2); border-radius: 3px; padding: 11px 13px;
                   font-size: 10.5px; line-height: 1.55; white-space: pre-wrap;
                   break-inside: avoid; }
  .livre__titulo { font-size: 8.5px; text-transform: uppercase; letter-spacing: .14em;
                   font-weight: 700; color: var(--petroleo); margin-bottom: 5px; }
  .livre__vazio { color: var(--tinta-3); font-style: italic; }
  .livre__obs { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--linha);
                color: var(--tinta-2); }

  /* ---- Nota e rodape ----------------------------------------------- */

  .nota { break-inside: avoid; border-top: 1px solid var(--linha-forte); padding-top: 10px;
          margin-top: 6px; font-size: 9px; line-height: 1.6; color: var(--tinta-3); }
  .nota__titulo { font-size: 8px; text-transform: uppercase; letter-spacing: .16em;
                  font-weight: 700; color: var(--tinta-2); margin-bottom: 4px; }
  .nota strong { color: var(--tinta-2); }

  /* Fixo: reaparece no pe de TODAS as paginas impressas. */
  .rodape { position: fixed; left: 0; right: 0; bottom: 0; padding: 7px 26px;
            border-top: 1px solid var(--linha); background: var(--papel);
            display: flex; justify-content: space-between; gap: 16px;
            font-size: 8px; text-transform: uppercase; letter-spacing: .12em;
            color: var(--tinta-3); }
  .rodape b { color: var(--petroleo); letter-spacing: .16em; }

  @page { margin: 12mm 0; }
  @media print { thead { display: table-header-group; } }
`

/**
 * A folha do relatorio: o esqueleto (cabecalho, marca e data) vem do helper
 * comum a todas as exportacoes; daqui saem so o corpo e a faixa do rodape.
 */
function folha(dados: {
  documento: string
  chapeu: string
  titulo: string
  contra?: string | null
  empreendimento?: string | null
  unidade?: string | null
  subtitulo: string
  corpo: string
  rodape: string
  apresentacao?: Apresentacao | null
}): boolean {
  return montarFolha({
    documento: dados.documento,
    estilo: ESTILO_RELATORIO,
    cabecalho: {
      chapeu: dados.chapeu,
      titulo: dados.titulo,
      contra: dados.contra ?? null,
      empreendimento: dados.empreendimento ?? null,
      unidade: dados.unidade ?? null,
      subtitulo: dados.subtitulo,
      apresentacao: dados.apresentacao ?? null,
    },
    corpo: `  <main class="folha">
${dados.corpo}
  </main>`,
    rodapeFixo: `<footer class="rodape">
    <span><b>Compara Interativa</b></span>
    <span>${esc(dados.rodape)}</span>
  </footer>`,
  })
}

/** Selo do vencedor: cor + peso + simbolo, para sobreviver ao P&B. */
const SELO = '<span class="selo">&#10003;</span>'

/* ------------------------------------------------------------------ */
/* Empreendimento A x B                                                */
/* ------------------------------------------------------------------ */

export interface LadoDoComparativo {
  /** "Empreendimento A" / "Empreendimento B". */
  etiqueta: string
  nome: string
  /** Construtora, bairro e cidade em uma linha. */
  subtitulo?: string | null
  /** Quantos indicadores este lado venceu. */
  vitorias: number
}

export interface SecaoDoComparativo {
  titulo: string
  /** Cabecalho das colunas — pode ser o nome da unidade, nao o do predio. */
  nomeA: string
  nomeB: string
  linhas: LinhaComparativo[]
}

export interface TextoLivreDoComparativo {
  nome: string
  descricao: string
  observacoes: string
}

const TRACO_TELA = '—'

/** Uma celula de valor, ja com o destaque do vencedor. */
function celula(linha: LinhaComparativo, lado: 'a' | 'b'): string {
  const texto = lado === 'a' ? linha.textoA : linha.textoB
  const vence = linha.vencedor === lado
  const vazio = texto === TRACO_TELA
  const classe = vence ? 'vence' : vazio ? 'vazio' : ''
  const empate = linha.vencedor === 'empate' && lado === 'b' ? '<span class="empate">empate</span>' : ''

  return `<td class="${classe}">${vence ? SELO : ''}${esc(texto)}${empate}</td>`
}

function tabelaDaSecao(secao: SecaoDoComparativo): string {
  if (secao.linhas.length === 0) return ''

  const linhas = secao.linhas
    .map(
      (linha) => `<tr>
      <th scope="row">${esc(linha.rotulo)}</th>
      ${celula(linha, 'a')}
      ${celula(linha, 'b')}
    </tr>`,
    )
    .join('')

  return `<section class="secao">
    <h2 class="secao__titulo">${esc(secao.titulo)}</h2>
    <table>
      <thead>
        <tr>
          <th>Indicador</th>
          <th><span class="coluna__nome">${esc(secao.nomeA)}</span><span class="coluna__meta">lado A</span></th>
          <th><span class="coluna__nome">${esc(secao.nomeB)}</span><span class="coluna__meta">lado B</span></th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  </section>`
}

/** Os textos livres do fluxo — so vao ao papel quando algum lado tem algo escrito. */
function blocoDosTextos(textos: TextoLivreDoComparativo[]): string {
  const preenchidos = textos.some((t) => t.descricao || t.observacoes)
  if (!preenchidos) return ''

  const cartoes = textos
    .map(
      (texto) => `<div class="livre__cartao">
      <div class="livre__titulo">${esc(texto.nome)}</div>
      ${texto.descricao ? esc(texto.descricao) : '<span class="livre__vazio">Sem descrição livre</span>'}
      ${texto.observacoes ? `<div class="livre__obs">${esc(texto.observacoes)}</div>` : ''}
    </div>`,
    )
    .join('')

  return `<section class="secao">
    <h2 class="secao__titulo">Condições descritas na tabela</h2>
    <div class="livre">${cartoes}</div>
  </section>`
}

function lado(dados: LadoDoComparativo, papel: 'a' | 'b'): string {
  return `<div class="duelo__lado duelo__lado--${papel}">
    <div class="duelo__etiqueta">${esc(dados.etiqueta)}</div>
    <div class="duelo__nome">${esc(dados.nome)}</div>
    ${dados.subtitulo ? `<div class="duelo__meta">${esc(dados.subtitulo)}</div>` : ''}
    <div class="placar">
      <span class="placar__numero">${dados.vitorias}</span>
      <span class="placar__texto">${
        dados.vitorias === 1 ? 'indicador melhor' : 'indicadores melhores'
      }</span>
    </div>
  </div>`
}

/**
 * A folha do comparativo A x B. Secoes sem linha nao aparecem — pagina em
 * branco com cabecalho de tabela nao informa nada.
 */
export function exportarPdfComparativo(dados: {
  a: LadoDoComparativo
  b: LadoDoComparativo
  secoes: SecaoDoComparativo[]
  textos?: TextoLivreDoComparativo[]
  apresentacao?: Apresentacao | null
}): boolean {
  const { a, b, secoes, textos = [], apresentacao = null } = dados
  const titulo = `${a.nome} × ${b.nome}`

  const corpo = `
    <div class="duelo">
      ${lado(a, 'a')}
      <div class="duelo__x">VS</div>
      ${lado(b, 'b')}
    </div>

    ${secoes.map(tabelaDaSecao).join('')}

    ${blocoDosTextos(textos)}

    <div class="nota">
      <div class="nota__titulo">Como ler este comparativo</div>
      O selo <strong>&#10003;</strong> e o negrito marcam o melhor valor de cada indicador segundo o critério da
      linha — <strong>menor</strong> para preço, valor do m² e entrada; <strong>maior</strong> para metragem,
      dormitórios, suítes e vagas; entrega mais próxima e obra mais avançada também contam a favor.
      Linhas em que um dos lados não tem o dado ficam sem vencedor: sem os dois números não há comparação.
      Valor do m², preço e metragem do empreendimento saem das unidades <strong>disponíveis</strong> de cada lado;
      <em>todas as unidades</em> ao lado do valor avisa que nenhuma disponível tinha o dado, e <em>dados gerais</em>
      que aquele empreendimento ainda não tem unidades cadastradas.
      Posição solar, face e situação da unidade não entram na disputa — dependem da preferência do cliente.
      Os valores refletem as tabelas cadastradas na data de emissão e não constituem proposta comercial.
    </div>`

  return folha({
    documento: `${titulo} — comparativo`,
    chapeu: 'Relatório comparativo',
    titulo: a.nome,
    contra: b.nome,
    subtitulo: 'Indicadores, unidades e fluxo de pagamento lado a lado. O melhor de cada linha vem marcado.',
    corpo,
    rodape: titulo,
    apresentacao,
  })
}

/* ------------------------------------------------------------------ */
/* Tabela da construtora x proposta personalizada                      */
/* ------------------------------------------------------------------ */

export interface LinhaDeFluxos {
  rotulo: string
  textoA: string
  textoB: string
  /** Ja formatada com o sinal pela tela; "—" quando um dos lados nao tem dado. */
  textoDiferenca: string
  detalheA?: string | null
  detalheB?: string | null
  /** Positiva = a proposta pesa mais naquela linha; null = sem comparacao. */
  diferenca: number | null
}

/**
 * A folha do "Comparar fluxos": as duas tabelas da MESMA unidade lado a lado.
 *
 * Aqui ninguem vence: mais entrada e pior para um cliente e melhor para outro,
 * e eleger vencedor seria opinar sobre o caixa de quem compra. O que o papel
 * mostra e a DIFERENCA, com sinal — e o numero que o corretor aponta na mesa.
 */
export function exportarPdfFluxos(dados: {
  titulo: string
  subtitulo?: string | null
  nomeA: string
  nomeB: string
  linhas: LinhaDeFluxos[]
  /** Empreendimento da unidade, quando a tela souber dizer. */
  empreendimento?: string | null
  apresentacao?: Apresentacao | null
}): boolean {
  const { titulo, subtitulo, nomeA, nomeB, linhas, empreendimento = null, apresentacao = null } = dados
  if (linhas.length === 0) return false

  const corpoTabela = linhas
    .map((linha) => {
      const celula_ = (texto: string, detalhe?: string | null) =>
        `<td class="${texto === TRACO_TELA ? 'vazio' : ''}">${esc(texto)}${
          detalhe ? `<span class="detalhe">${esc(detalhe)}</span>` : ''
        }</td>`

      return `<tr>
      <th scope="row">${esc(linha.rotulo)}</th>
      ${celula_(linha.textoA, linha.detalheA)}
      ${celula_(linha.textoB, linha.detalheB)}
      <td class="${linha.diferenca === null ? 'vazio' : ''}">${esc(linha.textoDiferenca)}</td>
    </tr>`
    })
    .join('')

  const corpo = `
    <section class="secao">
      <h2 class="secao__titulo">Condições lado a lado</h2>
      <table>
        <thead>
          <tr>
            <th>Bloco</th>
            <th><span class="coluna__nome">${esc(nomeA)}</span><span class="coluna__meta">lado A</span></th>
            <th><span class="coluna__nome">${esc(nomeB)}</span><span class="coluna__meta">lado B</span></th>
            <th><span class="coluna__nome">Diferença</span><span class="coluna__meta">B − A</span></th>
          </tr>
        </thead>
        <tbody>${corpoTabela}</tbody>
      </table>
    </section>

    <div class="nota">
      <div class="nota__titulo">Como ler este comparativo</div>
      A coluna <strong>Diferença</strong> é o lado B menos o lado A: valor com <strong>+</strong> é o que a segunda
      tabela cobra a mais naquele bloco, e com <strong>−</strong> o que ela cobra a menos. Linhas em que um dos lados
      não tem o dado ficam sem diferença — campo em branco é informação que falta, não zero.
      O <strong>pós-chaves</strong> não entra no total durante a obra: ele é parcelado depois da entrega, e somá-lo ali
      faria o imóvel parecer o dobro do que custa até as chaves. O <strong>saldo na entrega</strong> é o que resta para
      o financiamento. Os valores refletem as tabelas cadastradas na data de emissão e não constituem proposta
      comercial.
    </div>`

  return folha({
    documento: `${titulo} — fluxos de pagamento`,
    chapeu: 'Fluxos de pagamento',
    titulo: nomeA,
    contra: nomeB,
    empreendimento,
    unidade: titulo,
    subtitulo: subtitulo || `Condições de ${titulo}, bloco a bloco, com a diferença entre as duas tabelas.`,
    corpo,
    rodape: titulo,
    apresentacao,
  })
}

/* ------------------------------------------------------------------ */
/* Unidades lado a lado (ate quatro colunas)                           */
/* ------------------------------------------------------------------ */

export interface ColunaDeUnidade {
  unidade: string
  empreendimento: string
}

export interface CelulaDeUnidade {
  texto: string
  detalhe?: string | null
  vence: boolean
}

export interface LinhaDeUnidades {
  rotulo: string
  celulas: CelulaDeUnidade[]
}

/**
 * A folha do "Comparar unidades": uma coluna por unidade escolhida, com o
 * melhor de cada linha marcado — a mesma linguagem visual do comparativo
 * A x B, porque o corretor costuma levar os dois no mesmo envelope.
 */
export function exportarPdfUnidades(dados: {
  subtitulo?: string | null
  colunas: ColunaDeUnidade[]
  linhas: LinhaDeUnidades[]
  apresentacao?: Apresentacao | null
}): boolean {
  const { subtitulo, colunas, linhas, apresentacao = null } = dados
  if (colunas.length === 0 || linhas.length === 0) return false

  const cabecalho = colunas
    .map(
      (coluna) => `<th>
      <span class="coluna__nome">${esc(coluna.unidade)}</span>
      <span class="coluna__meta">${esc(coluna.empreendimento)}</span>
    </th>`,
    )
    .join('')

  const corpoTabela = linhas
    .map((linha) => {
      const celulas = linha.celulas
        .map(
          (item) => `<td class="${item.vence ? 'vence' : ''}">${item.vence ? SELO : ''}${esc(item.texto)}${
            item.detalhe ? `<span class="detalhe">${esc(item.detalhe)}</span>` : ''
          }</td>`,
        )
        .join('')
      return `<tr><th scope="row">${esc(linha.rotulo)}</th>${celulas}</tr>`
    })
    .join('')

  const quantas = `${colunas.length} ${colunas.length === 1 ? 'unidade' : 'unidades'}`

  const corpo = `
    <section class="secao">
      <h2 class="secao__titulo">Lado a lado — ${esc(quantas)}</h2>
      <table>
        <thead><tr><th>Indicador</th>${cabecalho}</tr></thead>
        <tbody>${corpoTabela}</tbody>
      </table>
    </section>

    <div class="nota">
      <div class="nota__titulo">Como ler este comparativo</div>
      O selo <strong>&#10003;</strong> e o negrito marcam o melhor de cada linha — <strong>menor</strong> para preço,
      entrada e capital até a entrega; <strong>maior</strong> para metragem, dormitórios e vagas. O saldo na entrega
      não entra na disputa: mais saldo é pior para quem tem capital e melhor para quem depende de financiamento.
      Linhas com um só número não têm vencedor. Os valores refletem as tabelas cadastradas na data de emissão e
      não constituem proposta comercial.
    </div>`

  return folha({
    documento: 'Comparativo de unidades',
    chapeu: 'Relatório comparativo',
    titulo: 'Comparativo de unidades',
    // Uma coluna só de um prédio: o nome dele vira a identificação da folha.
    empreendimento: colunas.every((coluna) => coluna.empreendimento === colunas[0].empreendimento)
      ? colunas[0].empreendimento
      : null,
    subtitulo: subtitulo || `${quantas} lado a lado. O melhor de cada linha vem marcado.`,
    corpo,
    rodape: quantas,
    apresentacao,
  })
}

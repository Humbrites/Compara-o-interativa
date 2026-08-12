/**
 * Cenario de DEMONSTRACAO da analise de oportunidade.
 *
 *   npm run seed:analise                  usa a conta de demonstracao
 *   npm run seed:analise -- --conta 11    usa a conta que voce disser
 *   npm run seed:analise -- --limpar      remove so o que este script criou
 *
 * Existe porque a analise (niveis 1, 2 e 3, score, nominal × efetivo) so tem o
 * que mostrar quando ha UNIDADES com TABELA DE VENDA — e a base de exemplo
 * antiga tinha empreendimentos vazios. Os numeros aqui nao sao aleatorios:
 * cada unidade foi escolhida para exercitar uma leitura diferente.
 */
import { db } from './db.js'
import { recalcularResumo } from './resumo.js'

/** Prefixo proprio: o `seed:limpar` mexe nos `[exemplo]`, este mexe nos seus. */
const MARCA = '[demo]'

const CENARIOS = [
  {
    empreendimento: {
      nome: `${MARCA} Residencial Aurora`,
      construtora: 'Construtora Aurora',
      cidade: 'Curitiba',
      bairro: 'Batel',
      endereco: 'Rua Comendador Araújo, 640',
      latitude: -25.4372,
      longitude: -49.2869,
      status_obra: 'Em obras',
      entrega: '2027-12',
      tipo: 'Apartamento',
      observacoes:
        'Seis plantas do studio à cobertura — o prédio que mostra a distribuição de preços e a diferença entre ticket médio e mediana.',
    },
    unidades: [
      // Entrada leve e parcelamento longo: a melhor nota do prédio.
      {
        identificacao: 'Studio 301',
        tipologia: 'Studio',
        torre: 'Única',
        andar: 3,
        numero: '301',
        metragem: 32,
        metragem_total: 38,
        dormitorios: 1,
        suites: 0,
        banheiros: 1,
        vagas: 1,
        posicao_solar: 'Norte',
        face: 'Frente',
        valor: 335000,
        status: 'Disponível',
        tabela: { entradaPct: 8, parcelas: 48, reforcos: 2 },
      },
      {
        identificacao: 'Apto 502',
        tipologia: '2 dormitórios',
        torre: 'Única',
        andar: 5,
        numero: '502',
        metragem: 58,
        metragem_total: 72,
        dormitorios: 2,
        suites: 1,
        banheiros: 2,
        vagas: 1,
        posicao_solar: 'Leste',
        face: 'Frente',
        valor: 520000,
        status: 'Disponível',
        tabela: { entradaPct: 15, parcelas: 36, reforcos: 3 },
      },
      // Mesma planta do 502, andar alto e mais caro: o "acima da média" do m².
      {
        identificacao: 'Apto 704',
        tipologia: '2 dormitórios',
        torre: 'Única',
        andar: 7,
        numero: '704',
        metragem: 58,
        metragem_total: 72,
        dormitorios: 2,
        suites: 1,
        banheiros: 2,
        vagas: 1,
        posicao_solar: 'Norte',
        face: 'Frente',
        valor: 585000,
        status: 'Disponível',
        tabela: { entradaPct: 25, parcelas: 24, reforcos: 2 },
      },
      {
        identificacao: 'Apto 901',
        tipologia: '3 dormitórios',
        torre: 'Única',
        andar: 9,
        numero: '901',
        metragem: 72,
        metragem_total: 88,
        dormitorios: 3,
        suites: 1,
        banheiros: 2,
        vagas: 2,
        posicao_solar: 'Nordeste',
        face: 'Frente',
        valor: 690000,
        status: 'Disponível',
        tabela: { entradaPct: 20, parcelas: 36, reforcos: 3 },
      },
      // Entrada pesada e prazo curto: a nota mais baixa, e o porquê aparece.
      {
        identificacao: 'Garden 101',
        tipologia: 'Garden',
        torre: 'Única',
        andar: 1,
        numero: '101',
        metragem: 88,
        metragem_total: 120,
        dormitorios: 3,
        suites: 1,
        banheiros: 3,
        vagas: 2,
        posicao_solar: 'Sul',
        face: 'Fundos',
        valor: 845000,
        status: 'Reservada',
        tabela: { entradaPct: 30, parcelas: 18, reforcos: 1 },
      },
      // A cauda cara: é ela que separa o ticket médio da mediana.
      {
        identificacao: 'Cobertura 1201',
        tipologia: 'Cobertura',
        torre: 'Única',
        andar: 12,
        numero: '1201',
        metragem: 140,
        metragem_total: 190,
        dormitorios: 4,
        suites: 2,
        banheiros: 4,
        vagas: 3,
        posicao_solar: 'Norte',
        face: 'Frente',
        valor: 1980000,
        status: 'Disponível',
        tabela: { entradaPct: 20, parcelas: 36, reforcos: 4 },
      },
    ],
  },
  {
    empreendimento: {
      nome: `${MARCA} Praia Brava Residence`,
      construtora: 'Incorporadora Litoral',
      cidade: 'Itajaí',
      bairro: 'Praia Brava',
      endereco: 'Avenida José Medeiros Vieira, 1200',
      latitude: -26.9451,
      longitude: -48.6323,
      status_obra: 'Pronto para morar',
      entrega: '2026-06',
      tipo: 'Apartamento',
      observacoes: 'Frente-mar, pronto para morar — serve para comparar unidades entre empreendimentos diferentes.',
    },
    unidades: [
      {
        identificacao: 'Apto 203',
        tipologia: '2 dormitórios',
        torre: 'Mar',
        andar: 2,
        numero: '203',
        metragem: 65,
        metragem_total: 80,
        dormitorios: 2,
        suites: 2,
        banheiros: 3,
        vagas: 2,
        posicao_solar: 'Leste',
        face: 'Frente',
        valor: 780000,
        status: 'Disponível',
        tabela: { entradaPct: 30, parcelas: 12, reforcos: 0 },
      },
      {
        identificacao: 'Apto 405',
        tipologia: '3 dormitórios',
        torre: 'Mar',
        andar: 4,
        numero: '405',
        metragem: 92,
        metragem_total: 110,
        dormitorios: 3,
        suites: 2,
        banheiros: 3,
        vagas: 2,
        posicao_solar: 'Leste',
        face: 'Frente',
        valor: 1150000,
        status: 'Disponível',
        tabela: { entradaPct: 25, parcelas: 24, reforcos: 2 },
      },
      {
        identificacao: 'Cobertura 801',
        tipologia: 'Cobertura',
        torre: 'Mar',
        andar: 8,
        numero: '801',
        metragem: 155,
        metragem_total: 200,
        dormitorios: 4,
        suites: 3,
        banheiros: 5,
        vagas: 3,
        posicao_solar: 'Nordeste',
        face: 'Frente',
        valor: 2400000,
        status: 'Disponível',
        tabela: { entradaPct: 20, parcelas: 30, reforcos: 3 },
      },
    ],
  },
]

/**
 * Monta a tabela de venda que FECHA o valor da unidade.
 *
 * O financiamento e o resto (valor − entrada − parcelas − reforcos): sem isso
 * o "nominal × efetivo" mostraria uma conta que nao bate, que e justamente o
 * erro que a tela existe para denunciar.
 */
function montarTabela(valor, { entradaPct, parcelas, reforcos }) {
  const entrada = Math.round((valor * entradaPct) / 100)
  // As parcelas consomem ~18% do valor e os reforcos ~10%: e a proporcao
  // tipica de uma tabela de obra brasileira.
  const totalParcelas = Math.round(valor * 0.18)
  const parcelaValor = parcelas > 0 ? Math.round(totalParcelas / parcelas) : 0
  const reforcoValor = reforcos > 0 ? Math.round((valor * 0.1) / reforcos) : 0

  const pago = entrada + parcelaValor * parcelas + reforcoValor * reforcos
  const financiamento = Math.max(0, valor - pago)

  return {
    nome: 'Tabela padrão',
    cub_valor_imovel: valor,
    entrada_valor: entrada,
    entrada_pct: entradaPct,
    parcelas,
    parcela_valor: parcelaValor,
    reforcos_qtd: reforcos,
    reforco_valor: reforcoValor,
    financiamento_valor: financiamento,
    financiamento_pct: Math.round((financiamento / valor) * 10000) / 100,
    descricao: `Entrada de ${entradaPct}%, ${parcelas} parcelas${reforcos > 0 ? ` e ${reforcos} reforço(s)` : ''}.`,
  }
}

function contaAlvo(pedida) {
  if (pedida) {
    const conta = db.prepare('SELECT id, nome FROM contas WHERE id = ?').get(Number(pedida))
    if (!conta) throw new Error(`Conta ${pedida} não existe`)
    return conta
  }

  const demonstracao = db.prepare('SELECT id, nome FROM contas WHERE demonstracao = 1').get()
  if (demonstracao) return demonstracao

  const primeira = db.prepare('SELECT id, nome FROM contas ORDER BY id LIMIT 1').get()
  if (!primeira) throw new Error('Não há conta nenhuma no banco — provisione uma antes')
  return primeira
}

function limpar(contaId) {
  const alvos = db
    .prepare('SELECT id, nome FROM empreendimentos WHERE conta_id = ? AND nome LIKE ?')
    .all(contaId, `${MARCA}%`)

  for (const alvo of alvos) {
    // ON DELETE CASCADE leva unidades, fluxos e imagens junto.
    db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(alvo.id)
    console.log(`  − ${alvo.nome}`)
  }
  return alvos.length
}

function inserir(contaId) {
  const criarEmpreendimento = db.prepare(`
    INSERT INTO empreendimentos
      (conta_id, nome, construtora, cidade, bairro, endereco, latitude, longitude,
       status_obra, entrega, tipo, observacoes)
    VALUES (@conta_id, @nome, @construtora, @cidade, @bairro, @endereco, @latitude, @longitude,
            @status_obra, @entrega, @tipo, @observacoes)
  `)

  const criarUnidade = db.prepare(`
    INSERT INTO unidades
      (empreendimento_id, identificacao, tipologia, torre, andar, numero, metragem, metragem_total,
       dormitorios, suites, banheiros, vagas, posicao_solar, face, valor, status)
    VALUES (@empreendimento_id, @identificacao, @tipologia, @torre, @andar, @numero, @metragem,
            @metragem_total, @dormitorios, @suites, @banheiros, @vagas, @posicao_solar, @face,
            @valor, @status)
  `)

  const criarFluxo = db.prepare(`
    INSERT INTO fluxos_pagamento
      (empreendimento_id, unidade_id, nome, cub_valor_imovel, entrada_valor, entrada_pct,
       parcelas, parcela_valor, reforcos_qtd, reforco_valor, financiamento_valor,
       financiamento_pct, descricao)
    VALUES (@empreendimento_id, @unidade_id, @nome, @cub_valor_imovel, @entrada_valor, @entrada_pct,
            @parcelas, @parcela_valor, @reforcos_qtd, @reforco_valor, @financiamento_valor,
            @financiamento_pct, @descricao)
  `)

  const tudo = db.transaction(() => {
    for (const cenario of CENARIOS) {
      const empreendimentoId = criarEmpreendimento.run({ conta_id: contaId, ...cenario.empreendimento })
        .lastInsertRowid

      for (const { tabela, ...unidade } of cenario.unidades) {
        const unidadeId = criarUnidade.run({ empreendimento_id: empreendimentoId, ...unidade }).lastInsertRowid
        criarFluxo.run({
          empreendimento_id: empreendimentoId,
          unidade_id: unidadeId,
          ...montarTabela(unidade.valor, tabela),
        })
      }

      // Os números gerais (m², metragens, dormitórios) saem das unidades.
      recalcularResumo(empreendimentoId)
      console.log(`  + ${cenario.empreendimento.nome} (${cenario.unidades.length} unidades)`)
    }
  })

  tudo()
}

/* ------------------------------------------------------------------ */

const argumentos = process.argv.slice(2)
const querLimpar = argumentos.includes('--limpar')
const indiceConta = argumentos.indexOf('--conta')
const conta = contaAlvo(indiceConta >= 0 ? argumentos[indiceConta + 1] : null)

console.log(`\nCenário de análise — conta ${conta.id} (${conta.nome})\n`)

const removidos = limpar(conta.id)

if (querLimpar) {
  console.log(`\n${removidos} empreendimento(s) de demonstração removido(s).\n`)
} else {
  inserir(conta.id)
  const total = db
    .prepare('SELECT COUNT(*) AS total FROM unidades u JOIN empreendimentos e ON e.id = u.empreendimento_id WHERE e.conta_id = ? AND e.nome LIKE ?')
    .get(conta.id, `${MARCA}%`).total

  console.log(`\nPronto: ${CENARIOS.length} empreendimentos e ${total} unidades, cada uma com tabela de venda.`)
  console.log('Abra um deles no mapa, clique numa unidade e use "Analisar" — e "Comparar" para vê-las lado a lado.')
  console.log(`Para remover depois: npm run seed:analise -- --limpar --conta ${conta.id}\n`)
}

/**
 * Popula o banco com exemplos ficticios para conhecer a ferramenta.
 *
 *   npm run seed          insere os exemplos
 *   npm run seed:limpar   remove SO os exemplos (pelo nome), preservando o resto
 *
 * A base padrao nasce vazia — isto aqui e opcional.
 */
import { db, CAMPOS_EMPREENDIMENTO, CAMPOS_FLUXO, sanitizar } from './db.js'

const EXEMPLOS = [
  {
    empreendimento: {
      nome: '[exemplo] Residencial Vista Verde',
      construtora: 'Construtora Alfa',
      cidade: 'Curitiba',
      bairro: 'Batel',
      endereco: 'Rua Comendador Araújo, 100',
      latitude: -25.4372,
      longitude: -49.2869,
      valor_m2: 12300,
      metragem_min: 58,
      metragem_max: 92,
      dormitorios: 3,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      status_obra: 'Em obras',
      entrega: '2027-06',
      tipo: 'Apartamento',
      observacoes: 'Lazer completo na cobertura. Fica a duas quadras do shopping.',
    },
    fluxos: [
      {
        nome: 'Tabela padrão',
        entrada_pct: 20,
        entrada_valor: 60000,
        parcelas: 36,
        parcela_valor: 2500,
        reforcos_qtd: 3,
        reforco_valor: 15000,
        chaves_pct: 10,
        financiamento_pct: 80,
        descricao: 'Entrada em 3x sem juros. Reforços anuais em dezembro.',
      },
      {
        nome: 'Plano obra',
        entrada_pct: 15,
        parcelas: 48,
        reforcos_qtd: 2,
        chaves_pct: 8,
        financiamento_pct: 85,
        descricao: 'Parcelas menores durante a obra, saldo maior no financiamento.',
      },
    ],
  },
  {
    empreendimento: {
      nome: '[exemplo] Edifício Horizonte',
      construtora: 'Beta Incorporadora',
      cidade: 'Curitiba',
      bairro: 'Água Verde',
      endereco: 'Avenida República Argentina, 2000',
      latitude: -25.452,
      longitude: -49.279,
      valor_m2: 10800,
      metragem_min: 45,
      metragem_max: 78,
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 1,
      status_obra: 'Pronto para morar',
      entrega: '2026-12',
      tipo: 'Apartamento',
      observacoes: 'Unidades prontas para morar, com decorado montado.',
    },
    fluxos: [
      {
        nome: 'Tabela única',
        entrada_pct: 15,
        entrada_valor: 40000,
        parcelas: 48,
        parcela_valor: 1800,
        reforcos_qtd: 2,
        reforco_valor: 12000,
        chaves_pct: 12,
        financiamento_pct: 85,
        descricao: 'Sem reforço no primeiro ano.',
      },
    ],
  },
  {
    empreendimento: {
      nome: '[exemplo] Solar das Palmeiras',
      construtora: 'Gama Empreendimentos',
      cidade: 'Curitiba',
      bairro: 'Champagnat',
      endereco: 'Rua Bruno Filgueira, 1500',
      latitude: -25.4285,
      longitude: -49.3005,
      valor_m2: 14500,
      metragem_min: 96,
      metragem_max: 180,
      dormitorios: 4,
      suites: 2,
      banheiros: 4,
      vagas: 3,
      status_obra: 'Lançamento',
      entrega: '2029-03',
      tipo: 'Apartamento',
      observacoes: 'Alto padrão, 2 unidades por andar.',
    },
    fluxos: [
      {
        nome: 'Lançamento',
        entrada_pct: 25,
        parcelas: 60,
        reforcos_qtd: 5,
        reforco_valor: 30000,
        chaves_pct: 15,
        financiamento_pct: 70,
        descricao: 'Condição especial de lançamento, válida por 30 dias.',
      },
    ],
  },
]

const PREFIXO = '[exemplo]'

function limpar() {
  const alvo = db.prepare('SELECT id, nome FROM empreendimentos WHERE nome LIKE ?').all(`${PREFIXO}%`)
  if (alvo.length === 0) {
    console.log('Nenhum exemplo encontrado — nada a remover.')
    return
  }
  // ON DELETE CASCADE leva os fluxos junto.
  db.prepare(`DELETE FROM empreendimentos WHERE nome LIKE ?`).run(`${PREFIXO}%`)
  console.log(`Removidos ${alvo.length} exemplos:`)
  for (const item of alvo) console.log(`  - ${item.nome}`)
}

function inserir() {
  const jaExiste = db.prepare('SELECT COUNT(*) AS total FROM empreendimentos WHERE nome LIKE ?').get(`${PREFIXO}%`)
  if (jaExiste.total > 0) {
    console.log('Os exemplos já estão no banco. Use "npm run seed:limpar" para removê-los.')
    return
  }

  const gravar = db.transaction(() => {
    for (const { empreendimento, fluxos } of EXEMPLOS) {
      const dados = sanitizar(empreendimento, CAMPOS_EMPREENDIMENTO)
      const colunas = Object.keys(dados)
      const id = db
        .prepare(
          `INSERT INTO empreendimentos (${colunas.join(', ')}) VALUES (${colunas.map((c) => `@${c}`).join(', ')})`,
        )
        .run(dados).lastInsertRowid

      for (const fluxo of fluxos) {
        const dadosFluxo = sanitizar({ ...fluxo, empreendimento_id: id }, CAMPOS_FLUXO)
        const colunasFluxo = Object.keys(dadosFluxo)
        db.prepare(
          `INSERT INTO fluxos_pagamento (${colunasFluxo.join(', ')})
           VALUES (${colunasFluxo.map((c) => `@${c}`).join(', ')})`,
        ).run(dadosFluxo)
      }

      console.log(`  + ${empreendimento.nome} (${fluxos.length} fluxo(s))`)
    }
  })

  console.log('Inserindo exemplos:')
  gravar()
  console.log('\nPronto. Rode "npm run seed:limpar" quando quiser removê-los.')
}

if (process.argv.includes('--limpar')) limpar()
else inserir()

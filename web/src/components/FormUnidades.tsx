import { useCallback, useMemo, useState } from 'react'
import type { Empreendimento, Unidade, UnidadeInput } from '../types'
import { api } from '../lib/api'
import { lerNumero } from '../lib/cub'
import { fmtArea, fmtMoeda } from '../lib/format'
import { FACES, POSICOES_SOLARES, STATUS_UNIDADE, TIPOLOGIAS } from '../lib/opcoes'
import { calcularValorM2, precoDaUnidade, rotuloUnidade, valorNoFluxo } from '../lib/unidades'
import { Campo, Estado } from './ui'
import { Icone } from './Icones'
import { CartaoUnidade } from './CartaoUnidade'
import {
  CamposFluxo,
  FluxosDoEmpreendimento,
  FLUXO_VAZIO,
  fluxoParaEnvio,
  fluxoTemNumeros,
  mudarCampoFluxo,
  type FormularioFluxo,
} from './FormFluxos'
import { CalculadoraCub } from './CalculadoraCub'
import { ImportarTabela } from './ImportarTabela'
import { usePodeEditar } from '../lib/permissao'

type Formulario = Record<string, string>

const CAMPOS = [
  'identificacao', 'tipologia', 'torre', 'andar', 'numero',
  'metragem', 'metragem_total',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'posicao_solar', 'face', 'valor', 'valor_m2', 'status', 'observacoes',
]

const VAZIO: Formulario = Object.fromEntries(CAMPOS.map((campo) => [campo, '']))

function paraFormulario(unidade: Unidade): Formulario {
  const form: Formulario = { ...VAZIO }
  for (const campo of CAMPOS) {
    const valor = (unidade as unknown as Record<string, unknown>)[campo]
    form[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  return form
}

interface Props {
  empreendimentoId: number
  /**
   * O empreendimento inteiro, quando quem monta a tela ja o tem em maos (o
   * cadastro, na etapa 2). Ele destrava o "Importar tabela" aqui dentro: a
   * importacao precisa do NOME do predio para montar o prompt. Sem ele a
   * secao segue exatamente como era — o painel do imovel tem o botao dele.
   */
  empreendimento?: Empreendimento
  unidades: Unidade[]
  onMudou: (unidades: Unidade[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function UnidadesDoEmpreendimento({
  empreendimentoId,
  empreendimento,
  unidades,
  onMudou,
  avisar,
}: Props) {
  const podeEditar = usePodeEditar()
  const [importando, setImportando] = useState(false)
  const [form, setForm] = useState<Formulario | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Primeiro fluxo da unidade nova: sai no mesmo "Adicionar unidade".
  const [fluxoNovo, setFluxoNovo] = useState<FormularioFluxo>({ ...FLUXO_VAZIO })
  // Qual unidade esta com o bloco de fluxos aberto.
  const [fluxosAbertos, setFluxosAbertos] = useState<number | null>(null)
  // Qual unidade esta com a calculadora do CUB aberta.
  const [cubAberto, setCubAberto] = useState<Unidade | null>(null)

  // O valor do m² se preenche sozinho ate alguem digitar outro numero ali.
  const [valorM2Manual, setValorM2Manual] = useState(false)
  // Valor total do imovel sendo digitado no fluxo de pagamento aberto logo
  // abaixo (edicao). Vem do filho porque o m² acompanha a tecla, sem salvar.
  const [valorImovelDigitado, setValorImovelDigitado] = useState('')

  const emEdicao = editandoId !== null ? unidades.find((u) => u.id === editandoId) ?? null : null

  /**
   * O preco que alimenta o m², na ordem em que a tela oferece: o "valor da
   * unidade", o valor total do imovel que esta sendo digitado no fluxo de
   * pagamento (unidade nova ou fluxo aberto na edicao) e, por fim, o que ja
   * ficou gravado numa tabela da unidade.
   */
  const precoNoFormulario = useMemo(
    () =>
      lerNumero(form?.valor ?? '') ??
      lerNumero(fluxoNovo.cub_valor_imovel ?? '') ??
      lerNumero(valorImovelDigitado) ??
      valorNoFluxo(emEdicao?.fluxos),
    [form?.valor, fluxoNovo.cub_valor_imovel, valorImovelDigitado, emEdicao],
  )

  /** A metragem que a conta usou — a mesma ordem de `calcularValorM2`. */
  const baseDoValorM2 = useMemo(
    () => lerNumero(form?.metragem_total ?? '') ?? lerNumero(form?.metragem ?? ''),
    [form?.metragem_total, form?.metragem],
  )

  /**
   * O m² que sai da conta: preco ÷ metragem total (privativa so na falta
   * dela). Recalcula a cada tecla na metragem OU no valor do imovel — nao ha
   * botao nenhum a apertar.
   */
  const valorM2Automatico = useMemo(() => {
    if (!form) return null
    return calcularValorM2(precoNoFormulario, lerNumero(form.metragem_total), lerNumero(form.metragem))
  }, [form, precoNoFormulario])

  /** O que aparece no campo: o digitado a mao ou o calculado. */
  const valorM2NoCampo = valorM2Manual
    ? form?.valor_m2 ?? ''
    : valorM2Automatico !== null
      ? valorM2Automatico.toFixed(2).replace('.', ',')
      : ''

  function abrirNova() {
    setEditandoId(null)
    setForm({ ...VAZIO, status: 'Disponível' })
    setFluxoNovo({ ...FLUXO_VAZIO })
    setValorM2Manual(false)
    setValorImovelDigitado('')
  }

  function abrirEdicao(unidade: Unidade) {
    setEditandoId(unidade.id)
    setForm(paraFormulario(unidade))
    setFluxoNovo({ ...FLUXO_VAZIO })
    setValorImovelDigitado('')
    // Unidade gravada com um m² que a conta nao devolve foi ajustada a mao —
    // recalcular por cima apagaria a escolha de quem cadastrou.
    const daConta = calcularValorM2(
      unidade.valor ?? valorNoFluxo(unidade.fluxos),
      unidade.metragem_total,
      unidade.metragem,
    )
    setValorM2Manual(
      unidade.valor_m2 !== null && (daConta === null || Math.abs(unidade.valor_m2 - daConta) > 0.01),
    )
  }

  function fechar() {
    setForm(null)
    setEditandoId(null)
    setFluxoNovo({ ...FLUXO_VAZIO })
    setValorM2Manual(false)
    setValorImovelDigitado('')
  }

  /** Estavel: o filho reporta no efeito, e funcao nova a cada render reexecutaria. */
  const ouvirValorImovel = useCallback((texto: string) => setValorImovelDigitado(texto), [])

  /** Digitar no campo do m² assume o comando; o link devolve para a conta. */
  function mudarValorM2(valor: string) {
    setValorM2Manual(true)
    mudar('valor_m2', valor)
  }

  function voltarAoValorM2Automatico() {
    setValorM2Manual(false)
    mudar('valor_m2', '')
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual))
  }

  function mudarFluxo(campo: string, valor: string) {
    setFluxoNovo((atual) => mudarCampoFluxo(atual, campo, valor))
  }

  function entrada(campo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        className="entrada"
        value={form?.[campo] ?? ''}
        onChange={(e) => mudar(campo, e.target.value)}
        {...extra}
      />
    )
  }

  function selecao(campo: string, opcoes: readonly string[]) {
    return (
      <select className="entrada" value={form?.[campo] ?? ''} onChange={(e) => mudar(campo, e.target.value)}>
        <option value="">Selecione…</option>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
    )
  }

  async function salvar() {
    if (!form) return
    setSalvando(true)
    try {
      // Campo em branco vai como null: o comparativo precisa distinguir
      // "nao informado" de zero.
      const dados: UnidadeInput = { empreendimento_id: empreendimentoId }
      for (const campo of CAMPOS) {
        dados[campo as keyof UnidadeInput] = form[campo].trim() || null
      }
      // O m² pode estar so na tela (calculado, sem ninguem ter digitado):
      // vai gravado do mesmo jeito, e o que se ve e o que fica.
      dados.valor_m2 = valorM2NoCampo.trim() || null

      if (editandoId !== null) {
        const atualizada = await api.editarUnidade(editandoId, dados)
        // A API devolve a unidade sem os fluxos que ja estavam na tela.
        onMudou(unidades.map((u) => (u.id === editandoId ? { ...atualizada, fluxos: u.fluxos } : u)))
        avisar('Unidade atualizada')
        fechar()
        return
      }

      const criada = await api.criarUnidade(dados)

      // O fluxo so existe depois da unidade — e so vale a pena gravar se
      // tiver numero: nome sozinho nao descreve tabela de venda nenhuma.
      if (fluxoTemNumeros(fluxoNovo)) {
        try {
          const fluxo = await api.criarFluxo(fluxoParaEnvio(fluxoNovo, empreendimentoId, criada.id))
          onMudou([...unidades, { ...criada, fluxos: [fluxo] }])
          avisar('Unidade e fluxo de pagamento adicionados')
        } catch (erro) {
          // A unidade ja esta gravada: o fluxo fica para a edicao dela.
          onMudou([...unidades, criada])
          const motivo = erro instanceof Error ? erro.message : 'o fluxo não foi salvo'
          avisar(`Unidade adicionada, mas ${motivo}. Abra a unidade para cadastrar o fluxo`, 'erro')
        }
      } else {
        onMudou([...unidades, criada])
        avisar('Unidade adicionada')
      }
      fechar()
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar a unidade', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(unidade: Unidade) {
    const nome = rotuloUnidade(unidade)
    if (!window.confirm(`Excluir ${nome}? Os fluxos de pagamento dela também serão removidos.`)) return

    try {
      await api.excluirUnidade(unidade.id)
      onMudou(unidades.filter((u) => u.id !== unidade.id))
      avisar('Unidade excluída')
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao excluir', 'erro')
    }
  }

  /** Guarda os fluxos de uma unidade sem recarregar a lista inteira. */
  function trocarFluxos(unidadeId: number, fluxos: Unidade['fluxos']) {
    onMudou(unidades.map((u) => (u.id === unidadeId ? { ...u, fluxos } : u)))
  }

  /** A simulacao do CUB vira um fluxo daquela unidade. */
  async function gerarFluxoDoCub(unidade: Unidade, dados: Parameters<typeof api.criarFluxo>[0]) {
    const criado = await api.criarFluxo({
      ...dados,
      empreendimento_id: empreendimentoId,
      unidade_id: unidade.id,
    })
    trocarFluxos(unidade.id, [...unidade.fluxos, criado])
    setFluxosAbertos(unidade.id)
    avisar('Fluxo gerado pela calculadora do CUB')
  }

  /**
   * O atalho da tabela da construtora so aparece onde ha empreendimento em
   * maos (e quem pode gravar): digitar a primeira unidade a mao para depois
   * descobrir o importador seria a ordem errada.
   */
  const podeImportar = Boolean(empreendimento) && podeEditar

  const botaoImportar = (pequeno: boolean) =>
    podeImportar ? (
      <button
        type="button"
        className={`btn btn--secundario${pequeno ? ' btn--pequeno' : ''}`}
        onClick={() => setImportando(true)}
        title="Ler a tabela de vendas da construtora e cadastrar as unidades de uma vez"
      >
        <Icone nome="lista" tamanho={pequeno ? 14 : 15} />
        Importar tabela
      </button>
    ) : null

  return (
    <div>
      {unidades.length === 0 && !form && (
        <Estado
          icone="predio"
          titulo="Nenhuma unidade cadastrada"
          texto={
            podeImportar
              ? 'Cadastre as unidades que o corretor vende — cada uma com a própria metragem, dormitórios, vagas, posição e tabela de pagamento. Se você tem a tabela de vendas da construtora, importe-a e o prédio inteiro entra de uma vez, sem digitar unidade por unidade.'
              : 'Cadastre as unidades que o corretor vende — cada uma com a própria metragem, dormitórios, vagas, posição e tabela de pagamento. Elas podem ser comparadas uma a uma.'
          }
          acao={
            <div className="estado__acoes">
              <button type="button" className="btn btn--primario" onClick={abrirNova}>
                <Icone nome="mais" tamanho={15} />
                Adicionar unidade
              </button>
              {botaoImportar(false)}
            </div>
          }
        />
      )}

      {/* Com seis unidades cadastradas, o "Adicionar" do fim da lista fica a uma
          rolagem de distancia — quem esta cadastrando o predio inteiro adiciona
          uma atras da outra. O mesmo botao aparece aqui em cima. */}
      {unidades.length > 2 && !form && (
        <div className="unidades__topo">
          <span className="unidades__contagem">
            {unidades.length} {unidades.length === 1 ? 'unidade cadastrada' : 'unidades cadastradas'}
          </span>
          {botaoImportar(true)}
          <button type="button" className="btn btn--secundario btn--pequeno" onClick={abrirNova}>
            <Icone nome="mais" tamanho={14} />
            Adicionar unidade
          </button>
        </div>
      )}

      {unidades.length > 0 && (
        <div style={{ marginBottom: form ? 'var(--e5)' : 0 }}>
          {unidades.map((unidade, indice) => (
            <CartaoUnidade
              key={unidade.id}
              unidade={unidade}
              indice={indice}
              onEditar={() => abrirEdicao(unidade)}
              onExcluir={() => void excluir(unidade)}
              // Editando esta unidade, o fluxo dela ja esta aberto no
              // formulario logo abaixo — dois blocos iguais so confundem.
              rodape={
                editandoId === unidade.id ? null : (
                <>
                  <div className="unidade__botoes">
                    <button
                      type="button"
                      className="btn btn--fantasma btn--pequeno"
                      onClick={() => setFluxosAbertos((atual) => (atual === unidade.id ? null : unidade.id))}
                    >
                      <Icone nome={fluxosAbertos === unidade.id ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
                      {unidade.fluxos.length === 0
                        ? 'Fluxos de pagamento'
                        : `Fluxos de pagamento (${unidade.fluxos.length})`}
                    </button>

                    <button type="button" className="btn btn--secundario btn--pequeno" onClick={() => setCubAberto(unidade)}>
                      <Icone nome="grafico" tamanho={13} />
                      Calcular com CUB
                    </button>
                  </div>

                  {fluxosAbertos === unidade.id && (
                    <div className="unidade__fluxos">
                      <FluxosDoEmpreendimento
                        empreendimentoId={empreendimentoId}
                        unidadeId={unidade.id}
                        titulo={rotuloUnidade(unidade, indice)}
                        valorSugerido={precoDaUnidade(unidade)}
                        fluxos={unidade.fluxos}
                        onMudou={(fluxos) => trocarFluxos(unidade.id, fluxos)}
                        avisar={avisar}
                      />
                    </div>
                  )}
                </>
                )
              }
            />
          ))}
        </div>
      )}

      {cubAberto && (
        <CalculadoraCub
          titulo={rotuloUnidade(cubAberto)}
          valorSugerido={precoDaUnidade(cubAberto)}
          onFechar={() => setCubAberto(null)}
          onGerarFluxo={(dados) => gerarFluxoDoCub(cubAberto, dados)}
          avisar={avisar}
        />
      )}

      {!form && unidades.length > 0 && (
        <div className="unidades__rodape">
          <button type="button" className="btn btn--secundario btn--bloco" onClick={abrirNova}>
            <Icone nome="mais" tamanho={15} />
            Adicionar outra unidade
          </button>
          {botaoImportar(false)}
        </div>
      )}

      {importando && empreendimento && (
        <ImportarTabela
          empreendimento={empreendimento}
          // A rota de confirmar devolve a lista inteira e pronta (com fluxos):
          // a mesma porta por onde a unidade salva a mao entra na tela.
          onImportou={(novas) => onMudou(novas)}
          avisar={avisar}
          onFechar={() => setImportando(false)}
        />
      )}

      {form && (
        <section className="form-secao form-secao--aninhada">
          <h3 className="form-secao__titulo">
            <Icone nome="predio" tamanho={13} />
            {editandoId !== null ? 'Editar unidade' : 'Nova unidade'}
          </h3>

          <p className="subgrupo__titulo">Qual é a unidade</p>
          <div className="grade">
            <Campo rotulo="Identificação" className="col-span-2" dica="como o corretor chama">
              {entrada('identificacao', { placeholder: 'Ex.: Tipo A, Cobertura, Apto 1204', autoFocus: true })}
            </Campo>
            <Campo rotulo="Tipologia" dica="o que a planta oferece">
              {selecao('tipologia', TIPOLOGIAS)}
            </Campo>
            <Campo rotulo="Status">{selecao('status', STATUS_UNIDADE)}</Campo>

            <Campo rotulo="Torre / bloco">{entrada('torre', { placeholder: 'Ex.: Torre 1' })}</Campo>
            <Campo rotulo="Andar">{entrada('andar', { placeholder: '12', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Número">{entrada('numero', { placeholder: '1204' })}</Campo>

            <Campo rotulo="Posição solar" dica="para onde é voltada">
              {selecao('posicao_solar', POSICOES_SOLARES)}
            </Campo>
            <Campo rotulo="Face" dica="em relação à rua">
              {selecao('face', FACES)}
            </Campo>
          </div>

          <p className="subgrupo__titulo">O que ela tem</p>
          <div className="grade">
            <Campo rotulo="Metragem privativa" dica="m²">
              {entrada('metragem', { placeholder: '78', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Metragem total" dica="m²">
              {entrada('metragem_total', { placeholder: '96', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Dormitórios">{entrada('dormitorios', { placeholder: '3', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Suítes">{entrada('suites', { placeholder: '1', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Banheiros">{entrada('banheiros', { placeholder: '2', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Vagas">{entrada('vagas', { placeholder: '2', inputMode: 'numeric' })}</Campo>

          </div>

          <p className="subgrupo__titulo">Quanto custa</p>
          <div className="grade">
            <Campo rotulo="Valor da unidade" dica="R$">
              {entrada('valor', { placeholder: '842000', inputMode: 'decimal' })}
            </Campo>
            <Campo
              rotulo="Valor do m²"
              dica={
                valorM2Manual
                  ? 'informado à mão'
                  : lerNumero(form.metragem_total) !== null
                    ? 'automático: valor ÷ metragem total'
                    : 'automático: valor ÷ metragem'
              }
            >
              <input
                className={`entrada${valorM2Manual ? '' : ' entrada--calculada'}`}
                value={valorM2NoCampo}
                onChange={(e) => mudarValorM2(e.target.value)}
                placeholder="10800"
                inputMode="decimal"
              />
            </Campo>

            <Campo rotulo="Observações" className="col-inteira">
              <textarea
                className="entrada"
                value={form.observacoes}
                onChange={(e) => mudar('observacoes', e.target.value)}
                placeholder="Diferenciais da unidade: vista, varanda gourmet, depósito, andar alto…"
                rows={2}
              />
            </Campo>
          </div>

          {valorM2Manual ? (
            <p className="campo__dica linha-calculo">
              <Icone nome="lapis" tamanho={12} /> Valor do m² informado à mão.
              <button type="button" className="link-acao" onClick={voltarAoValorM2Automatico}>
                Voltar ao cálculo automático
              </button>
            </p>
          ) : (
            // A conta na tela: o corretor confere de onde saiu o numero sem
            // precisar refazer no celular.
            <p className="campo__dica linha-calculo">
              <Icone nome="info" tamanho={12} />
              {valorM2Automatico !== null ? (
                <>
                  {fmtMoeda(precoNoFormulario)}
                  {precoNoFormulario !== null && lerNumero(form.valor) === null && ' (do fluxo de pagamento)'} ÷{' '}
                  {fmtArea(baseDoValorM2)} = <strong>{fmtMoeda(valorM2Automatico)}/m²</strong>
                </>
              ) : precoNoFormulario === null ? (
                'Informe o valor da unidade ou o valor total do imóvel no fluxo de pagamento para o m² sair sozinho.'
              ) : (
                'Informe a metragem total (ou a privativa) para o m² sair sozinho.'
              )}
            </p>
          )}

          {/* O fluxo de pagamento e da unidade: entra no mesmo cadastro. Na
              unidade nova sai um primeiro fluxo junto do salvar; na edicao a
              lista inteira fica aqui, para personalizar por cliente. */}
          <h3 className="form-secao__titulo" style={{ marginTop: 'var(--e5)' }}>
            <Icone nome="cartao" tamanho={13} />
            Fluxo de pagamento desta unidade
            {editandoId === null && <span className="form-secao__opcional">— opcional, dá para cadastrar depois</span>}
          </h3>

          {editandoId === null ? (
            <CamposFluxo form={fluxoNovo} mudar={mudarFluxo} daUnidade />
          ) : (
            emEdicao && (
              <FluxosDoEmpreendimento
                empreendimentoId={empreendimentoId}
                unidadeId={emEdicao.id}
                titulo={rotuloUnidade(emEdicao)}
                valorSugerido={precoDaUnidade(emEdicao)}
                fluxos={emEdicao.fluxos}
                onMudou={(fluxos) => trocarFluxos(emEdicao.id, fluxos)}
                onValorImovel={ouvirValorImovel}
                avisar={avisar}
              />
            )
          )}

          <div style={{ display: 'flex', gap: 'var(--e3)', marginTop: 'var(--e4)' }}>
            <button type="button" className="btn btn--primario" onClick={salvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Icone nome="spinner" tamanho={15} className="girando" />
                  Salvando…
                </>
              ) : (
                <>
                  <Icone nome="check" tamanho={15} />
                  {editandoId !== null ? 'Salvar alterações' : 'Adicionar unidade'}
                </>
              )}
            </button>
            <button type="button" className="btn btn--fantasma" onClick={fechar}>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

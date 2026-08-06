import { Fragment, useState } from 'react'
import type { Empreendimento, EmpreendimentoInput, ImagemEmpreendimento, Unidade } from '../types'
import { STATUS_OBRA, TIPOS } from '../lib/opcoes'
import { api } from '../lib/api'
import { Campo, Modal } from './ui'
import { Icone } from './Icones'
import { FluxosDoEmpreendimento } from './FormFluxos'
import { UnidadesDoEmpreendimento } from './FormUnidades'
import { GaleriaUpload } from './GaleriaUpload'
import { CalculadoraCub } from './CalculadoraCub'

/** O formulario trabalha com texto puro; a conversao acontece no envio. */
type Formulario = Record<string, string>

const CAMPOS: string[] = [
  'nome', 'construtora', 'cidade', 'bairro', 'endereco',
  'latitude', 'longitude', 'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
  'status_obra', 'entrega', 'tipo', 'imagem_url', 'observacoes',
]

/**
 * Numeros do produto. Sao gerais do empreendimento, mas descrevem a mesma
 * coisa que cada unidade detalha — por isso moram na etapa das unidades, e
 * nao junto da identificacao.
 */
const CAMPOS_PRODUTO = [
  'valor_m2', 'metragem_min', 'metragem_max',
  'dormitorios', 'suites', 'banheiros', 'vagas',
]

function paraFormulario(e: Empreendimento | null): Formulario {
  const inicial: Formulario = {}
  for (const campo of CAMPOS) {
    const valor = e ? (e as unknown as Record<string, unknown>)[campo] : null
    inicial[campo] = valor === null || valor === undefined ? '' : String(valor)
  }
  return inicial
}

/** Erros da etapa 1: identificacao e localizacao. */
function validarDados(form: Formulario): Record<string, string> {
  const erros: Record<string, string> = {}

  if (!form.nome.trim()) erros.nome = 'Informe o nome do empreendimento'

  const lat = Number(form.latitude.replace(',', '.'))
  if (form.latitude.trim() && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    erros.latitude = 'Latitude deve ficar entre -90 e 90'
  }

  const lng = Number(form.longitude.replace(',', '.'))
  if (form.longitude.trim() && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    erros.longitude = 'Longitude deve ficar entre -180 e 180'
  }

  return erros
}

/** Erros do bloco de produto, que agora vive na etapa das unidades. */
function validarProduto(form: Formulario): Record<string, string> {
  const erros: Record<string, string> = {}

  const min = Number(form.metragem_min.replace(',', '.'))
  const max = Number(form.metragem_max.replace(',', '.'))
  if (form.metragem_min.trim() && form.metragem_max.trim() && Number.isFinite(min) && Number.isFinite(max) && min > max) {
    erros.metragem_max = 'A metragem máxima não pode ser menor que a mínima'
  }

  return erros
}

interface Props {
  /** null = cadastro novo. */
  empreendimento: Empreendimento | null
  /** Abre direto na etapa dos fluxos (usado pelo botao "adicionar fluxo"). */
  iniciarEmFluxos?: boolean
  /** Abre direto na etapa das unidades (botao "adicionar unidade" do painel). */
  iniciarEmUnidades?: boolean
  onFechar: () => void
  onSalvar: (dados: EmpreendimentoInput) => Promise<Empreendimento>
  onMudouFluxos: () => void
  onMudouImagens: (id: number, imagens: ImagemEmpreendimento[]) => void
  onMudouUnidades: (id: number, unidades: Unidade[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}

export function FormEmpreendimento({
  empreendimento,
  iniciarEmFluxos,
  iniciarEmUnidades,
  onFechar,
  onSalvar,
  onMudouFluxos,
  onMudouImagens,
  onMudouUnidades,
  avisar,
}: Props) {
  const [form, setForm] = useState<Formulario>(() => paraFormulario(empreendimento))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [passo, setPasso] = useState<1 | 2 | 3>(() => {
    if (!empreendimento) return 1
    if (iniciarEmFluxos) return 3
    if (iniciarEmUnidades) return 2
    return 1
  })
  const [salvando, setSalvando] = useState(false)
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  // Depois de salvar a etapa 1 passamos a trabalhar sobre o registro criado.
  const [salvo, setSalvo] = useState<Empreendimento | null>(empreendimento)
  // Fotos escolhidas antes de o cadastro existir — sobem logo apos o salvar.
  const [pendentes, setPendentes] = useState<File[]>([])
  // O campo de link so aparece a pedido, ou quando ja veio preenchido.
  const [verLink, setVerLink] = useState(() => Boolean(empreendimento?.imagem_url))
  const [calculadoraAberta, setCalculadoraAberta] = useState(false)

  /** A simulacao do CUB vira um fluxo geral do empreendimento. */
  async function gerarFluxoDoCub(dados: Parameters<typeof api.criarFluxo>[0]) {
    if (!salvo) return
    const criado = await api.criarFluxo({ ...dados, empreendimento_id: salvo.id })
    setSalvo({ ...salvo, fluxos: [...salvo.fluxos, criado] })
    onMudouFluxos()
    avisar('Fluxo gerado pela calculadora do CUB')
  }

  const calculadora = calculadoraAberta && (
    <CalculadoraCub
      titulo={salvo?.nome || form.nome.trim() || 'Empreendimento'}
      onFechar={() => setCalculadoraAberta(false)}
      onGerarFluxo={salvo ? gerarFluxoDoCub : undefined}
      avisar={avisar}
    />
  )

  /** Guarda a galeria no estado local e avisa a tela de fora. */
  function aplicarImagens(id: number, imagens: ImagemEmpreendimento[]) {
    setSalvo((atual) => (atual ? { ...atual, imagens } : atual))
    onMudouImagens(id, imagens)
  }

  /** Mesma ideia para as unidades. */
  function aplicarUnidades(id: number, unidades: Unidade[]) {
    setSalvo((atual) => (atual ? { ...atual, unidades } : atual))
    onMudouUnidades(id, unidades)
  }

  const editando = empreendimento !== null

  // O bloco de produto e editado na etapa 2, depois de o registro existir:
  // so gravamos o que o usuario mexeu de verdade.
  const produtoAlterado =
    salvo !== null &&
    (() => {
      const gravado = paraFormulario(salvo)
      return CAMPOS_PRODUTO.some((campo) => form[campo].trim() !== gravado[campo].trim())
    })()

  /** Grava os numeros gerais sem tirar o usuario da etapa das unidades. */
  async function salvarProduto(): Promise<boolean> {
    if (!salvo) return false

    const novosErros = validarProduto(form)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) {
      avisar('Revise os campos destacados', 'erro')
      return false
    }

    setSalvandoProduto(true)
    try {
      // O PUT devolve o empreendimento completo (fluxos, unidades e imagens).
      setSalvo(await onSalvar(montarPayload()))
      avisar('Dados gerais salvos')
      return true
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar', 'erro')
      return false
    } finally {
      setSalvandoProduto(false)
    }
  }

  /**
   * Sair da etapa das unidades grava o produto pendente — sem isso o usuario
   * digitaria os numeros e os perderia ao avancar.
   */
  async function irParaPasso(numero: 1 | 2 | 3) {
    if (!salvo) return
    if (passo === 2 && produtoAlterado && !(await salvarProduto())) return
    setPasso(numero)
  }

  /** Fechar com produto por gravar precisa de confirmacao: fechar e desistir. */
  function fecharComAviso() {
    if (
      passo === 2 &&
      produtoAlterado &&
      !window.confirm('Os dados gerais do produto ainda não foram salvos. Fechar mesmo assim?')
    ) {
      return
    }
    onFechar()
  }

  function mudar(campo: string, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: '' }))
  }

  function entrada(campo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        className={`entrada${erros[campo] ? ' entrada--erro' : ''}`}
        value={form[campo]}
        onChange={(e) => mudar(campo, e.target.value)}
        {...extra}
      />
    )
  }

  /** Campo em branco vai como null para a API nao gravar string vazia. */
  function montarPayload(): EmpreendimentoInput {
    const dados: Record<string, string | null> = { nome: form.nome.trim() }
    for (const campo of CAMPOS) {
      if (campo === 'nome') continue
      dados[campo] = form[campo].trim() || null
    }
    return dados as EmpreendimentoInput
  }

  async function salvarEtapa1() {
    const novosErros = validarDados(form)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) {
      avisar('Revise os campos destacados', 'erro')
      return
    }

    setSalvando(true)
    try {
      const resultado = await onSalvar(montarPayload())
      setSalvo(resultado)
      avisar(editando ? 'Empreendimento atualizado' : 'Empreendimento cadastrado')

      // So agora existe id para pendurar as fotos escolhidas antes de salvar.
      if (pendentes.length > 0) {
        try {
          const resposta = await api.enviarImagens(resultado.id, pendentes)
          setPendentes([])
          setSalvo({ ...resultado, imagens: resposta.imagens })
          onMudouImagens(resultado.id, resposta.imagens)

          const recusadas = resposta.recusadas ?? []
          if (recusadas.length > 0) avisar(`${recusadas[0].nome}: ${recusadas[0].motivo}`, 'erro')
          else avisar(pendentes.length === 1 ? 'Foto enviada' : `${pendentes.length} fotos enviadas`)
        } catch (erro) {
          // O cadastro ja foi salvo: as fotos continuam na lista para tentar de
          // novo, e as etapas do topo ja estao liberadas para seguir sem elas.
          const motivo = erro instanceof Error ? erro.message : 'as fotos não subiram'
          avisar(`Empreendimento salvo, mas ${motivo}. Dá para seguir e enviar as fotos depois`, 'erro')
          return
        }
      }

      setPasso(2)
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Falha ao salvar', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  /* --- Cabecalho com os dois passos ------------------------------------- */
  const ETAPAS = ['Dados do empreendimento', 'Unidades', 'Fluxos de pagamento']

  const cabecalho = (
    <div className="passos">
      {ETAPAS.map((titulo, indice) => {
        const numero = indice + 1
        const feito = passo > numero
        return (
          <Fragment key={titulo}>
            {indice > 0 && <span className="passo__traco" />}
            <button
              type="button"
              className={`passo${passo === numero ? ' passo--ativo' : ''}${feito ? ' passo--feito' : ''}`}
              // Navegar entre as etapas so faz sentido com o cadastro ja salvo.
              disabled={!salvo}
              onClick={() => void irParaPasso(numero as 1 | 2 | 3)}
            >
              <span className="passo__bolha">
                {feito ? <Icone nome="check" tamanho={12} espessura={3} /> : numero}
              </span>
              {titulo}
            </button>
          </Fragment>
        )
      })}
    </div>
  )

  /* --- Etapa 1 ----------------------------------------------------------- */
  if (passo === 1) {
    return (
      <Modal
        titulo={editando ? 'Editar empreendimento' : 'Adicionar empreendimento'}
        subtitulo="Só o nome é obrigatório — o resto pode ser preenchido depois."
        onFechar={onFechar}
        cabecalhoExtra={cabecalho}
        largo
        rodape={
          <>
            <button type="button" className="btn btn--fantasma" onClick={onFechar}>
              Cancelar
            </button>
            <div className="direita">
              <button type="button" className="btn btn--primario" onClick={salvarEtapa1} disabled={salvando}>
                {salvando ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Salvando…
                  </>
                ) : (
                  <>
                    Salvar e avançar
                    <Icone nome="seta_direita" tamanho={15} />
                  </>
                )}
              </button>
            </div>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="predio" tamanho={13} />
              Identificação
            </h3>
            <div className="grade">
              <Campo rotulo="Nome do empreendimento" obrigatorio erro={erros.nome} className="col-span-2">
                {entrada('nome', { placeholder: 'Ex.: Residencial Vista Verde', autoFocus: true })}
              </Campo>
              <Campo rotulo="Construtora">
                {entrada('construtora', { placeholder: 'Ex.: Construtora Alfa' })}
              </Campo>
              <Campo rotulo="Tipo">
                <select className="entrada" value={form.tipo} onChange={(e) => mudar('tipo', e.target.value)}>
                  <option value="">Selecione…</option>
                  {TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="local" tamanho={13} />
              Localização
            </h3>
            {/* Grade de 2 colunas fixas: latitude e longitude precisam ficar
                lado a lado, e com auto-fit a longitude caia sozinha na linha. */}
            <div className="grade grade--2">
              <Campo rotulo="Cidade">{entrada('cidade', { placeholder: 'Ex.: Curitiba' })}</Campo>
              <Campo rotulo="Bairro">{entrada('bairro', { placeholder: 'Ex.: Batel' })}</Campo>
              <Campo rotulo="Endereço" className="col-inteira">
                {entrada('endereco', { placeholder: 'Rua, número e complemento' })}
              </Campo>
              <Campo rotulo="Latitude" dica="para o mapa" erro={erros.latitude}>
                {entrada('latitude', { placeholder: '-25.4284', inputMode: 'decimal' })}
              </Campo>
              <Campo rotulo="Longitude" dica="para o mapa" erro={erros.longitude}>
                {entrada('longitude', { placeholder: '-49.2733', inputMode: 'decimal' })}
              </Campo>
            </div>
            <p className="campo__dica" style={{ marginTop: 'var(--e2)' }}>
              Sem latitude e longitude o empreendimento é cadastrado normalmente, mas não aparece no mapa.
            </p>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="obra" tamanho={13} />
              Obra
            </h3>
            <div className="grade">
              <Campo rotulo="Status da obra">
                <select
                  className="entrada"
                  value={form.status_obra}
                  onChange={(e) => mudar('status_obra', e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {STATUS_OBRA.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Entrega prevista" dica="mês/ano">
                {entrada('entrega', { type: 'month' })}
              </Campo>
            </div>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="imagem" tamanho={13} />
              Fotos
              <span className="form-secao__opcional">— opcional, dá para enviar depois</span>
            </h3>

            <GaleriaUpload
              empreendimentoId={salvo?.id ?? null}
              imagens={salvo?.imagens ?? []}
              pendentes={pendentes}
              onImagens={(imagens) => salvo && aplicarImagens(salvo.id, imagens)}
              onPendentes={setPendentes}
              avisar={avisar}
            />

            {/* O link avulso e a forma antiga de dar capa ao empreendimento;
                fica recolhido para nao competir com o envio de arquivos. */}
            <div className="link-avulso">
              <button type="button" className="btn btn--fantasma btn--pequeno" onClick={() => setVerLink((v) => !v)}>
                <Icone nome={verLink ? 'seta_cima' : 'seta_baixo'} tamanho={13} />
                Usar um link de imagem
              </button>

              {verLink && (
                <div className="grade" style={{ marginTop: 'var(--e3)' }}>
                  <Campo
                    rotulo="Link de imagem"
                    className="col-inteira"
                    dica="só vale quando não há fotos enviadas"
                  >
                    {entrada('imagem_url', { placeholder: 'https://…', type: 'url' })}
                  </Campo>
                  {form.imagem_url.trim() && (
                    <div className="col-inteira">
                      <img
                        src={form.imagem_url}
                        alt="Pré-visualização da imagem"
                        className="link-avulso__previa"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                        onLoad={(e) => {
                          e.currentTarget.style.display = 'block'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="form-secao">
            <h3 className="form-secao__titulo">
              <Icone nome="lista" tamanho={13} />
              Observações
            </h3>
            <div className="grade">
              <Campo rotulo="Observações" className="col-inteira">
                <textarea
                  className="entrada"
                  value={form.observacoes}
                  onChange={(e) => mudar('observacoes', e.target.value)}
                  placeholder="Diferenciais, lazer, pontos de atenção…"
                  rows={3}
                />
              </Campo>
            </div>
          </section>
        </form>

        {calculadora}
      </Modal>
    )
  }

  /* --- Etapa 2: produto e unidades ----------------------------------------- */
  if (passo === 2) {
    return (
      <Modal
        titulo="Unidades"
        subtitulo={salvo ? `${salvo.nome} — os números do produto e cada planta que o corretor vende` : ''}
        onFechar={fecharComAviso}
        cabecalhoExtra={cabecalho}
        largo
        rodape={
          <>
            <button type="button" className="btn btn--fantasma" onClick={() => void irParaPasso(1)} disabled={salvandoProduto}>
              <Icone nome="seta_esquerda" tamanho={15} />
              Voltar aos dados
            </button>
            <div className="direita">
              <button
                type="button"
                className="btn btn--primario"
                onClick={() => void irParaPasso(3)}
                disabled={salvandoProduto}
              >
                {salvandoProduto ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Salvando…
                  </>
                ) : (
                  <>
                    Avançar aos fluxos
                    <Icone nome="seta_direita" tamanho={15} />
                  </>
                )}
              </button>
            </div>
          </>
        }
      >
        {calculadora}

        <section className="form-secao">
          <h3 className="form-secao__titulo">
            <Icone nome="regua" tamanho={13} />
            Produto
            <span className="form-secao__opcional">— números gerais do empreendimento</span>
          </h3>
          <div className="grade">
            <Campo rotulo="Valor médio do m²" dica="R$">
              {entrada('valor_m2', { placeholder: '10800', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Metragem mínima" dica="m²">
              {entrada('metragem_min', { placeholder: '45', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Metragem máxima" dica="m²" erro={erros.metragem_max}>
              {entrada('metragem_max', { placeholder: '82', inputMode: 'decimal' })}
            </Campo>
            <Campo rotulo="Dormitórios">
              {entrada('dormitorios', { placeholder: '3', inputMode: 'numeric' })}
            </Campo>
            <Campo rotulo="Suítes">{entrada('suites', { placeholder: '1', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Banheiros">{entrada('banheiros', { placeholder: '2', inputMode: 'numeric' })}</Campo>
            <Campo rotulo="Vagas">{entrada('vagas', { placeholder: '2', inputMode: 'numeric' })}</Campo>
          </div>

          <div className="acoes-fluxo" style={{ marginTop: 'var(--e3)' }}>
            {/* O salvar so aparece com algo por gravar; avancar de etapa tambem grava. */}
            {produtoAlterado && (
              <button
                type="button"
                className="btn btn--secundario"
                onClick={() => void salvarProduto()}
                disabled={salvandoProduto}
              >
                {salvandoProduto ? (
                  <>
                    <Icone nome="spinner" tamanho={15} className="girando" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Icone nome="check" tamanho={15} />
                    Salvar números gerais
                  </>
                )}
              </button>
            )}

            <button type="button" className="btn btn--secundario" onClick={() => setCalculadoraAberta(true)}>
              <Icone nome="grafico" tamanho={15} />
              Calcular valor com CUB
            </button>
            <span className="campo__dica">
              Valem para o empreendimento inteiro; com unidades cadastradas, o painel mostra a faixa delas.
            </span>
          </div>
        </section>

        {salvo && (
          <UnidadesDoEmpreendimento
            empreendimentoId={salvo.id}
            unidades={salvo.unidades}
            onMudou={(unidades) => aplicarUnidades(salvo.id, unidades)}
            avisar={avisar}
          />
        )}
      </Modal>
    )
  }

  /* --- Etapa 3: fluxos gerais ---------------------------------------------- */
  return (
    <Modal
      titulo="Fluxos de pagamento"
      subtitulo={salvo ? `${salvo.nome} — tabelas que valem para o empreendimento inteiro` : ''}
      onFechar={onFechar}
      cabecalhoExtra={cabecalho}
      largo
      rodape={
        <>
          <button type="button" className="btn btn--fantasma" onClick={() => setPasso(2)}>
            <Icone nome="seta_esquerda" tamanho={15} />
            Voltar às unidades
          </button>
          <div className="direita">
            <button type="button" className="btn btn--primario" onClick={onFechar}>
              <Icone nome="check" tamanho={15} />
              Concluir
            </button>
          </div>
        </>
      }
    >
      {calculadora}

      {salvo && (
        <FluxosDoEmpreendimento
          empreendimentoId={salvo.id}
          titulo={salvo.nome}
          fluxos={salvo.fluxos}
          onMudou={(fluxos) => {
            setSalvo((atual) => (atual ? { ...atual, fluxos } : atual))
            onMudouFluxos()
          }}
          avisar={avisar}
        />
      )}
    </Modal>
  )
}

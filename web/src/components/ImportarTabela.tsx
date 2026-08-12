import { useMemo, useState } from 'react'
import type {
  CampoImportado,
  CamposImportados,
  Empreendimento,
  EntradaImportacao,
  PreviaImportacao,
  ResultadoImportacao,
  Unidade,
} from '../types'
import { api } from '../lib/api'
import { mensagemDoErro } from '../lib/http'
import { fmtMoeda, fmtNumero, TRACO } from '../lib/format'
import { rotuloStatusUnidade } from '../lib/opcoes'
import { montarPromptDeImportacao } from '../lib/promptImportacao'
import { validarRespostaDaIa } from '../lib/validarImportacao'
import { Icone } from './Icones'
import { Modal } from './ui'

/**
 * Importar a tabela de vendas da construtora, em quatro passos.
 *
 * Quem LE a tabela e a IA do usuario (o ChatGPT dele): a tela entrega um
 * prompt pronto, ele cola a tabela la e traz o JSON de volta. Por isso o
 * fluxo e em passos e nao num formulario so — sair da tela, ir ao chat e
 * voltar e parte do processo, e o passo diz em que ponto dele a pessoa esta.
 *
 * A regra que organiza a previa: NADA aqui apaga. Criar e atualizar vem
 * marcados (e o que a pessoa pediu ao importar); "sumiu da tabela" vem
 * DESMARCADO, porque uma coluna esquecida na planilha da construtora nao pode
 * derrubar o cadastro de um andar inteiro sem alguem dizer que sim.
 */

/* ------------------------------------------------------------------ */
/* Formatação dos valores da prévia                                    */
/* ------------------------------------------------------------------ */

const ROTULO_CAMPO: Record<CampoImportado, string> = {
  identificacao: 'Identificação',
  torre: 'Torre',
  andar: 'Andar',
  numero: 'Número',
  tipologia: 'Tipologia',
  metragem: 'Metragem privativa',
  metragem_total: 'Metragem total',
  dormitorios: 'Dormitórios',
  suites: 'Suítes',
  banheiros: 'Banheiros',
  vagas: 'Vagas',
  valor: 'Valor',
  status: 'Status',
  observacoes: 'Observações',
}

const AREAS = new Set<CampoImportado>(['metragem', 'metragem_total'])

/** O valor de um campo como a prévia mostra — cada tipo na sua unidade. */
function mostrar(campo: CampoImportado, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return TRACO
  if (campo === 'valor') return fmtMoeda(Number(valor))
  if (campo === 'status') return rotuloStatusUnidade(String(valor))
  if (AREAS.has(campo)) return `${fmtNumero(Number(valor))} m²`
  return String(valor)
}

/** Como a unidade NOVA é chamada antes de existir (ela ainda não tem id). */
function rotuloDaNova(campos: CamposImportados): string {
  if (campos.identificacao) return campos.identificacao
  const partes = [campos.torre, campos.numero ? `nº ${campos.numero}` : null].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : 'Unidade sem identificação'
}

/** O resumo de uma unidade nova, na linha: o que dela dá para dizer. */
function resumoDaNova(campos: CamposImportados): string {
  const partes = [
    campos.tipologia,
    campos.metragem !== null ? `${fmtNumero(campos.metragem)} m²` : null,
    campos.valor !== null ? fmtMoeda(campos.valor) : null,
    campos.status ? rotuloStatusUnidade(campos.status) : null,
  ].filter(Boolean)
  return partes.join(' · ')
}

/* ------------------------------------------------------------------ */
/* Área de transferência                                               */
/* ------------------------------------------------------------------ */

/**
 * Copiar com plano B: `navigator.clipboard` só existe em contexto seguro
 * (https ou localhost), e o dashboard costuma ser aberto por IP na rede ou por
 * túnel — onde a API simplesmente não está lá. Sem o plano B, o botão
 * principal do passo 1 falharia calado justo em quem usa fora do localhost.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Cai no plano B abaixo: a permissão pode ter sido negada.
  }

  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* O componente                                                        */
/* ------------------------------------------------------------------ */

interface Props {
  empreendimento: Empreendimento
  /** A lista da tela acompanha: a rota de confirmar devolve as unidades prontas. */
  onImportou: (unidades: Unidade[]) => void
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  onFechar: () => void
}

type Passo = 1 | 2 | 3 | 4

export function ImportarTabela({ empreendimento, onImportou, avisar, onFechar }: Props) {
  const [passo, setPasso] = useState<Passo>(1)
  const [copiado, setCopiado] = useState(false)

  const [texto, setTexto] = useState('')
  const [problemas, setProblemas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [previa, setPrevia] = useState<PreviaImportacao | null>(null)
  const [entrada, setEntrada] = useState<EntradaImportacao | null>(null)
  // Marcadas por índice/id. Criar e atualizar nascem marcadas; ausentes, não.
  const [criarMarcadas, setCriarMarcadas] = useState<Set<number>>(new Set())
  const [atualizarMarcadas, setAtualizarMarcadas] = useState<Set<number>>(new Set())
  const [ausentesMarcadas, setAusentesMarcadas] = useState<Set<number>>(new Set())

  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  const prompt = useMemo(
    () => montarPromptDeImportacao({ empreendimento: empreendimento.nome }),
    [empreendimento.nome],
  )

  const totalMarcado =
    criarMarcadas.size + atualizarMarcadas.size + ausentesMarcadas.size

  async function copiarPrompt() {
    const ok = await copiarTexto(prompt)
    setCopiado(ok)
    if (ok) avisar('Prompt copiado — cole no seu ChatGPT junto com a tabela', 'sucesso')
    else avisar('Não consegui copiar automaticamente. Selecione o texto abaixo e copie à mão', 'erro')
  }

  /** Passo 2 → 3: valida aqui e, só se passar, pede a prévia ao servidor. */
  async function validarEPedirPrevia() {
    setErro(null)
    const lido = validarRespostaDaIa(texto)
    setProblemas(lido.problemas)
    if (!lido.ok) return

    const payload: EntradaImportacao = {
      unidades: lido.unidades,
      duvidas: lido.duvidas,
      fluxo_construtora: lido.fluxo_construtora,
    }

    setOcupado(true)
    try {
      const resposta = await api.previaImportacao(empreendimento.id, payload)
      setEntrada(payload)
      setPrevia(resposta)
      setCriarMarcadas(new Set(resposta.novas.map((_, indice) => indice)))
      setAtualizarMarcadas(new Set(resposta.alteradas.map((a) => a.id)))
      setAusentesMarcadas(new Set())
      setPasso(3)
    } catch (falha) {
      // O 400 da rota traz a lista de problemas: mostrar todos evita a viagem
      // de volta ao chat um erro por vez.
      const corpo = (falha as { corpo?: { problemas?: string[] } }).corpo
      if (Array.isArray(corpo?.problemas) && corpo.problemas.length > 0) setProblemas(corpo.problemas)
      else setErro(mensagemDoErro(falha, 'Não foi possível montar a prévia'))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!previa || totalMarcado === 0) return
    setErro(null)
    setOcupado(true)
    try {
      const resposta = await api.confirmarImportacao(empreendimento.id, {
        criar: previa.novas.filter((_, indice) => criarMarcadas.has(indice)).map((nova) => nova.campos),
        atualizar: previa.alteradas
          .filter((alterada) => atualizarMarcadas.has(alterada.id))
          .map((alterada) => ({ id: alterada.id, campos: alterada.depois })),
        marcarIndisponiveis: previa.ausentes
          .filter((ausente) => ausentesMarcadas.has(ausente.id))
          .map((ausente) => ausente.id),
        fluxo_construtora: entrada?.fluxo_construtora ?? null,
      })
      setResultado(resposta)
      onImportou(resposta.unidades)
      setPasso(4)
      avisar('Tabela importada', 'sucesso')
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível gravar a importação'))
    } finally {
      setOcupado(false)
    }
  }

  const alternar = (
    conjunto: Set<number>,
    definir: (novo: Set<number>) => void,
    chave: number,
  ) => {
    const proximo = new Set(conjunto)
    if (proximo.has(chave)) proximo.delete(chave)
    else proximo.add(chave)
    definir(proximo)
  }

  /* --- Rodapé: um único CTA primário por passo ---------------------- */

  const rodape = (
    <>
      <div className="esquerda">
        {passo === 2 && (
          <button type="button" className="btn btn--fantasma" onClick={() => setPasso(1)} disabled={ocupado}>
            Voltar ao prompt
          </button>
        )}
        {passo === 3 && (
          <button type="button" className="btn btn--fantasma" onClick={() => setPasso(2)} disabled={ocupado}>
            Voltar e colar de novo
          </button>
        )}
      </div>
      <div className="direita">
        {passo === 1 && (
          <button type="button" className="btn btn--primario" onClick={() => setPasso(2)}>
            Já copiei — colar a resposta
            <Icone nome="seta_direita" tamanho={14} />
          </button>
        )}
        {passo === 2 && (
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => void validarEPedirPrevia()}
            disabled={ocupado || texto.trim().length === 0}
          >
            {ocupado ? <Icone nome="spinner" tamanho={14} className="girando" /> : <Icone nome="check" tamanho={14} />}
            {ocupado ? 'Conferindo…' : 'Conferir e ver a prévia'}
          </button>
        )}
        {passo === 3 && (
          <button
            type="button"
            className="btn btn--primario"
            onClick={() => void confirmar()}
            disabled={ocupado || totalMarcado === 0}
          >
            {ocupado ? <Icone nome="spinner" tamanho={14} className="girando" /> : <Icone nome="check" tamanho={14} />}
            {ocupado
              ? 'Importando…'
              : totalMarcado === 0
                ? 'Nada marcado'
                : `Importar ${totalMarcado} ${totalMarcado === 1 ? 'unidade' : 'unidades'}`}
          </button>
        )}
        {passo === 4 && (
          <button type="button" className="btn btn--primario" onClick={onFechar}>
            Concluir
          </button>
        )}
      </div>
    </>
  )

  return (
    <Modal
      titulo="Importar tabela da construtora"
      subtitulo={empreendimento.nome}
      largo
      onFechar={onFechar}
      rodape={rodape}
    >
      <ol className="importacao__trilha" aria-label="Etapas da importação">
        {['Copiar o prompt', 'Colar a resposta', 'Conferir', 'Pronto'].map((nome, indice) => (
          <li
            key={nome}
            className={`importacao__etapa${passo === indice + 1 ? ' importacao__etapa--atual' : ''}${
              passo > indice + 1 ? ' importacao__etapa--feita' : ''
            }`}
          >
            <span className="importacao__etapa-num">{passo > indice + 1 ? '✓' : indice + 1}</span>
            {nome}
          </li>
        ))}
      </ol>

      {erro && (
        <div className="importacao__erro" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </div>
      )}

      {/* --- Passo 1: o prompt ---------------------------------------- */}
      {passo === 1 && (
        <>
          <section className="form-secao form-secao--dados">
            <h4 className="form-secao__titulo">
              <Icone nome="info" tamanho={16} />
              Como funciona
            </h4>
            <ol className="importacao__instrucoes">
              <li>
                Copie o prompt abaixo e cole no <strong>seu ChatGPT</strong> (ou outra IA que você já use).
              </li>
              <li>
                Na mesma mensagem, logo depois do prompt, cole a <strong>tabela da construtora</strong> — do Excel, do
                PDF ou do CSV.
              </li>
              <li>Copie a resposta inteira que a IA devolver e volte aqui para colar no passo seguinte.</li>
            </ol>
            <p className="importacao__nota">
              A tabela não sai do seu computador para nenhum servidor nosso: quem lê é a IA da sua conta. Nada é gravado
              antes de você conferir a prévia.
            </p>
          </section>

          <section className="form-secao form-secao--chaves">
            <h4 className="form-secao__titulo">
              <Icone nome="copiar" tamanho={16} />
              O prompt
            </h4>
            <button type="button" className="btn btn--secundario" onClick={() => void copiarPrompt()}>
              <Icone nome={copiado ? 'check' : 'copiar'} tamanho={14} />
              {copiado ? 'Copiado' : 'Copiar prompt'}
            </button>
            <pre className="importacao__prompt" aria-label="Texto do prompt">
              {prompt}
            </pre>
          </section>
        </>
      )}

      {/* --- Passo 2: colar a resposta -------------------------------- */}
      {passo === 2 && (
        <section className="form-secao form-secao--dados">
          <h4 className="form-secao__titulo">
            <Icone nome="lista" tamanho={16} />
            Cole aqui a resposta da IA
          </h4>
          <p className="importacao__nota">
            Pode colar a resposta inteira, com o texto de conversa em volta — o bloco JSON é recortado sozinho.
          </p>
          <textarea
            className="importacao__area"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              if (problemas.length > 0) setProblemas([])
            }}
            placeholder={'```json\n{ "unidades": [ … ] }\n```'}
            rows={12}
            aria-label="Resposta da IA"
          />

          {problemas.length > 0 && (
            <div className="importacao__problemas" role="alert">
              <strong>
                <Icone nome="alerta" tamanho={14} />
                {problemas.length === 1
                  ? 'Um problema impede a importação:'
                  : `${problemas.length} problemas impedem a importação:`}
              </strong>
              <ul>
                {problemas.map((problema, indice) => (
                  <li key={indice}>{problema}</li>
                ))}
              </ul>
              <p className="importacao__nota">
                Corrija no chat (peça para refazer só o bloco JSON) e cole de novo. Nada foi gravado.
              </p>
            </div>
          )}
        </section>
      )}

      {/* --- Passo 3: a prévia ---------------------------------------- */}
      {passo === 3 && previa && (
        <>
          {previa.duvidas.length > 0 && (
            <section className="form-secao form-secao--obra importacao__duvidas">
              <h4 className="form-secao__titulo">
                <Icone nome="alerta" tamanho={16} />
                A IA ficou em dúvida
                <span className="form-secao__complemento">confira estes pontos na tabela original</span>
              </h4>
              <ul className="importacao__lista-duvidas">
                {previa.duvidas.map((duvida, indice) => (
                  <li key={indice}>
                    {duvida.unidade && <strong>{duvida.unidade}: </strong>}
                    {duvida.texto}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="form-secao form-secao--dados">
            <h4 className="form-secao__titulo">
              <Icone nome="mais" tamanho={16} />
              Unidades novas
              <span className="form-secao__complemento">
                {previa.novas.length === 0 ? 'nenhuma' : `${previa.novas.length} serão cadastradas`}
              </span>
            </h4>
            {previa.novas.length === 0 ? (
              <p className="importacao__vazio">Nenhuma unidade nova — todas as linhas da tabela já estão no cadastro.</p>
            ) : (
              <ul className="importacao__itens">
                {previa.novas.map((nova, indice) => (
                  <li key={indice} className="importacao__item">
                    <label className="importacao__marca">
                      <input
                        type="checkbox"
                        checked={criarMarcadas.has(indice)}
                        onChange={() => alternar(criarMarcadas, setCriarMarcadas, indice)}
                      />
                      <span className="importacao__nome">{rotuloDaNova(nova.campos)}</span>
                    </label>
                    <span className="importacao__resumo">{resumoDaNova(nova.campos) || TRACO}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="form-secao form-secao--pagamentos">
            <h4 className="form-secao__titulo">
              <Icone nome="lapis" tamanho={16} />
              Unidades que mudaram
              <span className="form-secao__complemento">
                {previa.alteradas.length === 0 ? 'nenhuma' : `${previa.alteradas.length} serão atualizadas`}
              </span>
            </h4>
            {previa.alteradas.length === 0 ? (
              <p className="importacao__vazio">Nenhuma mudança: o que a tabela traz é igual ao que está gravado.</p>
            ) : (
              <ul className="importacao__itens">
                {previa.alteradas.map((alterada) => (
                  <li key={alterada.id} className="importacao__item">
                    <label className="importacao__marca">
                      <input
                        type="checkbox"
                        checked={atualizarMarcadas.has(alterada.id)}
                        onChange={() => alternar(atualizarMarcadas, setAtualizarMarcadas, alterada.id)}
                      />
                      <span className="importacao__nome">{alterada.identificacao}</span>
                    </label>
                    <ul className="importacao__mudancas">
                      {alterada.campos.map((campo) => (
                        <li key={campo}>
                          <span className="importacao__campo">{ROTULO_CAMPO[campo]}</span>
                          <span className="importacao__antes">{mostrar(campo, alterada.antes[campo])}</span>
                          <Icone nome="seta_direita" tamanho={12} />
                          <span className="importacao__depois">{mostrar(campo, alterada.depois[campo])}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="form-secao form-secao--obra">
            <h4 className="form-secao__titulo">
              <Icone nome="alerta" tamanho={16} />
              Sumiram da tabela
              <span className="form-secao__complemento">
                {previa.ausentes.length === 0 ? 'nenhuma' : `${previa.ausentes.length} não vieram na tabela nova`}
              </span>
            </h4>
            {previa.ausentes.length === 0 ? (
              <p className="importacao__vazio">Todas as unidades cadastradas apareceram na tabela.</p>
            ) : (
              <>
                <p className="importacao__nota">
                  Nada é apagado. Marque só o que você tem certeza de que saiu de venda — a unidade passa a
                  “Indisponível” e continua no cadastro, com o histórico dela.
                </p>
                <ul className="importacao__itens">
                  {previa.ausentes.map((ausente) => (
                    <li key={ausente.id} className="importacao__item">
                      <label className="importacao__marca">
                        <input
                          type="checkbox"
                          checked={ausentesMarcadas.has(ausente.id)}
                          onChange={() => alternar(ausentesMarcadas, setAusentesMarcadas, ausente.id)}
                        />
                        <span className="importacao__nome">{ausente.identificacao}</span>
                      </label>
                      <span className="importacao__resumo">
                        marcar indisponível (hoje: {rotuloStatusUnidade(ausente.status_atual)})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {previa.fluxo_construtora && (
            <section className="form-secao form-secao--chaves">
              <h4 className="form-secao__titulo">
                <Icone nome="cartao" tamanho={16} />
                Condição de pagamento lida
                <span className="form-secao__complemento">apenas informativo — ainda não é gravada</span>
              </h4>
              <ul className="importacao__mudancas importacao__mudancas--fluxo">
                {Object.entries(previa.fluxo_construtora)
                  .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
                  .map(([campo, valor]) => (
                    <li key={campo}>
                      <span className="importacao__campo">{campo.replace(/_/g, ' ')}</span>
                      <span className="importacao__depois">{String(valor)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* --- Passo 4: o resultado ------------------------------------- */}
      {passo === 4 && resultado && (
        <section className="form-secao form-secao--resultado">
          <h4 className="form-secao__titulo">
            <Icone nome="check" tamanho={16} />
            Importação concluída
          </h4>
          <ul className="importacao__contagens">
            <li>
              <strong>{resultado.criadas}</strong> {resultado.criadas === 1 ? 'unidade criada' : 'unidades criadas'}
            </li>
            <li>
              <strong>{resultado.atualizadas}</strong>{' '}
              {resultado.atualizadas === 1 ? 'unidade atualizada' : 'unidades atualizadas'}
            </li>
            <li>
              <strong>{resultado.indisponiveis}</strong>{' '}
              {resultado.indisponiveis === 1 ? 'marcada indisponível' : 'marcadas indisponíveis'}
            </li>
          </ul>
          <p className="importacao__nota">A lista de unidades da tela já está atualizada.</p>
        </section>
      )}
    </Modal>
  )
}

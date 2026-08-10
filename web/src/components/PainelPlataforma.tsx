import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { DESCRICAO_DO_PAPEL, NOME_DO_PAPEL, type Papel, type StatusConta } from '../lib/acesso'
import { mensagemDoErro } from '../lib/http'
import {
  COR_DO_PLANO,
  FAIXAS,
  PERIODICIDADES,
  formatarData,
  paraCampoDeData,
  plataforma,
  textoDoUltimoAcesso,
  textoDoVencimento,
  type ContaDaPlataforma,
  type FaixaRenovacao,
  type Panorama,
} from '../lib/plataforma'
import { BaseDoCliente } from './BaseDoCliente'
import { Icone } from './Icones'
import { Campo, Carregando, Estado, Modal, Selo } from './ui'

/**
 * A area de quem VENDE: todas as contas, todo mundo que usa o sistema e o
 * controle das renovacoes.
 *
 * O painel do cliente (`PainelConta`) mostra UMA conta e nao deixa mexer no
 * plano. Aqui e o contrario, e por isso sao telas separadas: misturar as duas
 * seria uma condicional a mais entre o cliente e o contrato dele.
 */

interface Props {
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
  /**
   * Sem `onFechar`, o painel deixa de ser modal e vira a PAGINA inteira — que
   * e como o usuario master ve o sistema: ele administra clientes, nao usa o
   * dashboard, entao nao ha nada por baixo para o modal cobrir.
   */
  onFechar?: () => void
}

const PLANOS_DISPONIVEIS = [
  { slug: 'individual', nome: 'Individual' },
  { slug: 'equipe', nome: 'Equipe' },
  { slug: 'profissional', nome: 'Profissional' },
  { slug: 'personalizado', nome: 'Personalizado' },
]

const STATUS_DISPONIVEIS: { valor: StatusConta; nome: string }[] = [
  { valor: 'ativa', nome: 'Ativa' },
  { valor: 'trial', nome: 'Em teste' },
  { valor: 'suspensa', nome: 'Suspensa' },
  { valor: 'cancelada', nome: 'Encerrada' },
]

export function PainelPlataforma({ avisar, onFechar }: Props) {
  const [dados, setDados] = useState<Panorama | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'contas' | 'usuarios'>('contas')
  const [filtro, setFiltro] = useState<FaixaRenovacao | null>(null)
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<number | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [criando, setCriando] = useState(false)
  const [link, setLink] = useState<{ caminho: string; rotulo: string } | null>(null)
  const [vendoBase, setVendoBase] = useState<{ id: number; nome: string } | null>(null)

  const carregar = useCallback(async () => {
    try {
      setDados(await plataforma.panorama())
      setErro(null)
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível carregar o painel'))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const contasFiltradas = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()

    return dados.contas.filter((conta) => {
      if (filtro && conta.faixa !== filtro) return false
      if (!termo) return true
      // Busca pelo nome da conta OU de qualquer pessoa dela — na prática o
      // operador lembra do contato, não da razão social.
      return (
        conta.nome.toLowerCase().includes(termo) ||
        conta.usuarios.some((u) => u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
      )
    })
  }, [dados, filtro, busca])

  const todosOsUsuarios = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()

    return dados.contas
      .flatMap((conta) => conta.usuarios.map((usuario) => ({ ...usuario, conta })))
      .filter(
        (item) =>
          !termo ||
          item.nome.toLowerCase().includes(termo) ||
          item.email.toLowerCase().includes(termo) ||
          item.conta.nome.toLowerCase().includes(termo),
      )
      .sort((a, b) => (b.ultimoAcesso || '').localeCompare(a.ultimoAcesso || ''))
  }, [dados, busca])

  async function agir(acao: () => Promise<Panorama>, mensagem: string) {
    try {
      setDados(await acao())
      avisar(mensagem)
    } catch (falha) {
      avisar(mensagemDoErro(falha), 'erro')
    }
  }

  const abas = (
    <div className="abas">
      <button type="button" className={`aba${aba === 'contas' ? ' aba--ativa' : ''}`} onClick={() => setAba('contas')}>
        <Icone nome="banco" tamanho={15} />
        Contas
      </button>
      <button
        type="button"
        className={`aba${aba === 'usuarios' ? ' aba--ativa' : ''}`}
        onClick={() => setAba('usuarios')}
      >
        <Icone nome="equipe" tamanho={15} />
        Todos os usuários
      </button>
    </div>
  )

  const corpo = (
    <>
      {erro ? (
        <Estado icone="alerta" variante="erro" titulo="Falha ao carregar" texto={erro} />
      ) : !dados ? (
        <Carregando texto="Carregando os clientes…" />
      ) : (
        <div className="plataforma">
          <ResumoTopo resumo={dados.resumo} />

          <AlertasDeRenovacao resumo={dados.resumo} filtro={filtro} onFiltrar={setFiltro} />

          <div className="plataforma__barra">
            <div className="busca">
              <span className="busca__icone">
                <Icone nome="busca" tamanho={15} />
              </span>
              <input
                className="entrada"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={aba === 'contas' ? 'Buscar conta, pessoa ou e-mail…' : 'Buscar pessoa, e-mail ou conta…'}
              />
              {busca && (
                <button type="button" className="busca__limpar" onClick={() => setBusca('')} aria-label="Limpar busca">
                  <Icone nome="fechar" tamanho={13} />
                </button>
              )}
            </div>

            {aba === 'contas' && (
              <button type="button" className="btn btn--primario btn--pequeno" onClick={() => setCriando(true)}>
                <Icone nome="mais" tamanho={14} />
                Novo cliente
              </button>
            )}
          </div>

          {link && <LinkGerado caminho={link.caminho} rotulo={link.rotulo} aoFechar={() => setLink(null)} />}

          {criando && (
            <FormNovoCliente
              aoCancelar={() => setCriando(false)}
              aoCriar={async (dadosNovos) => {
                const resposta = await plataforma.criarConta(dadosNovos)
                setDados(resposta)
                setCriando(false)
                setLink({ caminho: resposta.link, rotulo: `Primeiro acesso de ${dadosNovos.responsavel}` })
                avisar('Cliente criado — mande o link de primeiro acesso')
              }}
            />
          )}

          {aba === 'contas' ? (
            contasFiltradas.length === 0 ? (
              <Estado
                icone="busca"
                titulo="Nenhuma conta aqui"
                texto={filtro ? 'Nenhuma conta nesta situação. Tire o filtro para ver as demais.' : 'Ajuste a busca.'}
              />
            ) : (
              <ul className="contas-lista">
                {contasFiltradas.map((conta) => (
                  <LinhaDeConta
                    key={conta.id}
                    conta={conta}
                    aberta={aberta === conta.id}
                    editando={editando === conta.id}
                    onAbrir={() => setAberta(aberta === conta.id ? null : conta.id)}
                    onEditar={() => setEditando(editando === conta.id ? null : conta.id)}
                    onRenovar={(ciclos) =>
                      void agir(
                        () => plataforma.renovar(conta.id, ciclos),
                        `${conta.nome} renovada por mais ${conta.cobranca.meses * ciclos} mês(es)`,
                      )
                    }
                    onSalvar={async (alteracao) => {
                      await agir(() => plataforma.salvarConta(conta.id, alteracao), 'Conta atualizada')
                      setEditando(null)
                    }}
                    onLinkDeSenha={async (usuarioId, nome) => {
                      try {
                        const { link: caminho } = await plataforma.linkDeSenha(usuarioId)
                        setLink({ caminho, rotulo: `Link de senha de ${nome}` })
                      } catch (falha) {
                        avisar(mensagemDoErro(falha), 'erro')
                      }
                    }}
                    onVerBase={() => setVendoBase({ id: conta.id, nome: conta.nome })}
                    onCriarUsuario={async (novo) => {
                      const resposta = await plataforma.criarUsuario(conta.id, novo)
                      setDados(resposta)
                      setLink({ caminho: resposta.link, rotulo: `Primeiro acesso de ${novo.nome}` })
                      avisar('Usuário criado — mande o link de primeiro acesso')
                    }}
                  />
                ))}
              </ul>
            )
          ) : (
            <TabelaDeUsuarios usuarios={todosOsUsuarios} />
          )}
        </div>
      )}
    </>
  )

  const suporte = vendoBase && (
    <BaseDoCliente contaId={vendoBase.id} nomeDaConta={vendoBase.nome} onFechar={() => setVendoBase(null)} />
  )

  if (!onFechar) {
    return (
      <div className="plataforma-pagina">
        {abas}
        <div className="plataforma-pagina__corpo">{corpo}</div>
        {suporte}
      </div>
    )
  }

  return (
    <Modal
      titulo="Administrador"
      subtitulo={
        dados
          ? `${dados.resumo.contas} cliente(s) · ${dados.resumo.usuariosAtivos} pessoa(s) usando o sistema`
          : undefined
      }
      largo
      onFechar={onFechar}
      cabecalhoExtra={abas}
    >
      {corpo}
      {suporte}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Resumo e alertas                                                     */
/* ------------------------------------------------------------------ */

function ResumoTopo({ resumo }: { resumo: Panorama['resumo'] }) {
  return (
    <div className="resumo-cartoes">
      <Cartao rotulo="Clientes ativos" valor={resumo.contasAtivas} apoio={`de ${resumo.contas} no total`} />
      <Cartao
        rotulo="Pessoas usando"
        valor={resumo.usuariosAtivos}
        apoio={`${resumo.com2fa} com verificação em duas etapas`}
      />
      <Cartao rotulo="Assentos ocupados" valor={resumo.assentosOcupados} apoio="usuários + convites em aberto" />
      <div className="cartao-resumo cartao-resumo--planos">
        <div className="cartao-resumo__rotulo">Por plano</div>
        <ul className="mini-planos">
          {PLANOS_DISPONIVEIS.map((plano) => (
            <li key={plano.slug}>
              <Selo cor={COR_DO_PLANO[plano.slug]}>{plano.nome}</Selo>
              <span>
                {resumo.porPlano[plano.slug]?.contas ?? 0}
                <span className="mini-planos__pessoas"> · {resumo.porPlano[plano.slug]?.usuarios ?? 0} pessoas</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Cartao({ rotulo, valor, apoio }: { rotulo: string; valor: number; apoio: string }) {
  return (
    <div className="cartao-resumo">
      <div className="cartao-resumo__rotulo">{rotulo}</div>
      <div className="cartao-resumo__valor">{valor}</div>
      <div className="cartao-resumo__apoio">{apoio}</div>
    </div>
  )
}

/**
 * Os alertas sao BOTOES: ver "3 vencidas" e nao conseguir clicar para saber
 * QUAIS deixaria o operador procurando na lista inteira.
 */
function AlertasDeRenovacao({
  resumo,
  filtro,
  onFiltrar,
}: {
  resumo: Panorama['resumo']
  filtro: FaixaRenovacao | null
  onFiltrar: (faixa: FaixaRenovacao | null) => void
}) {
  const alertas: { faixa: FaixaRenovacao; total: number; rotulo: string; tom: string }[] = [
    { faixa: 'vencida', total: resumo.vencidas, rotulo: 'vencida(s)', tom: 'perigo' },
    { faixa: 'vence-em-7', total: resumo.venceEm7, rotulo: 'vencem esta semana', tom: 'alerta' },
    { faixa: 'vence-em-30', total: resumo.venceEm30, rotulo: 'vencem em 30 dias', tom: 'info' },
    { faixa: 'suspensa', total: resumo.suspensas, rotulo: 'suspensa(s)', tom: 'alerta' },
  ]

  const comAlgo = alertas.filter((alerta) => alerta.total > 0)

  if (comAlgo.length === 0) {
    return (
      <div className="alertas alertas--vazio">
        <Icone nome="check" tamanho={15} />
        Nenhuma renovação vencendo nos próximos 30 dias.
      </div>
    )
  }

  return (
    <div className="alertas">
      {comAlgo.map((alerta) => (
        <button
          key={alerta.faixa}
          type="button"
          className={`alerta alerta--${alerta.tom}${filtro === alerta.faixa ? ' alerta--ativo' : ''}`}
          onClick={() => onFiltrar(filtro === alerta.faixa ? null : alerta.faixa)}
        >
          <span className="alerta__numero">{alerta.total}</span>
          <span className="alerta__texto">{alerta.rotulo}</span>
        </button>
      ))}

      {filtro && (
        <button type="button" className="link-acao" onClick={() => onFiltrar(null)}>
          ver todas
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Linha de conta                                                       */
/* ------------------------------------------------------------------ */

interface LinhaProps {
  conta: ContaDaPlataforma
  aberta: boolean
  editando: boolean
  onAbrir: () => void
  onEditar: () => void
  /** Quantos CICLOS de cobrança da conta somar (1 = o padrão). */
  onRenovar: (ciclos: number) => void
  onSalvar: (alteracao: Parameters<typeof plataforma.salvarConta>[1]) => Promise<void>
  onLinkDeSenha: (usuarioId: number, nome: string) => Promise<void>
  onCriarUsuario: (dados: { nome: string; email: string; papel: Papel }) => Promise<void>
  onVerBase: () => void
}

function LinhaDeConta({
  conta,
  aberta,
  editando,
  onAbrir,
  onEditar,
  onRenovar,
  onSalvar,
  onLinkDeSenha,
  onCriarUsuario,
  onVerBase,
}: LinhaProps) {
  const [adicionando, setAdicionando] = useState(false)
  const faixa = FAIXAS[conta.faixa]
  const semVaga = conta.assentos.disponiveis !== null && conta.assentos.disponiveis <= 0

  return (
    <li className={`conta-linha conta-linha--${conta.faixa}`}>
      <div className="conta-linha__topo">
        <button type="button" className="conta-linha__abrir" onClick={onAbrir} aria-expanded={aberta}>
          <span className={`conta-linha__seta${aberta ? ' conta-linha__seta--aberta' : ''}`}>
            <Icone nome="seta" tamanho={12} />
          </span>
          <span className="conta-linha__nome">{conta.nome}</span>
        </button>

        <div className="conta-linha__selos">
          <Selo cor={COR_DO_PLANO[conta.plano.slug] || 'cinza'}>{conta.plano.nome}</Selo>
          <Selo cor="contorno">{conta.cobranca.nome}</Selo>
          <Selo cor={faixa.cor}>{faixa.rotulo}</Selo>
        </div>

        <div className="conta-linha__assentos">
          <strong>{conta.assentos.ocupados}</strong>
          <span>/{conta.assentos.limite ?? '∞'}</span>
          {semVaga && <span className="conta-linha__cheio">cheio</span>}
        </div>

        <div className="conta-linha__vencimento">
          {conta.faixa === 'encerrada' ? (
            // Conta encerrada não tem cobrança pendente: pintar a data de
            // vermelho a colocaria na fila de quem precisa ser cobrado.
            <div className="conta-linha__encerrada">encerrada</div>
          ) : (
            <div className={conta.diasParaVencer !== null && conta.diasParaVencer < 0 ? 'conta-linha__atrasado' : ''}>
              {textoDoVencimento(conta.diasParaVencer)}
            </div>
          )}
          <div className="conta-linha__data">{formatarData(conta.expiraEm)}</div>
        </div>

        <div className="conta-linha__acoes">
          {/* Um botão só: ele soma o ciclo CONTRATADO. Dois botões fixos
              ("+1 mês" / "+12") obrigavam quem cobra a lembrar de cor a
              periodicidade de cada cliente — e lembrar errado gera cobrança
              fora de hora. */}
          <button
            type="button"
            className="btn btn--secundario btn--pequeno"
            onClick={() => onRenovar(1)}
            title={`Renovar mais um ${conta.cobranca.abreviado} (${conta.cobranca.meses} ${conta.cobranca.meses === 1 ? 'mês' : 'meses'})`}
          >
            <Icone nome="atualizar" tamanho={13} />
            Renovar {conta.cobranca.meses === 1 ? '1 mês' : `${conta.cobranca.meses} meses`}
          </button>
          <button
            type="button"
            className="btn btn--fantasma btn--pequeno"
            onClick={onVerBase}
            title="Ver os empreendimentos e as tabelas de venda deste cliente"
          >
            <Icone nome="predio" tamanho={13} />
            Ver a base
          </button>
          <button type="button" className="btn btn--fantasma btn--pequeno" onClick={onEditar}>
            <Icone nome="lapis" tamanho={13} />
            {editando ? 'Fechar' : 'Editar'}
          </button>
        </div>
      </div>

      {editando && <FormEditarConta conta={conta} onSalvar={onSalvar} />}

      {aberta && (
        <div className="conta-linha__detalhe">
          <div className="conta-linha__cabecalho-detalhe">
            <div className="conta-linha__meta">
              Cliente desde {formatarData(conta.criadoEm)} · último acesso da equipe{' '}
              {textoDoUltimoAcesso(conta.ultimoAcesso)}
              {conta.assentos.convitesPendentes > 0 && ` · ${conta.assentos.convitesPendentes} convite(s) em aberto`}
              {conta.exigir2fa && ' · exige 2FA'}
            </div>

            {!adicionando && (
              <button
                type="button"
                className="btn btn--secundario btn--pequeno"
                onClick={() => setAdicionando(true)}
                disabled={semVaga}
                title={semVaga ? 'O plano deste cliente está completo' : undefined}
              >
                <Icone nome="mais" tamanho={13} />
                Adicionar usuário
              </button>
            )}
          </div>

          {semVaga && (
            <p className="conta-linha__sem-vaga">
              O plano deste cliente está completo ({conta.assentos.ocupados} de {conta.assentos.limite}). Aumente o
              plano em "Editar" para acrescentar mais alguém.
            </p>
          )}

          {adicionando && (
            <FormNovoUsuario
              aoCancelar={() => setAdicionando(false)}
              aoCriar={async (dados) => {
                await onCriarUsuario(dados)
                setAdicionando(false)
              }}
            />
          )}

          <ul className="mini-usuarios">
            {conta.usuarios.map((usuario) => (
              <li key={usuario.id} className={usuario.ativo ? '' : 'mini-usuarios--inativo'}>
                <div>
                  <div className="mini-usuarios__nome">
                    {usuario.nome}
                    <Selo cor={usuario.papel === 'dono' ? 'roxo' : usuario.papel === 'admin' ? 'azul' : 'cinza'}>
                      {NOME_DO_PAPEL[usuario.papel]}
                    </Selo>
                    {usuario.totpAtivo && (
                      <Selo cor="verde" icone="escudo">
                        2FA
                      </Selo>
                    )}
                    {!usuario.senhaDefinida && <Selo cor="ambar">Nunca acessou</Selo>}
                    {!usuario.ativo && <Selo cor="contorno">Sem acesso</Selo>}
                  </div>
                  <div className="mini-usuarios__meta">
                    {usuario.email} · {textoDoUltimoAcesso(usuario.ultimoAcesso)}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn--fantasma btn--pequeno"
                  onClick={() => void onLinkDeSenha(usuario.id, usuario.nome)}
                >
                  <Icone nome="chave" tamanho={13} />
                  Link de senha
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Edição da conta                                                      */
/* ------------------------------------------------------------------ */

function FormEditarConta({
  conta,
  onSalvar,
}: {
  conta: ContaDaPlataforma
  onSalvar: LinhaProps['onSalvar']
}) {
  const [nome, setNome] = useState(conta.nome)
  const [plano, setPlano] = useState(conta.plano.slug)
  const [limite, setLimite] = useState(conta.plano.personalizado ? String(conta.assentos.limite ?? 0) : '')
  const [status, setStatus] = useState<StatusConta>(conta.statusGravado)
  const [periodicidade, setPeriodicidade] = useState(conta.cobranca.slug)
  const [vencimento, setVencimento] = useState(paraCampoDeData(conta.expiraEm))
  const [observacoes, setObservacoes] = useState(conta.observacoes ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Plano personalizado EXIGE o número — a API recusa sem ele, e é melhor
  // dizer isso no formulário do que deixar o salvar falhar.
  const exigeLimite = plano === 'personalizado'

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (exigeLimite && limite.trim() === '') {
      setErro('Plano personalizado precisa do número de usuários (0 = sem teto)')
      return
    }

    setErro(null)
    setSalvando(true)
    try {
      await onSalvar({
        nome: nome.trim(),
        plano,
        periodicidade,
        limiteUsuarios: limite.trim() === '' ? null : Number(limite),
        status,
        expiraEm: vencimento || '',
        observacoes,
      })
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="conta-edicao" onSubmit={enviar}>
      <div className="grade grade--2">
        <Campo rotulo="Nome do cliente">
          <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>

        <Campo rotulo="Plano">
          <select className="filtros__select" value={plano} onChange={(e) => setPlano(e.target.value)}>
            {PLANOS_DISPONIVEIS.map((opcao) => (
              <option key={opcao.slug} value={opcao.slug}>
                {opcao.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          rotulo="Limite de usuários"
          obrigatorio={exigeLimite}
          dica={exigeLimite ? '0 = sem teto' : 'vazio = usa o do plano'}
        >
          <input
            className="entrada"
            type="number"
            min={0}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder={exigeLimite ? '25' : String(conta.plano.limite ?? '')}
          />
        </Campo>

        <Campo rotulo="Cobrança" dica="define quanto o botão Renovar soma">
          <select
            className="filtros__select"
            value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value)}
          >
            {PERIODICIDADES.map((opcao) => (
              <option key={opcao.slug} value={opcao.slug}>
                {opcao.nome} ({opcao.meses} {opcao.meses === 1 ? 'mês' : 'meses'})
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Situação">
          <select className="filtros__select" value={status} onChange={(e) => setStatus(e.target.value as StatusConta)}>
            {STATUS_DISPONIVEIS.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Vence em" dica="vazio = sem vencimento">
          <input
            className="entrada"
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
          />
        </Campo>

        <Campo rotulo="Anotação" dica="só você vê" className="col-inteira">
          <input
            className="entrada"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="combinado comercial, contato, o que for útil"
          />
        </Campo>
      </div>

      {erro && (
        <div className="acesso__erro" role="alert">
          <Icone nome="alerta" tamanho={15} />
          <span>{erro}</span>
        </div>
      )}

      <div className="form-convite__acoes">
        <button type="submit" className="btn btn--primario btn--pequeno" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Novo usuário dentro de um cliente existente                          */
/* ------------------------------------------------------------------ */

function FormNovoUsuario({
  aoCriar,
  aoCancelar,
}: {
  aoCriar: (dados: { nome: string; email: string; papel: Papel }) => Promise<void>
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('membro')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await aoCriar({ nome: nome.trim(), email: email.trim(), papel })
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="form-convite" onSubmit={enviar}>
      <div className="grade grade--2">
        <Campo rotulo="Nome" obrigatorio>
          <input
            className="entrada"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Carla Dias"
            autoFocus
            required
          />
        </Campo>

        <Campo rotulo="E-mail" obrigatorio>
          <input
            className="entrada"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="carla@cliente.com.br"
            required
          />
        </Campo>

        <Campo rotulo="Papel" dica={DESCRICAO_DO_PAPEL[papel]} className="col-inteira">
          <select className="filtros__select" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            <option value="membro">{NOME_DO_PAPEL.membro}</option>
            <option value="admin">{NOME_DO_PAPEL.admin}</option>
            <option value="dono">{NOME_DO_PAPEL.dono}</option>
          </select>
        </Campo>
      </div>

      {erro && (
        <div className="acesso__erro" role="alert">
          <Icone nome="alerta" tamanho={15} />
          <span>{erro}</span>
        </div>
      )}

      <div className="form-convite__acoes">
        <button type="button" className="btn btn--fantasma btn--pequeno" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primario btn--pequeno" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar e gerar link'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Novo cliente                                                         */
/* ------------------------------------------------------------------ */

function FormNovoCliente({
  aoCriar,
  aoCancelar,
}: {
  aoCriar: (dados: Parameters<typeof plataforma.criarConta>[0]) => Promise<void>
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState('')
  const [plano, setPlano] = useState('equipe')
  const [periodicidade, setPeriodicidade] = useState('mensal')
  const [limite, setLimite] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [email, setEmail] = useState('')
  const [diasTeste, setDiasTeste] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const exigeLimite = plano === 'personalizado'

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (exigeLimite && limite.trim() === '') {
      setErro('Plano personalizado precisa do número de usuários (0 = sem teto)')
      return
    }

    setErro(null)
    setSalvando(true)
    try {
      await aoCriar({
        nome: nome.trim(),
        plano,
        periodicidade,
        limiteUsuarios: limite.trim() === '' ? null : Number(limite),
        responsavel: responsavel.trim(),
        email: email.trim(),
        diasTeste: diasTeste.trim() === '' ? null : Number(diasTeste),
      })
    } catch (falha) {
      setErro(mensagemDoErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="form-convite" onSubmit={enviar}>
      <div className="grade grade--2">
        <Campo rotulo="Nome do cliente" obrigatorio>
          <input
            className="entrada"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Imobiliária Alfa"
            autoFocus
            required
          />
        </Campo>

        <Campo rotulo="Plano">
          <select className="filtros__select" value={plano} onChange={(e) => setPlano(e.target.value)}>
            {PLANOS_DISPONIVEIS.map((opcao) => (
              <option key={opcao.slug} value={opcao.slug}>
                {opcao.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Cobrança" dica="de quanto em quanto tempo ele paga">
          <select
            className="filtros__select"
            value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value)}
          >
            {PERIODICIDADES.map((opcao) => (
              <option key={opcao.slug} value={opcao.slug}>
                {opcao.nome} ({opcao.meses} {opcao.meses === 1 ? 'mês' : 'meses'})
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Responsável" obrigatorio dica="vira o dono da conta">
          <input
            className="entrada"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Ana Souza"
            required
          />
        </Campo>

        <Campo rotulo="E-mail do responsável" obrigatorio>
          <input
            className="entrada"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@alfa.com.br"
            required
          />
        </Campo>

        {exigeLimite && (
          <Campo rotulo="Limite de usuários" obrigatorio dica="0 = sem teto">
            <input
              className="entrada"
              type="number"
              min={0}
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              placeholder="25"
            />
          </Campo>
        )}

        <Campo rotulo="Período de teste" dica="em dias; vazio = já entra pagante">
          <input
            className="entrada"
            type="number"
            min={1}
            value={diasTeste}
            onChange={(e) => setDiasTeste(e.target.value)}
            placeholder="14"
          />
        </Campo>
      </div>

      {erro && (
        <div className="acesso__erro" role="alert">
          <Icone nome="alerta" tamanho={15} />
          <span>{erro}</span>
        </div>
      )}

      <div className="form-convite__acoes">
        <button type="button" className="btn btn--fantasma" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primario" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar cliente'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Todos os usuários                                                    */
/* ------------------------------------------------------------------ */

function TabelaDeUsuarios({
  usuarios,
}: {
  usuarios: (ContaDaPlataforma['usuarios'][number] & { conta: ContaDaPlataforma })[]
}) {
  if (usuarios.length === 0) {
    return <Estado icone="busca" titulo="Ninguém encontrado" texto="Ajuste a busca." />
  }

  return (
    <div className="tabela-usuarios">
      <div className="tabela-usuarios__cabecalho">
        <span>Pessoa</span>
        <span>Cliente</span>
        <span>Papel</span>
        <span>Último acesso</span>
      </div>

      <ul>
        {usuarios.map((usuario) => (
          <li key={usuario.id} className={usuario.ativo ? '' : 'tabela-usuarios--inativo'}>
            <div>
              <div className="tabela-usuarios__nome">
                {usuario.nome}
                {usuario.operador && <Selo cor="roxo">Operador</Selo>}
                {usuario.totpAtivo && (
                  <Selo cor="verde" icone="escudo">
                    2FA
                  </Selo>
                )}
                {!usuario.senhaDefinida && <Selo cor="ambar">Nunca acessou</Selo>}
              </div>
              <div className="tabela-usuarios__email">{usuario.email}</div>
            </div>

            <div className="tabela-usuarios__conta">
              <span>{usuario.conta.nome}</span>
              <Selo cor={COR_DO_PLANO[usuario.conta.plano.slug] || 'cinza'}>{usuario.conta.plano.nome}</Selo>
            </div>

            <div>{NOME_DO_PAPEL[usuario.papel]}</div>

            <div className={usuario.ultimoAcesso ? '' : 'tabela-usuarios__nunca'}>
              {textoDoUltimoAcesso(usuario.ultimoAcesso)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LinkGerado({ caminho, rotulo, aoFechar }: { caminho: string; rotulo: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}${caminho}`

  return (
    <div className="link-gerado">
      <div className="link-gerado__rotulo">{rotulo}</div>
      <div className="link-gerado__linha">
        <input className="entrada" value={url} readOnly onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn btn--secundario"
          onClick={() => {
            void navigator.clipboard
              .writeText(url)
              .then(() => {
                setCopiado(true)
                window.setTimeout(() => setCopiado(false), 2200)
              })
              .catch(() => {})
          }}
        >
          <Icone nome={copiado ? 'check' : 'copiar'} tamanho={15} />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn btn--fantasma" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <p className="link-gerado__dica">Vale uma vez só e expira em 48 horas.</p>
    </div>
  )
}

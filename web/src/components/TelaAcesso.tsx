import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { acesso, pediu2fa, type Papel, type Sessao } from '../lib/acesso'
import { mensagemDoErro } from '../lib/http'
import { Icone } from './Icones'
import { Campo } from './ui'

/**
 * As telas de quem ainda NAO entrou: login (com o segundo fator), definicao de
 * senha e aceite de convite.
 *
 * Ficam juntas porque dividem a mesma moldura e as mesmas regras de senha —
 * separa-las obrigaria a repetir as duas coisas em tres arquivos.
 */

/* ------------------------------------------------------------------ */
/* Moldura                                                             */
/* ------------------------------------------------------------------ */

interface MolduraProps {
  titulo: string
  subtitulo?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}

function Moldura({ titulo, subtitulo, children, rodape }: MolduraProps) {
  return (
    <div className="acesso">
      <div className="acesso__cartao">
        <div className="acesso__marca">
          <div className="acesso__logo">
            <Icone nome="camadas" tamanho={20} espessura={2} />
          </div>
          <div>
            <div className="acesso__produto">Compara Interativa</div>
            <div className="acesso__tagline">Empreendimentos no mapa</div>
          </div>
        </div>

        <h1 className="acesso__titulo">{titulo}</h1>
        {subtitulo && <p className="acesso__sub">{subtitulo}</p>}

        {children}
      </div>
      {rodape && <div className="acesso__rodape">{rodape}</div>}
    </div>
  )
}

/** Erro do formulario: sempre acima do botao, onde o olho já está. */
function Alerta({ texto }: { texto: string }) {
  return (
    <div className="acesso__erro" role="alert">
      <Icone nome="alerta" tamanho={15} />
      <span>{texto}</span>
    </div>
  )
}

function BotaoPrincipal({ ocupado, children }: { ocupado: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn btn--primario btn--bloco" disabled={ocupado}>
      {ocupado ? (
        <>
          <Icone nome="spinner" tamanho={16} className="girando" />
          Aguarde…
        </>
      ) : (
        children
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Regras de senha, compartilhadas pelas tres telas                    */
/* ------------------------------------------------------------------ */

/** Espelha `validarSenha` da API: a mesma regra dita antes de o servidor negar. */
export function conferirSenha(senha: string) {
  if (senha.length < 10) return 'Use pelo menos 10 caracteres'
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return 'Misture letras e números'
  return null
}

const DICA_SENHA = 'Pelo menos 10 caracteres, misturando letras e números.'

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export function TelaLogin({ onEntrou }: { onEntrou: (sessao: Sessao) => void }) {
  const [etapa, setEtapa] = useState<'senha' | 'codigo'>('senha')
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')

  const [desafio, setDesafio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [usandoRecuperacao, setUsandoRecuperacao] = useState(false)
  const [recuperacao, setRecuperacao] = useState('')

  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const campoCodigo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (etapa === 'codigo') campoCodigo.current?.focus()
  }, [etapa, usandoRecuperacao])

  async function enviarSenha(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)

    try {
      const resposta = await acesso.entrar(identificador.trim(), senha)

      if (pediu2fa(resposta)) {
        setDesafio(resposta.desafio)
        setEtapa('codigo')
        return
      }
      onEntrou(resposta)
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível entrar'))
    } finally {
      setOcupado(false)
    }
  }

  async function enviarCodigo(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setOcupado(true)

    try {
      const sessao = await acesso.confirmar2fa(
        desafio,
        usandoRecuperacao ? { recuperacao: recuperacao.trim() } : { codigo: codigo.trim() },
      )
      onEntrou(sessao)
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível confirmar'))
      // O desafio dura 5 minutos; vencido, a API pede o login inteiro de novo.
      if (falha && typeof falha === 'object' && 'corpo' in falha) {
        const corpo = (falha as { corpo?: { reiniciar?: boolean } }).corpo
        if (corpo?.reiniciar) {
          setEtapa('senha')
          setSenha('')
          setCodigo('')
        }
      }
    } finally {
      setOcupado(false)
    }
  }

  if (etapa === 'codigo') {
    return (
      <Moldura
        titulo="Verificação em duas etapas"
        subtitulo={
          usandoRecuperacao
            ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação.'
            : 'Abra o aplicativo autenticador e digite o código de 6 dígitos.'
        }
      >
        <form className="acesso__form" onSubmit={enviarCodigo} noValidate>
          {usandoRecuperacao ? (
            <Campo rotulo="Código de recuperação">
              <input
                ref={campoCodigo}
                className="entrada"
                value={recuperacao}
                onChange={(e) => setRecuperacao(e.target.value.toUpperCase())}
                placeholder="ABCDE-FGHIJ"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </Campo>
          ) : (
            <Campo rotulo="Código do aplicativo">
              <input
                ref={campoCodigo}
                className="entrada entrada--codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                // Deixa o celular oferecer o código do SMS/aplicativo direto.
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </Campo>
          )}

          {erro && <Alerta texto={erro} />}

          <BotaoPrincipal ocupado={ocupado}>Confirmar e entrar</BotaoPrincipal>

          <div className="acesso__links">
            <button
              type="button"
              className="link-acao"
              onClick={() => {
                setUsandoRecuperacao((atual) => !atual)
                setErro(null)
              }}
            >
              {usandoRecuperacao ? 'Voltar ao código do aplicativo' : 'Perdi o acesso ao aplicativo'}
            </button>
            <button
              type="button"
              className="link-acao"
              onClick={() => {
                setEtapa('senha')
                setErro(null)
                setCodigo('')
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Entrar" subtitulo="Use o e-mail ou o nome de usuário da sua conta.">
      <form className="acesso__form" onSubmit={enviarSenha} noValidate>
        <Campo rotulo="Usuário ou e-mail">
          <input
            className="entrada"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Campo>

        <Campo rotulo="Senha">
          <input
            className="entrada"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        {erro && <Alerta texto={erro} />}

        <BotaoPrincipal ocupado={ocupado}>Entrar</BotaoPrincipal>
      </form>

      {/* Nao ha "esqueci minha senha" automatico: sem servidor de e-mail, o
          link de redefinicao e gerado por quem administra a conta. Dizer isso
          aqui evita a pessoa ficar procurando um botao que nao existe. */}
      <p className="acesso__nota">
        Esqueceu a senha? Peça um link de redefinição a quem administra a conta da sua empresa.
      </p>
    </Moldura>
  )
}

/* ------------------------------------------------------------------ */
/* Definir senha (primeiro acesso e redefinicao)                       */
/* ------------------------------------------------------------------ */

export function TelaDefinirSenha({ token, onPronto }: { token: string; onPronto: () => void }) {
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [tocado, setTocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [pronto, setPronto] = useState(false)

  const problema = tocado ? conferirSenha(senha) : null
  const divergem = repetida.length > 0 && senha !== repetida

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)

    const invalida = conferirSenha(senha)
    if (invalida || senha !== repetida) {
      setErro(invalida || 'As senhas não são iguais')
      return
    }

    setErro(null)
    setOcupado(true)
    try {
      await acesso.definirSenha(token, senha)
      setPronto(true)
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível definir a senha'))
    } finally {
      setOcupado(false)
    }
  }

  if (pronto) {
    return (
      <Moldura titulo="Senha definida" subtitulo="Tudo certo — agora é só entrar com ela.">
        <button type="button" className="btn btn--primario btn--bloco" onClick={onPronto}>
          Ir para o login
        </button>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Defina sua senha" subtitulo="Este link vale uma vez só e expira em 48 horas.">
      <form className="acesso__form" onSubmit={enviar} noValidate>
        <Campo rotulo="Nova senha" dica={DICA_SENHA} erro={problema ?? undefined}>
          <input
            className={`entrada${problema ? ' entrada--erro' : ''}`}
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onBlur={() => setTocado(true)}
            autoComplete="new-password"
            autoFocus
            required
          />
        </Campo>

        <Campo rotulo="Repita a senha" erro={divergem ? 'As senhas não são iguais' : undefined}>
          <input
            className={`entrada${divergem ? ' entrada--erro' : ''}`}
            type="password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Campo>

        {erro && <Alerta texto={erro} />}

        <BotaoPrincipal ocupado={ocupado}>Salvar senha</BotaoPrincipal>
      </form>
    </Moldura>
  )
}

/* ------------------------------------------------------------------ */
/* Convite                                                             */
/* ------------------------------------------------------------------ */

interface DadosConvite {
  email: string
  nome: string | null
  papel: Papel
  conta: string
}

export function TelaConvite({ token, onEntrou }: { token: string; onEntrou: (sessao: Sessao) => void }) {
  const [convite, setConvite] = useState<DadosConvite | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [invalido, setInvalido] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [tocado, setTocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true

    acesso
      .verConvite(token)
      .then((dados) => {
        if (!vivo) return
        setConvite(dados)
        setNome(dados.nome ?? '')
      })
      .catch((falha) => vivo && setInvalido(mensagemDoErro(falha, 'Convite inválido')))
      .finally(() => vivo && setCarregando(false))

    return () => {
      vivo = false
    }
  }, [token])

  const problema = tocado ? conferirSenha(senha) : null

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setTocado(true)

    const invalida = conferirSenha(senha)
    if (invalida || !nome.trim()) {
      setErro(invalida || 'Informe seu nome')
      return
    }

    setErro(null)
    setOcupado(true)
    try {
      onEntrou(await acesso.aceitarConvite(token, { nome: nome.trim(), senha }))
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível aceitar o convite'))
    } finally {
      setOcupado(false)
    }
  }

  if (carregando) {
    return (
      <Moldura titulo="Convite">
        <div className="acesso__carregando">
          <Icone nome="spinner" tamanho={20} className="girando" />
          Conferindo o convite…
        </div>
      </Moldura>
    )
  }

  if (invalido || !convite) {
    return (
      <Moldura titulo="Convite indisponível" subtitulo={invalido ?? undefined}>
        <p className="acesso__nota">
          Convites valem por 7 dias e uma vez só. Peça um link novo a quem administra a conta.
        </p>
        <a className="btn btn--secundario btn--bloco" href="/">
          Ir para o login
        </a>
      </Moldura>
    )
  }

  return (
    <Moldura
      titulo={`Você foi convidado para ${convite.conta}`}
      subtitulo={
        <>
          Criando o acesso de <strong>{convite.email}</strong>. Escolha uma senha para entrar.
        </>
      }
    >
      <form className="acesso__form" onSubmit={enviar} noValidate>
        <Campo rotulo="Seu nome">
          <input
            className="entrada"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            autoFocus
            required
          />
        </Campo>

        <Campo rotulo="Senha" dica={DICA_SENHA} erro={problema ?? undefined}>
          <input
            className={`entrada${problema ? ' entrada--erro' : ''}`}
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onBlur={() => setTocado(true)}
            autoComplete="new-password"
            required
          />
        </Campo>

        {erro && <Alerta texto={erro} />}

        <BotaoPrincipal ocupado={ocupado}>Criar acesso e entrar</BotaoPrincipal>
      </form>
    </Moldura>
  )
}

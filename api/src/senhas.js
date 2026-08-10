/**
 * Senha, tokens e comparacao seseg.
 *
 * Tudo sai do `node:crypto` — nenhuma dependencia nova entrou no projeto por
 * causa disso.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt)

// N=16384 leva ~50-80ms neste servidor: caro o bastante para forca bruta,
// barato o bastante para o login nao parecer travado. 128*N*r = 16 MB, dentro
// do teto de memoria padrao do scrypt.
const CUSTO = { N: 16384, r: 8, p: 1 }
const TAMANHO_CHAVE = 64

/**
 * Guarda os parametros JUNTO do hash. Quando o custo subir (e ele sobe a cada
 * geracao de hardware), as senhas antigas continuam conferindo com os
 * parametros com que foram criadas.
 */
export async function gerarHashSenha(senha) {
  const sal = randomBytes(16)
  const chave = await derivar(senha.normalize('NFKC'), sal, TAMANHO_CHAVE, CUSTO)
  return ['scrypt', CUSTO.N, CUSTO.r, CUSTO.p, sal.toString('base64'), chave.toString('base64')].join('$')
}

export async function conferirSenha(senha, hashGravado) {
  if (!hashGravado) return false

  const [algoritmo, n, r, p, sal, chave] = String(hashGravado).split('$')
  if (algoritmo !== 'scrypt') return false

  try {
    const esperada = Buffer.from(chave, 'base64')
    const calculada = await derivar(String(senha).normalize('NFKC'), Buffer.from(sal, 'base64'), esperada.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return timingSafeEqual(esperada, calculada)
  } catch {
    return false
  }
}

/** Regra minima de senha: comprimento resolve mais que zoo de caractere. */
export function validarSenha(senha) {
  const texto = String(senha ?? '')
  if (texto.length < 10) return 'A senha precisa de pelo menos 10 caracteres'
  if (texto.length > 200) return 'A senha e longa demais'
  if (!/[a-zA-Z]/.test(texto) || !/\d/.test(texto)) return 'A senha precisa misturar letras e numeros'
  return null
}

/**
 * Token de sessao/convite/redefinicao. 32 bytes de aleatoriedade real; base64url
 * porque ele viaja em cookie e em URL.
 */
export function gerarToken() {
  return randomBytes(32).toString('base64url')
}

/**
 * O que vai para o banco e o hash do token, nunca ele mesmo. Vazou o arquivo do
 * SQLite, ninguem entra com o que esta la dentro.
 *
 * SHA-256 puro basta AQUI (e so aqui): o token ja tem 256 bits de entropia, nao
 * ha o que adivinhar por forca bruta — diferente de senha, que e curta e
 * escolhida por gente.
 */
export function hashDeToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/** Comparacao de strings sem vazar, pelo tempo, em qual caractere diferiu. */
export function iguaisEmTempoConstante(a, b) {
  const bufferA = Buffer.from(String(a))
  const bufferB = Buffer.from(String(b))
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Codigo de recuperacao do 2FA: 10 caracteres em blocos de 5, sem as letras que
 * o cliente confunde ao copiar do papel (0/O, 1/I/L).
 */
const ALFABETO_RECUPERACAO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function gerarCodigoRecuperacao() {
  // `byte % 31` sozinho enviesaria: 256 nao e multiplo de 31, entao as
  // primeiras letras do alfabeto sairiam com mais frequencia. Descartar os
  // bytes do excedente custa nada e devolve a distribuicao uniforme.
  const teto = Math.floor(256 / ALFABETO_RECUPERACAO.length) * ALFABETO_RECUPERACAO.length
  const letras = []

  while (letras.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte >= teto) continue
      letras.push(ALFABETO_RECUPERACAO[byte % ALFABETO_RECUPERACAO.length])
      if (letras.length === 10) break
    }
  }

  return `${letras.slice(0, 5).join('')}-${letras.slice(5).join('')}`
}

/** Normaliza o que a pessoa digitou (minusculo, sem hifen) antes de conferir. */
export function normalizarCodigoRecuperacao(codigo) {
  return String(codigo ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

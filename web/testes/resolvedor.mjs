/**
 * O que o Vite resolve e o Node não: `import './cub'` sem extensão.
 *
 * O Node 22 lê TypeScript direto (type stripping), e é assim que os testes
 * puros rodam sem navegador e sem bundler. Só que ele exige o caminho
 * COMPLETO, e o código do aplicativo é escrito na convenção do Vite (sem
 * extensão) — que é a convenção certa para o aplicativo. Em vez de sujar o
 * código com `.ts` em toda importação só para agradar o test runner, o gancho
 * abaixo tenta as extensões na mesma ordem que o Vite tentaria.
 *
 * Uso: `node --import ./testes/resolvedor.mjs --test testes/`.
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const EXTENSOES = ['.ts', '.tsx', '/index.ts', '/index.tsx']

const codigo = `
const EXTENSOES = ${JSON.stringify(EXTENSOES)}

export async function resolve(especificador, contexto, seguinte) {
  try {
    return await seguinte(especificador, contexto)
  } catch (erro) {
    // Só caminhos relativos: um pacote que não existe tem de continuar
    // falhando com a mensagem do Node, não virar "arquivo .ts não achado".
    // Pasta (o próprio "testes/" que o test runner varre) não vira arquivo.
    if (!especificador.startsWith('.') || especificador.endsWith('/')) throw erro
    for (const extensao of EXTENSOES) {
      try {
        return await seguinte(especificador + extensao, contexto)
      } catch {
        // tenta a próxima
      }
    }
    throw erro
  }
}
`

register(`data:text/javascript,${encodeURIComponent(codigo)}`, pathToFileURL('./'))

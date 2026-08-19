import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Config da instancia de VALIDACAO: serve o `dist` ja buildado e publica ele
// por um tunel do Cloudflare, para alguem de fora conferir a tela antes de a
// branch virar main. Fica separada da config normal de propósito — as portas e
// o banco sao proprios, entao nada aqui encosta nos ambientes que ja rodam na
// maquina.
//
//   cd web && ../node_modules/.bin/vite preview --config vite.tunel-teste.config.ts
//   cloudflared tunnel --url http://127.0.0.1:5501
//
// As portas e o cache saem de variavel de ambiente para a mesma config servir
// duas validacoes ao mesmo tempo sem uma derrubar a outra.
const PORTA = Number(process.env.TUNEL_PORTA ?? 5501)
const PORTA_API = Number(process.env.TUNEL_PORTA_API ?? 3501)
const CACHE = process.env.TUNEL_CACHE ?? 'node_modules/.vite-tunel'

const api = { target: `http://127.0.0.1:${PORTA_API}`, changeOrigin: true }

export default defineConfig({
  plugins: [react()],
  cacheDir: CACHE,
  preview: {
    port: PORTA,
    host: '127.0.0.1',
    strictPort: true,
    // O endereco do tunel muda a cada vez que ele sobe, e sem o host liberado o
    // Vite responde "Blocked request". O ponto na frente libera o dominio
    // inteiro do tunel em vez de um sorteio especifico que morre junto com ele.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': api,
      '/uploads': api,
    },
  },
})

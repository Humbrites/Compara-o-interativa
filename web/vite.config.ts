import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Fixo em IPv4: "localhost" no Node resolve para ::1 primeiro, e tunel SSH
    // costuma tentar 127.0.0.1 — sem isso a porta parece fechada de fora.
    host: '127.0.0.1',
    port: 5273,
    // O front chama /api/... e o Vite repassa para a API local — assim nao ha
    // URL de backend espalhada pelo codigo nem dor de CORS no navegador.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3210',
        changeOrigin: true,
      },
      // As fotos enviadas ficam no disco da API e sao servidas por ela.
      '/uploads': {
        target: 'http://127.0.0.1:3210',
        changeOrigin: true,
      },
    },
  },
})

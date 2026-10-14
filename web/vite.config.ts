import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em desenvolvimento o front roda no Vite e a API no uvicorn (porta 8000).
// O proxy deixa o front chamar /api sem CORS. Em produção a própria API
// serve o build de web/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { networkInterfaces } from "node:os";
import mkcert from "vite-plugin-mkcert";

// Detecta la IPv4 de la red local para que otros dispositivos puedan abrir el QR.
const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((address) => address && !address.internal && (address.family === "IPv4" || address.family === 4))
  ?.address || "localhost";

// https://vite.dev/config/
export default defineConfig({
  base: '/Autodash-Web/',
  plugins: [
    react(),
    // Genera certificados para que los navegadores puedan usar GPS por HTTPS.
    mkcert({ hosts: ["localhost", "127.0.0.1", lanAddress] }),
  ],
  define: {
    __AUTODASH_LAN_HOST__: JSON.stringify(lanAddress),
  },
  // Escucha en todas las interfaces para permitir acceso desde la red local.
  server: {
    host: "0.0.0.0",
  },
  preview: {
    host: "0.0.0.0",
  },
})

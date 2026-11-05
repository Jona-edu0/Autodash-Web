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
export default defineConfig(({ mode }) => {
  const plugins = [react()];

  if (mode !== "spotify-local") {
    // Genera certificados HTTPS para GPS y acceso desde la red local.
    plugins.push(mkcert({ hosts: ["localhost", "127.0.0.1", lanAddress] }));
  }

  return {
    base: '/Autodash-Web/',
    plugins,
    define: {
      __AUTODASH_LAN_HOST__: JSON.stringify(lanAddress),
    },
    server: {
      host: "0.0.0.0",
    },
    preview: {
      host: "0.0.0.0",
    },
  };
});

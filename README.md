AutoDash Web

Dashboard para vehículo eléctrico con velocímetro GPS y de demostración, nivel de batería y consulta del clima según la ubicación.

## Requisitos

- Node.js y npm instalados.
- Permiso de ubicación habilitado en el navegador para usar GPS y clima.
- Una clave de OpenWeather opcional para mostrar los datos meteorológicos.

## Iniciar el servidor local

Desde la carpeta del proyecto, instala las dependencias y arranca Vite:

```bash
npm install
npm run dev
```

En el mismo equipo, abre la dirección HTTPS que muestre Vite, normalmente `https://localhost:5173`.

## Abrir desde otro dispositivo de la misma red

Conecta ambos dispositivos a la misma red Wi-Fi. Escanea el QR del dashboard o abre la dirección `https://DIRECCION-IP:PUERTO` que Vite muestra como `Network`, por ejemplo `https://192.168.1.25:5174`. Acepta el acceso de Node.js en el firewall de Windows si aparece una solicitud.

Vite crea un certificado raíz local en `%USERPROFILE%\.vite-plugin-mkcert\rootCA.pem` y lo instala en el equipo servidor. Para que el navegador del teléfono confíe en el HTTPS, transfiere únicamente `rootCA.pem` al teléfono e instala ese certificado como CA:

- Android: abre el certificado y sigue el asistente del sistema para instalar un certificado de CA. En algunos modelos está en Ajustes > Seguridad > Cifrado y credenciales > Instalar un certificado > Certificado de CA.
- iPhone: abre el archivo para instalar el perfil y después habilita su confianza completa en Ajustes > General > Información > Ajustes de confianza de certificados.

No transfieras ni publiques `rootCA-key.pem`: es la clave privada del certificado. Después de instalar la CA, abre de nuevo la URL HTTPS del QR y permite la ubicación en el navegador y en los ajustes del teléfono. Si cambia la IP del equipo servidor, reinicia Vite y escanea el QR actualizado.

Este acceso funciona dentro de la misma red local. Para acceder desde fuera de ella, publica el proyecto en un servicio de alojamiento con HTTPS; el servidor local no lo hace accesible por Internet automáticamente.

## Clima

El clima actual y el índice UV se consultan automáticamente con Open-Meteo cuando se permite el acceso a la ubicación. No se necesita una clave API ni configuración adicional. Se requiere conexión a Internet y abrir la app mediante HTTPS o `localhost` para que el navegador permita usar el GPS.

## Compilar y previsualizar

```bash
npm run build
npm run preview
```

El servidor de previsualización también escucha en la red local. Usa la dirección y el puerto que informe Vite.

## Publicar en GitHub Pages

El flujo de GitHub Actions compila y valida la app en cada pull request hacia `main`. Al subir cambios a `main` o iniciar el flujo manualmente, también la publica en GitHub Pages:

`https://jona-edu0.github.io/Autodash-Web/`

En GitHub, configura **Settings > Pages > Build and deployment > Source** como **GitHub Actions**. La URL estará disponible cuando termine correctamente la primera ejecución del flujo.
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

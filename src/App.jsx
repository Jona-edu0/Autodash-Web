import { useEffect, useMemo, useState } from "react";
import { DigitalSpeedGauge } from "./components/DigitalSpeedGauge";
import { QRCodeSVG } from "qrcode.react";
import {
  BatteryCharging,
  CarFront,
  CloudSun,
  Gauge,
  Leaf,
  MapPin,
  Palette,
  Settings,
  SlidersHorizontal,
  UserCircle2,
  Wifi,
  Wrench,
} from "lucide-react";

import "./App.css";
import { useVehicleGps } from "./hooks/useVehicleGps";
import { adjustBatteryValue, batteryFromDistance, clampBattery } from "./utils/battery";
import { fetchCurrentWeather } from "./utils/weather";

// Consumo de referencia: una carga completa permite recorrer 25 km.
const KM_PER_FULL_BATTERY = 25;

// Presenta valores decimales y evita mostrar datos inválidos en pantalla.
function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

// Calcula el contraste del texto según el brillo del fondo elegido.
function getContrastColors(hexColor) {
  const hex = hexColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 155
    ? { strong: "#10202b", muted: "#38505e" }
    : { strong: "#ffffff", muted: "#d5ecf5" };
}

// Elige el color de acento del arco del velocímetro según el fondo.
function getGaugeAccent(hexColor) {
  const hex = hexColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 155 ? "#f05b67" : "#ff5f6d";
}

function App() {
  // Datos interactivos para la demostración y el control manual de batería.
  const [demoSpeed, setDemoSpeed] = useState(0);
  const [manualBattery, setManualBattery] = useState(78);
  const [manualBatteryInput, setManualBatteryInput] = useState("78");

  // Preferencias visuales y reloj que aparecen en la cabecera.
  const [theme, setTheme] = useState("midnight");
  const [backgroundColor, setBackgroundColor] = useState(
    () => localStorage.getItem("autodash-background") || "#dfe7ee"
  );
  const [now, setNow] = useState(new Date());

  // Estado del clima, su mensaje de carga y posibles errores de consulta.
  const [weather, setWeather] = useState(null);
  const [weatherStatus, setWeatherStatus] =
    useState("Esperando ubicación...");

  const [weatherError, setWeatherError] = useState("");

  // El hook GPS entrega velocidad, ubicación, distancia y acciones de rastreo.
  const gps = useVehicleGps();

  // Actualiza el reloj de la cabecera cada minuto y libera el temporizador al salir.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const formattedTime = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const formattedDate = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);

  // La batería restante descuenta el consumo según el recorrido GPS.
  const battery = useMemo(() => {
    return batteryFromDistance(manualBattery, gps.distanceKm, KM_PER_FULL_BATTERY);
  }, [manualBattery, gps.distanceKm]);

  const estimatedAutonomyKm = useMemo(
    () => clampBattery((battery / 100) * 25),
    [battery]
  );

  const batteryPercent = Math.round(battery);

  // Con GPS activo se usa la velocidad real; detenido, la del control de demostración.
  const speedValue = gps.tracking
    ? Number.isFinite(gps.speedKmh)
      ? Math.max(0, Math.min(120, gps.speedKmh))
      : 0
    : demoSpeed;

  const speedColor = getGaugeAccent(backgroundColor);
  // Si el panel está abierto en localhost, comparte la IPv4 del servidor local.
  const isLoopbackHost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );
  const shareUrl = isLoopbackHost
    ? `${window.location.protocol}//${__AUTODASH_LAN_HOST__}${window.location.port ? `:${window.location.port}` : ""}${window.location.pathname}${window.location.search}${window.location.hash}`
    : window.location.href;

  // Aplica el tema seleccionado a los estilos globales de la página.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Guarda el fondo elegido y actualiza colores de texto y velocímetro.
  useEffect(() => {
    document.documentElement.style.setProperty("--app-bg", backgroundColor);
    localStorage.setItem("autodash-background", backgroundColor);

    const contrastColors = getContrastColors(backgroundColor);
    const gaugeAccent = getGaugeAccent(backgroundColor);
    document.documentElement.style.setProperty(
      "--text-strong",
      contrastColors.strong
    );
    document.documentElement.style.setProperty(
      "--text-muted",
      contrastColors.muted
    );
    document.documentElement.style.setProperty(
      "--muted",
      contrastColors.muted
    );
    document.documentElement.style.setProperty(
      "--speed-arc-color",
      gaugeAccent
    );
    document.documentElement.style.setProperty(
      "--speed-arc-shadow",
      `${gaugeAccent}88`
    );
  }, [backgroundColor]);

  // Cada nueva posición GPS inicia una consulta meteorológica para esa ubicación.
  useEffect(() => {
    if (!gps.position) {
      setWeather(null);
      setWeatherStatus("Esperando ubicación...");
      setWeatherError("");
      return;
    }

    loadWeather(
      gps.position.latitude,
      gps.position.longitude
    );
  }, [gps.position]);

  // Consulta el clima actual, incluido el índice UV, para la ubicación GPS.
  async function loadWeather(lat, lon) {
    try {
      setWeatherStatus("Actualizando...");
      setWeatherError("");

      setWeather(await fetchCurrentWeather(lat, lon));
      setWeatherStatus("Actualizado");
    } catch (error) {
      console.error(error);

      setWeather(null);
      setWeatherStatus("No disponible");
      setWeatherError(
        `${error.message} Comprueba la conexión a Internet e inténtalo de nuevo.`
      );
    }
  }

  // Confirma el porcentaje manual, lo limita entre 0 y 100 y reinicia el recorrido.
  function applyBattery() {
    const rawValue = manualBatteryInput.trim();

    if (rawValue === "") return;

    const value = Number(rawValue);

    if (!Number.isFinite(value)) return;

    const safeValue = clampBattery(value);

    setManualBattery(safeValue);
    setManualBatteryInput(String(safeValue));
    gps.resetDistance();
  }

  // Conserva el número que se está escribiendo sin aplicarlo todavía.
  function syncManualBattery(rawValue) {
    setManualBatteryInput(rawValue);
  }

  // Ajusta en pasos de 10 el valor pendiente del formulario de batería.
  function changeBattery(delta) {
    const activeValue = Number.isFinite(Number(manualBatteryInput))
      ? Number(manualBatteryInput)
      : manualBattery;

    const nextValue = adjustBatteryValue(activeValue, delta);

    setManualBatteryInput(String(nextValue));
  }

  return (
    <div className="app-shell">

      {/* Menú lateral: identidad del proyecto, pestañas y mensaje de sostenibilidad. */}

      <aside className="sidebar glass">

        <div className="brand">
          <div className="brand-mark">
            <CarFront size={34} />
          </div>

          <div>
            <strong>AutoDash</strong>
            <strong>Web</strong>
          </div>
        </div>

        <nav className="nav-list">

          <button className="nav-item active">
            <Gauge size={23} />
            <span>Inicio</span>
          </button>

          <button className="nav-item disabled">
            <MapPin size={23} />
            <span>Navegación</span>
          </button>

          <button className="nav-item disabled">
            <SlidersHorizontal size={23} />
            <span>Multimedia</span>
          </button>

          <button className="nav-item disabled">
            <Settings size={23} />
            <span>Historial de consumo</span>
          </button>

          <button className="nav-item disabled">
            <Wrench size={23} />
            <span>Mantenimiento</span>
          </button>

        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-qr">
            <QRCodeSVG
              value={shareUrl}
              size={104}
              level="M"
              bgColor="#ffffff"
              fgColor="#14232c"
              title={`Código QR para abrir AutoDash en ${shareUrl}`}
            />
            <span>Escanea desde la misma Wi-Fi</span>
          </div>

          <div className="sustainability">
            <Leaf size={34} />

            <span>
              Movilidad sustentable
              <br />
              para un mejor mañana
            </span>
          </div>
        </div>

      </aside>

      {/* Área principal que contiene la cabecera y el tablero de datos. */}

      <main className="main-area">

        {/* Cabecera: nombre del proyecto, hora, fecha, fondo y tema visual. */}

        <header className="topbar glass">

          <div className="vehicle-title">

            <div className="vehicle-icon">
              <CarFront size={29} />
            </div>

            <div>
              <h1>PAEC Programación</h1>

              <p>
                Equipo 1
                <span>•</span>
                The best
              </p>
            </div>

          </div>

          <div className="topbar-info">

            <span className="connection">
              <Wifi size={20} />
              GPS
            </span>

            <div className="date-block">
              <span>{formattedTime}</span>
              <span>{formattedDate}</span>
            </div>

            <label className="color-picker" title="Personalizar fondo">
              <Palette size={18} />
              <input
                type="color"
                value={backgroundColor}
                aria-label="Color de fondo de la aplicación"
                onChange={(event) => setBackgroundColor(event.target.value)}
              />
            </label>

            <button
              className="theme-button"
              onClick={() =>
                setTheme((current) =>
                  current === "midnight"
                    ? "light"
                    : "midnight"
                )
              }
            >
              <UserCircle2 size={30} />
            </button>

          </div>

        </header>

        {/* Retícula principal: velocímetro a la izquierda y paneles a la derecha. */}

        <section className="dashboard-grid">

          {/* Velocímetro: muestra la velocidad GPS o la velocidad de demostración. */}

          <section className="card speed-card glass">

            <div className="card-heading">

              <div className="heading-icon">
                <Gauge size={23} />
              </div>

              <div>
                <h2>Velocidad</h2>

                <p>
                  {gps.tracking
                    ? "GPS activo"
                    : "GPS detenido"}
                </p>
              </div>

            </div>

            <div className="speedometer">
              <DigitalSpeedGauge value={speedValue} max={120} accent={speedColor} />
            </div>

            {!gps.tracking ? (

              <button
                className="primary-button"
                onClick={gps.startTracking}
              >
                Activar GPS
              </button>

            ) : (

              <button
                className="secondary-button"
                onClick={gps.stopTracking}
              >
                Detener GPS
              </button>

            )}

            {/* Este deslizador permite demostrar el velocímetro sin desplazarse. */}
            <div className="speed-demo-control">
              <div className="speed-demo-label">
                <label htmlFor="speed-demo-range">
                  {gps.tracking ? "Velocidad GPS" : "Velocidad de demostración"}
                </label>
                <strong>{Math.round(speedValue)} km/h</strong>
              </div>
              <input
                id="speed-demo-range"
                type="range"
                min="0"
                max="120"
                step="1"
                value={demoSpeed}
                disabled={gps.tracking}
                onChange={(event) => setDemoSpeed(Number(event.target.value))}
                aria-label="Velocidad de demostración en kilómetros por hora"
              />
            </div>

            {gps.error && (
              <p className="error-text">
                {gps.error}
              </p>
            )}

          </section>

          {/* Columna derecha: indicadores de batería y condiciones del clima. */}

          <div className="right-column">

            {/* Batería: nivel actual, autonomía, recorrido y ajuste manual. */}

            <section className="card battery-card glass">

              <div className="card-heading battery-heading">

                <div className="heading-icon">
                  <BatteryCharging size={24} />
                </div>

                <div className="battery-title-wrap">
                  <h2>Batería</h2>

                  <p>
                    25 km por cada 100%
                  </p>
                </div>

                {/* Silueta de batería con relleno proporcional al porcentaje restante. */}
                <div className="battery-status">
                  <div className="battery-meter" aria-label="Nivel de batería">
                    <div className="battery-shell">
                      <span
                        className="battery-fill-track"
                        style={{ width: `${batteryPercent}%` }}
                      >
                        <span className="battery-fill" />
                      </span>
                    </div>
                    <span className="battery-percent">{batteryPercent}%</span>
                  </div>
                </div>

              </div>

              {/* Cifras calculadas de autonomía restante y distancia recorrida. */}
              <div className="battery-details">

                <div>
                  <span>
                    Autonomía estimada
                  </span>

                  <strong>
                    {formatNumber(estimatedAutonomyKm, 1)} km
                  </strong>
                </div>

                <div>
                  <span>
                    Recorrido
                  </span>

                  <strong>
                    {formatNumber(
                      gps.distanceKm,
                      2
                    )} km
                  </strong>
                </div>

              </div>

              {/* Barra horizontal secundaria del porcentaje de batería. */}
              <div className="progress-track">

                <div
                  className="progress-value"
                  style={{
                    width: `${battery}%`
                  }}
                />

              </div>

              {/* Formulario para fijar el nivel inicial y ajustar en pasos de 10%. */}
              <div className="battery-manual">

                <label>
                  Batería inicial (%)
                </label>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    applyBattery();
                  }}
                >

                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualBatteryInput}
                    onChange={(e) => syncManualBattery(e.target.value)}
                  />

                  <button
                    type="submit"
                  >
                    Aplicar
                  </button>

                </form>

                <div className="battery-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => changeBattery(-10)}
                  >
                    -10%
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => changeBattery(10)}
                  >
                    +10%
                  </button>
                </div>

              </div>

            </section>

            {/* Clima: temperatura, descripción, ubicación, humedad, viento e índice UV. */}

            <section className="card weather-card glass">

              <div className="card-heading">

                <div className="heading-icon">
                  {weather?.current?.weather?.[0]?.icon ? (
                    <img
                      src={
                        `https://openweathermap.org/img/wn/` +
                        `${weather.current.weather[0].icon}@2x.png`
                      }
                      alt=""
                    />
                  ) : (
                    <CloudSun size={24} />
                  )}
                </div>

                <div>
                  <h2>Clima</h2>

                  <p>
                    {weatherStatus}
                  </p>
                </div>

              </div>

              {/* Con datos GPS se dibujan las mediciones; sin ellos aparecen guiones. */}
              {weather ? (

                <div className="weather-layout">

                  <div className="weather-main">

                    <div>
                      <strong>{Math.round(weather.current.temp)}°C</strong>

                      <div className="weather-description">
                        <span>
                          {weather.current.weather?.[0]?.description}
                        </span>
                      </div>

                      <small>
                        <MapPin size={14} />
                        {weather.timezone}
                      </small>
                    </div>

                  </div>

                  <div className="weather-side">
                    <div className="weather-stats" aria-label="Datos meteorológicos">
                      <div>
                        <span>Humedad</span>
                        <strong>{formatNumber(weather.current.humidity, 0)}%</strong>
                      </div>

                      <div>
                        <span>Viento</span>
                        <strong>{formatNumber(weather.current.wind_speed * 3.6, 1)} km/h</strong>
                      </div>

                      <div>
                        <span>UV</span>
                        <strong>{formatNumber(weather.current.uvi, 1)}</strong>
                      </div>
                    </div>

                  </div>

                </div>

              ) : (

                <div className="weather-layout">

                  <div className="weather-empty">
                    <div className="weather-description">
                      <span>
                        Activa el GPS para consultar
                        el clima de tu ubicación.
                      </span>
                    </div>
                  </div>

                  <div className="weather-side">
                    <div className="weather-stats" aria-label="Datos meteorológicos">
                      <div>
                        <span>Humedad</span>
                        <strong>--%</strong>
                      </div>

                      <div>
                        <span>Viento</span>
                        <strong>-- km/h</strong>
                      </div>

                      <div>
                        <span>UV</span>
                        <strong>--</strong>
                      </div>
                    </div>
                  </div>

                </div>

              )}

              {weatherError && (
                <p className="error-text">
                  {weatherError}
                </p>
              )}

              <a
                className="weather-attribution"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
              >
                Datos meteorológicos: Open-Meteo
              </a>

            </section>

          </div>

        </section>

        {/* Tres espacios visuales reservados para futuras funciones del tablero. */}

        <section className="future-shortcuts">

          <div className="placeholder glass">
            Acceso rápido
          </div>

          <div className="placeholder glass">
            Acceso rápido
          </div>

          <div className="placeholder glass">
            Acceso rápido
          </div>

        </section>

      </main>

    </div>
  );
}

export default App;
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { DigitalSpeedGauge } from "./components/DigitalSpeedGauge";
import { MultimediaPanel } from "./components/MultimediaPanel";
import { QRCodeSVG } from "qrcode.react";
import "leaflet/dist/leaflet.css";
import {
  BatteryCharging,
  CarFront,
  CloudSun,
  Gauge,
  Leaf,
  LocateFixed,
  MapPin,
  Minus,
  Palette,
  Plus,
  Settings,
  SlidersHorizontal,
  UserCircle2,
  Wifi,
  Wrench,
} from "lucide-react";

import "./App.css";
import { useVehicleGps } from "./hooks/useVehicleGps";
import { adjustBatteryValue, batteryFromDistance, clampBattery } from "./utils/battery";

// Consumo de referencia: una carga completa permite recorrer 25 km.
const KM_PER_FULL_BATTERY = 25;

// Presenta valores decimales y evita mostrar datos inválidos en pantalla.
function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

// Unifica el formato de las respuestas meteorológicas de distintos servicios.
function normalizeWeatherResponse(data) {
  if (!data) return null;

  if (data.current) {
    return data;
  }

  const weatherDescription = data.weather?.[0]?.description || "Clima";
  const weatherIcon = data.weather?.[0]?.icon || "01d";

  return {
    timezone: data.name || "Ubicación actual",
    current: {
      temp: data.main?.temp ?? 0,
      humidity: data.main?.humidity ?? 0,
      wind_speed: data.wind?.speed ?? 0,
      uvi: data.uvi ?? null,
      weather: [{
        description: weatherDescription,
        icon: weatherIcon,
      }],
    },
  };
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

function haversineKm(pointA, pointB) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(pointB[0] - pointA[0]);
  const dLng = toRad(pointB[1] - pointA[1]);
  const lat1 = toRad(pointA[0]);
  const lat2 = toRad(pointB[0]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildOfflineRoute(origin, destination) {
  const points = [];
  const totalSegments = 18;

  for (let index = 0; index <= totalSegments; index += 1) {
    const progress = index / totalSegments;
    const curvedLat = origin.lat + (destination.lat - origin.lat) * progress;
    const curvedLng = origin.lng + (destination.lng - origin.lng) * progress;
    const driftLat = Math.sin(progress * Math.PI * 2.2 + 0.4) * 0.18;
    const driftLng = Math.cos(progress * Math.PI * 2.6 + 0.8) * 0.16;

    points.push([curvedLat + driftLat, curvedLng + driftLng]);
  }

  return points;
}

function MapCenterController({ center }) {
  const map = useMap();
  const [latitude, longitude] = center;

  useEffect(() => {
    map.panTo([latitude, longitude], { animate: true, duration: 0.6 });
  }, [latitude, longitude, map]);

  return null;
}

function MapDestinationPicker({ onDestinationSelect }) {
  useMapEvents({
    click(event) {
      if (event.originalEvent.target.closest?.(".leaflet-control")) {
        return;
      }

      onDestinationSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function MapControls({ userLocation }) {
  const map = useMap();

  return (
    <div className="map-controls leaflet-control">
      <button
        className="map-control-button"
        type="button"
        aria-label="Acercar mapa"
        title="Acercar"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomIn();
        }}
      >
        <Plus size={19} />
      </button>
      <button
        className="map-control-button"
        type="button"
        aria-label="Alejar mapa"
        title="Alejar"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomOut();
        }}
      >
        <Minus size={19} />
      </button>
      <button
        className="map-control-button map-control-home"
        type="button"
        aria-label="Volver al lugar de origen"
        title={userLocation ? "Volver al origen" : "Ubicación GPS no disponible"}
        disabled={!userLocation}
        onClick={(event) => {
          event.stopPropagation();
          if (userLocation) {
            map.flyTo([userLocation.lat, userLocation.lon], map.getZoom(), { duration: 0.8 });
          }
        }}
      >
        <LocateFixed size={18} />
      </button>
    </div>
  );
}

function describeStep(step) {
  const maneuver = step?.maneuver;
  const name = step?.name || "ruta principal";

  if (!maneuver) {
    return `Sigue por ${name}`;
  }

  const instructions = {
    turn: "Gira",
    depart: "Inicia",
    arrive: "Llegas a tu destino",
    merge: "Fusiona",
    onramp: "Entra a la autopista",
    offramp: "Sale de la autopista",
    fork: "Toma la bifurcación",
    roundabout: "Entra al rotonda",
    continue: "Continúa",
    "new name": "Sigue",
  };

  const modifier = maneuver.modifier || "straight";
  const direction = {
    straight: "recto",
    left: "a la izquierda",
    right: "a la derecha",
    ut: "hacia arriba",
    slight_left: "ligeramente a la izquierda",
    slight_right: "ligeramente a la derecha",
    sharp_left: "bruscamente a la izquierda",
    sharp_right: "bruscamente a la derecha",
  }[modifier] || "recto";

  const label = instructions[maneuver.type] || "Sigue";

  if (maneuver.type === "arrive") {
    return `Llegaste a ${name}`;
  }

  return `${label} ${direction} por ${name}`;
}

const MAP_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const NAVIGATION_DESTINATIONS = [
  { id: "texcal", name: "Texcal", city: "Zona industrial", lat: 19.4093, lng: -99.1622 },
  { id: "centro", name: "Centro Histórico", city: "Ciudad de México", lat: 19.4326, lng: -99.1332 },
  { id: "campus", name: "Campus Tec", city: "Monterrey", lat: 25.6516, lng: -100.2895 },
];

function LeafletNavigationMap({ userLocation, selectedDestination, navigationDestinations, onRouteUpdate, onDestinationSelect }) {
  const [routeLine, setRouteLine] = useState([]);

  useEffect(() => {
    const destination = navigationDestinations.find((item) => item.id === selectedDestination);

    if (!userLocation || !destination) {
      setRouteLine([]);
      onRouteUpdate({
        distanceKm: 0,
        durationMin: 0,
        recommendedSpeed: 0,
        nextInstruction: destination
          ? "Esperando ubicación actual..."
          : "Selecciona un destino para calcular la ruta",
        upcomingSteps: [],
      });
      return;
    }

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${userLocation.lon},${userLocation.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;

    fetch(routeUrl)
      .then((response) => response.json())
      .then((data) => {
        const route = data.routes?.[0];

        if (!route) {
          throw new Error("Sin ruta disponible");
        }

        const points = route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];
        const distanceKm = route.distance / 1000;
        const durationMin = route.duration / 60;
        const avgSpeed = distanceKm > 0 && durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
        const steps = route.legs?.[0]?.steps || [];
        const upcomingSteps = steps.slice(0, 3).map((step) => ({
          instruction: describeStep(step),
          distance: step.distance ? `${Math.round(step.distance)} m` : "",
        }));

        setRouteLine(points);
        onRouteUpdate({
          distanceKm,
          durationMin,
          recommendedSpeed: Math.max(20, Math.min(90, Math.round(avgSpeed * 0.9))),
          nextInstruction: upcomingSteps[0]?.instruction || "Sigue la ruta hacia tu destino",
          upcomingSteps,
        });
      })
      .catch(() => {
        const fallbackPoints = buildOfflineRoute(
          { lat: userLocation.lat, lng: userLocation.lon },
          { lat: destination.lat, lng: destination.lng }
        );
        const fallbackDistanceKm = fallbackPoints.slice(1).reduce((total, point, index) => {
          const previous = fallbackPoints[index];
          return total + haversineKm(previous, point);
        }, 0);
        const fallbackDurationMin = Math.max(10, fallbackDistanceKm / 38 * 60);

        setRouteLine(fallbackPoints);
        onRouteUpdate({
          distanceKm: fallbackDistanceKm,
          durationMin: fallbackDurationMin,
          recommendedSpeed: 58,
          nextInstruction: "Ruta local simulada: sigue el recorrido recomendado.",
          upcomingSteps: [
            { instruction: "Inicia el recorrido desde tu ubicación actual", distance: "0 m" },
            { instruction: "Mantén velocidad constante y sigue la ruta", distance: `${Math.round(fallbackDistanceKm * 0.5)} km` },
            { instruction: `Llegas a ${destination.name}`, distance: `${Math.round(fallbackDistanceKm)} km` },
          ],
        });
      });
  }, [navigationDestinations, onRouteUpdate, selectedDestination, userLocation]);

  const destination = navigationDestinations.find((item) => item.id === selectedDestination);
  const hasExternalMapTiles = typeof navigator !== "undefined" ? navigator.onLine : true;

  return (
    <MapContainer
      center={userLocation ? [userLocation.lat, userLocation.lon] : [19.4326, -99.1332]}
      zoom={13}
      minZoom={6}
      maxZoom={18}
      scrollWheelZoom
      zoomControl={false}
      className={`navigation-map ${hasExternalMapTiles ? "" : "navigation-map-offline"}`}
    >
      {hasExternalMapTiles && (
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url={MAP_TILES}
        />
      )}

      {userLocation && (
        <CircleMarker
          center={[userLocation.lat, userLocation.lon]}
          radius={10}
          pathOptions={{ color: "#7dd3fc", fillColor: "#38bdf8", fillOpacity: 0.95, weight: 3 }}
        />
      )}

      {destination && (
        <CircleMarker
          center={[destination.lat, destination.lng]}
          radius={12}
          pathOptions={{ color: "#fef3c7", fillColor: "#fbbf24", fillOpacity: 1, weight: 3 }}
          eventHandlers={{
            click: () => onRouteUpdate({ nextInstruction: `Destino seleccionado: ${destination.name}` }),
          }}
        />
      )}

      {routeLine.length > 0 && (
        <Polyline
          positions={routeLine}
          pathOptions={{ color: "#22d3ee", weight: 7, opacity: 0.92, lineCap: "round", lineJoin: "round" }}
        />
      )}

      <MapDestinationPicker onDestinationSelect={onDestinationSelect} />
      <MapControls userLocation={userLocation} />

      <MapCenterController
        center={userLocation
          ? [userLocation.lat, userLocation.lon]
          : destination
            ? [destination.lat, destination.lng]
            : [19.4326, -99.1332]}
      />
    </MapContainer>
  );
}

function NavigationMap({ userLocation, selectedDestination, navigationDestinations, onRouteUpdate, onDestinationSelect }) {
  return (
    <LeafletNavigationMap
      userLocation={userLocation}
      selectedDestination={selectedDestination}
      navigationDestinations={navigationDestinations}
      onRouteUpdate={onRouteUpdate}
      onDestinationSelect={onDestinationSelect}
    />
  );
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
  const [activeNav, setActiveNav] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return query.has("code") || query.has("error") ? "Multimedia" : "Inicio";
  });

  const navItems = [
    { id: "inicio", label: "Inicio", icon: Gauge },
    { id: "navegacion", label: "Navegación", icon: MapPin },
    { id: "multimedia", label: "Multimedia", icon: SlidersHorizontal },
    { id: "historial", label: "Historial de consumo", icon: Settings },
    { id: "mantenimiento", label: "Mantenimiento", icon: Wrench },
  ];

  const [selectedDestination, setSelectedDestination] = useState(null);
  const [mapDestination, setMapDestination] = useState(null);
  const navigationDestinations = useMemo(
    () => mapDestination ? [...NAVIGATION_DESTINATIONS, mapDestination] : NAVIGATION_DESTINATIONS,
    [mapDestination]
  );
  const selectedDestinationInfo = navigationDestinations.find(
    (item) => item.id === selectedDestination
  );
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [routeLine, setRouteLine] = useState([]);
  const [routeInfo, setRouteInfo] = useState({
    distanceKm: 0,
    durationMin: 0,
    recommendedSpeed: 0,
    nextInstruction: "Selecciona un destino para iniciar",
    upcomingSteps: [],
  });

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
  const estimatedRouteBatteryPercent = routeInfo.distanceKm > 0
    ? (routeInfo.distanceKm / KM_PER_FULL_BATTERY) * 100
    : null;

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

  // Consulta el clima y, si hace falta, obtiene el índice UV de otro servicio.
  async function loadWeather(lat, lon) {
    const key = import.meta.env.VITE_OPENWEATHER_API_KEY;

    if (!key) {
      const fallbackWeather = normalizeWeatherResponse({
        timezone: "Local",
        current: {
          temp: 24,
          humidity: 56,
          wind_speed: 12,
          uvi: 3,
          weather: [{ description: "Despejado", icon: "01d" }],
        },
      });

      setWeather(fallbackWeather);
      setWeatherStatus("Modo local");
      setWeatherError("Sin API externa: usando clima de demostración local.");
      return;
    }

    try {
      setWeatherStatus("Actualizando...");
      setWeatherError("");

      const endpoints = [
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${key}`,
        `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&units=metric&lang=es&appid=${key}`,
      ];

      let data = null;

      for (const endpoint of endpoints) {
        const response = await fetch(endpoint);

        if (!response.ok) {
          continue;
        }

        data = await response.json();
        break;
      }

      if (!data) {
        throw new Error("No se pudo obtener la información del clima");
      }

      const normalizedWeather = normalizeWeatherResponse(data);

      if (!normalizedWeather) {
        throw new Error("La respuesta del clima no tiene el formato esperado");
      }

      if (!Number.isFinite(normalizedWeather.current.uvi)) {
        const uvUrl =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=uv_index&timezone=auto`;
        const uvResponse = await fetch(uvUrl);

        if (uvResponse.ok) {
          const uvData = await uvResponse.json();
          const uvIndex = uvData.current?.uv_index;

          normalizedWeather.current.uvi = Number.isFinite(uvIndex)
            ? uvIndex
            : null;
        }
      }

      setWeather(normalizedWeather);
      setWeatherStatus("Actualizado");
    } catch (error) {
      console.error(error);

      setWeather(null);

      setWeatherStatus("No disponible");

      setWeatherError(
        "No se pudo consultar el clima de tu ubicación, pero el GPS sigue activo."
      );
    }
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Este navegador no permite obtener la ubicación.");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocationError("");
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setUserLocation(null);
        setLocationError("Permite el acceso a la ubicación para seguir el dispositivo.");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 30000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!userLocation) {
      setRouteLine([]);
      setRouteInfo({
        distanceKm: 0,
        durationMin: 0,
        recommendedSpeed: 0,
        nextInstruction: "Selecciona un destino para iniciar",
        upcomingSteps: [],
      });
    }
  }, [userLocation]);

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

  function handleMapDestinationSelect({ lat, lng }) {
    const coordinates = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setMapDestination({
      id: "map",
      name: "Punto del mapa",
      city: coordinates,
      lat,
      lng,
    });
    setSelectedDestination("map");
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

          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${activeNav === label ? "active" : ""}`}
              onClick={() => setActiveNav(label)}
            >
              <Icon size={23} />
              <span>{label}</span>
            </button>
          ))}

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

        {activeNav === "Inicio" ? (
          <>
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

                </section>

              </div>

            </section>

            {/* Tres espacios visuales reservados para futuras funciones del tablero. */}

            <section className="future-shortcuts">

              <button
                type="button"
                className="placeholder glass shortcut-card"
                onClick={() => setActiveNav("Navegación")}
              >
                <div className="shortcut-icon">
                  <MapPin size={28} />
                </div>
                <div className="shortcut-content">
                  <strong>Navegación</strong>
                </div>
              </button>

              <button
                type="button"
                className="placeholder glass shortcut-card"
                onClick={() => setActiveNav("Multimedia")}
              >
                <div className="shortcut-icon">
                  <SlidersHorizontal size={28} />
                </div>
                <div className="shortcut-content">
                  <strong>Multimedia</strong>
                </div>
              </button>

              <button
                type="button"
                className="placeholder glass shortcut-card"
                onClick={() => setActiveNav("Historial de consumo")}
              >
                <div className="shortcut-icon">
                  <BatteryCharging size={28} />
                </div>
                <div className="shortcut-content">
                  <strong>Historial</strong>
                </div>
              </button>

            </section>
          </>
        ) : (
          <section className="tab-view glass">
            <div className="tab-view-header">
              <div className={`heading-icon ${activeNav === "Navegación" ? "navigation-icon-frame" : activeNav === "Multimedia" ? "multimedia-icon-frame" : ""}`}>
                {activeNav === "Navegación" && <MapPin size={24} />}
                {activeNav === "Multimedia" && <SlidersHorizontal size={24} />}
                {activeNav === "Historial de consumo" && <BatteryCharging size={24} />}
                {activeNav === "Mantenimiento" && <Wrench size={24} />}
              </div>
              <div>
                <h2 className={activeNav === "Navegación" ? "navigation-title" : activeNav === "Multimedia" ? "multimedia-title" : ""}>{activeNav}</h2>
                <p className={activeNav === "Navegación" ? "navigation-subtitle" : activeNav === "Multimedia" ? "multimedia-subtitle" : ""}>
                  {activeNav === "Navegación" && "Rutas, destino y seguimiento."}
                  {activeNav === "Multimedia" && "Audio, entretenimiento y preferencias."}
                  {activeNav === "Historial de consumo" && "Consumo energético y rendimiento del viaje."}
                  {activeNav === "Mantenimiento" && "Estado del vehículo y tareas del servicio."}
                </p>
              </div>
            </div>

            {activeNav === "Navegación" && (
              <div className="navigation-tab">
                <div className="navigation-layout">
                  <div className="navigation-panel">
                    <div className="location-card">
                      <div className="location-card-icon">
                        <MapPin size={20} />
                      </div>
                      <div className="location-card-copy">
                        <span>Lugar de origen</span>
                        <strong>
                          {userLocation
                            ? `${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`
                            : locationError || "Buscando ubicación actual..."}
                        </strong>
                      </div>
                    </div>

                    <div className="location-card">
                      <div className="location-card-icon">
                        <MapPin size={20} />
                      </div>
                      <div className="location-card-copy">
                        <span>Destino</span>
                        <strong>
                          {selectedDestinationInfo
                            ? `${selectedDestinationInfo.name} · ${selectedDestinationInfo.city}`
                            : "Sin destino seleccionado"}
                        </strong>
                      </div>
                    </div>

                    <div className="route-summary">
                      <div className="route-stat">
                        <span>Distancia</span>
                        <strong>{routeInfo.distanceKm ? `${routeInfo.distanceKm.toFixed(1)} km` : "--"}</strong>
                      </div>
                      <div className="route-stat">
                        <span>Tiempo</span>
                        <strong>{routeInfo.durationMin ? `${Math.round(routeInfo.durationMin)} min` : "--"}</strong>
                      </div>
                      <div className="route-stat">
                        <span>Vel. recomendada</span>
                        <strong>{routeInfo.recommendedSpeed ? `${routeInfo.recommendedSpeed} km/h` : "--"}</strong>
                      </div>
                      <div className="route-stat">
                        <span>Batería estimada</span>
                        <strong>
                          {estimatedRouteBatteryPercent !== null
                            ? `${formatNumber(estimatedRouteBatteryPercent, 1)}%`
                            : "--"}
                        </strong>
                      </div>
                    </div>

                  </div>

                  <div className="navigation-map-wrap">
                    <NavigationMap
                      userLocation={userLocation}
                      selectedDestination={selectedDestination}
                      navigationDestinations={navigationDestinations}
                      onRouteUpdate={setRouteInfo}
                      onDestinationSelect={handleMapDestinationSelect}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeNav === "Multimedia" && (
              <MultimediaPanel />
            )}

            {activeNav === "Historial de consumo" && (
              <div className="tab-grid">
                <div className="tab-card">
                  <span>Uso hoy</span>
                  <strong>34.8 kWh</strong>
                  <small>Promedio 5.9 kWh/100 km</small>
                </div>
                <div className="tab-card">
                  <span>Viajes</span>
                  <strong>5 recorridos</strong>
                  <small>+12% vs. semana anterior</small>
                </div>
                <div className="tab-card">
                  <span>Eficiencia</span>
                  <strong>92%</strong>
                  <small>Optimizado para ciudad</small>
                </div>
              </div>
            )}

            {activeNav === "Mantenimiento" && (
              <div className="tab-grid">
                <div className="tab-card">
                  <span>Estado general</span>
                  <strong>Excelente</strong>
                  <small>Vehículo listo para viaje</small>
                </div>
                <div className="tab-card">
                  <span>Neumáticos</span>
                  <strong>2.4 bar</strong>
                  <small>Revisión en 1,800 km</small>
                </div>
                <div className="tab-card">
                  <span>Siguiente servicio</span>
                  <strong>14 días</strong>
                  <small>Inspección general</small>
                </div>
              </div>
            )}
          </section>
        )}

      </main>

    </div>
  );
}

export default App;
const weatherDescriptions = {
  0: "Cielo despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla helada",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna intensa",
  56: "Llovizna helada ligera",
  57: "Llovizna helada intensa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  66: "Lluvia helada ligera",
  67: "Lluvia helada intensa",
  71: "Nevada ligera",
  73: "Nevada moderada",
  75: "Nevada intensa",
  77: "Granizo pequeño",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos intensos",
  85: "Chubascos de nieve ligeros",
  86: "Chubascos de nieve intensos",
  95: "Tormenta",
  96: "Tormenta con granizo ligero",
  99: "Tormenta con granizo intenso",
};

function iconForWeatherCode(code, isDay) {
  let icon;

  if (code === 0) icon = "01";
  else if (code === 1) icon = "02";
  else if (code === 2) icon = "03";
  else if (code === 3) icon = "04";
  else if (code === 45 || code === 48) icon = "50";
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    icon = "13";
  }
  else if (code >= 95) icon = "11";
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    icon = "09";
  }
  else icon = "01";

  return `${icon}${isDay ? "d" : "n"}`;
}

export function createOpenMeteoUrl(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,uv_index,is_day",
    timezone: "auto",
  }).toString();

  return url.toString();
}

export function normalizeOpenMeteoResponse(data) {
  const current = data?.current;
  const weatherCode = current?.weather_code;

  if (
    !current ||
    !Number.isFinite(current.temperature_2m) ||
    !Number.isFinite(current.relative_humidity_2m) ||
    !Number.isFinite(current.wind_speed_10m) ||
    !Number.isFinite(weatherCode)
  ) {
    throw new Error("La respuesta del clima no tiene el formato esperado.");
  }

  return {
    timezone: data.timezone || "Ubicación actual",
    current: {
      temp: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      wind_speed: current.wind_speed_10m / 3.6,
      uvi: Number.isFinite(current.uv_index) ? current.uv_index : null,
      weather: [
        {
          description:
            weatherDescriptions[weatherCode] || "Condiciones actuales",
          icon: iconForWeatherCode(weatherCode, current.is_day !== 0),
        },
      ],
    },
  };
}

export async function fetchCurrentWeather(latitude, longitude, fetchImpl = fetch) {
  const response = await fetchImpl(createOpenMeteoUrl(latitude, longitude));

  if (!response.ok) {
    throw new Error(`El servicio meteorológico respondió con HTTP ${response.status}.`);
  }

  return normalizeOpenMeteoResponse(await response.json());
}

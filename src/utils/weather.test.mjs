import assert from "node:assert/strict";
import { createOpenMeteoUrl, fetchCurrentWeather } from "./weather.js";

const url = new URL(createOpenMeteoUrl(19.4326, -99.1332));
assert.equal(url.hostname, "api.open-meteo.com");
assert.equal(url.searchParams.get("latitude"), "19.4326");
assert.equal(url.searchParams.get("longitude"), "-99.1332");
assert.match(url.searchParams.get("current"), /uv_index/);

const weather = await fetchCurrentWeather(19.4326, -99.1332, async () => ({
  ok: true,
  json: async () => ({
    timezone: "America/Mexico_City",
    current: {
      temperature_2m: 22.4,
      relative_humidity_2m: 48,
      wind_speed_10m: 18,
      weather_code: 2,
      uv_index: 5.2,
      is_day: 1,
    },
  }),
}));

assert.equal(weather.timezone, "America/Mexico_City");
assert.equal(weather.current.temp, 22.4);
assert.equal(weather.current.humidity, 48);
assert.equal(weather.current.wind_speed, 5);
assert.equal(weather.current.uvi, 5.2);
assert.equal(weather.current.weather[0].description, "Parcialmente nublado");
assert.equal(weather.current.weather[0].icon, "03d");

await assert.rejects(
  fetchCurrentWeather(0, 0, async () => ({ ok: false, status: 503 })),
  /HTTP 503/
);

console.log("weather logic ok");

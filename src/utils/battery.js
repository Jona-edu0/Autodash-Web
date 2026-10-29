// Mantiene cualquier porcentaje de batería dentro del rango válido de 0 a 100.
export function clampBattery(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// Calcula la carga restante restando el consumo correspondiente a los kilómetros.
export function batteryFromDistance(startBattery, distanceKm, kmPerFullBattery = 25) {
  return clampBattery(startBattery - (distanceKm / kmPerFullBattery) * 100);
}

// Suma o resta un ajuste y limita el resultado al rango permitido.
export function adjustBatteryValue(currentValue, delta) {
  const safeCurrent = Number.isFinite(currentValue) ? currentValue : 0;
  return clampBattery(safeCurrent + delta);
}

import { useEffect, useRef, useState } from "react";

// Calcula la distancia entre dos coordenadas GPS sobre la superficie terrestre.
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Encapsula el rastreo GPS y entrega datos para el velocímetro y el clima.
export function useVehicleGps() {
  // Valores observables de ubicación, velocidad, distancia y conexión GPS.
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [error, setError] = useState("");

  const watchIdRef = useRef(null);
  const lastPositionRef = useRef(null);

  // Detiene la observación del navegador y cambia el indicador a GPS detenido.
  const stopTracking = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setTracking(false);
  };

  // Solicita permiso al navegador y comienza a recibir posiciones GPS.
  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    setError("");
    setTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const nextPosition = {
          latitude: geoPosition.coords.latitude,
          longitude: geoPosition.coords.longitude,
        };

        setPosition(nextPosition);

        const nextSpeedKmh =
          geoPosition.coords.speed != null
            ? geoPosition.coords.speed * 3.6
            : 0;

        setSpeedKmh(nextSpeedKmh);

        // Acumula el tramo entre la posición anterior y la nueva.
        if (lastPositionRef.current) {
          const travelledKm = haversineDistanceKm(
            lastPositionRef.current.latitude,
            lastPositionRef.current.longitude,
            nextPosition.latitude,
            nextPosition.longitude
          );

          if (Number.isFinite(travelledKm) && travelledKm > 0) {
            setDistanceKm((currentDistance) => currentDistance + travelledKm);
          }
        }

        lastPositionRef.current = nextPosition;
      },
      (geoError) => {
        setError(geoError.message || "No se pudo obtener la ubicación.");
        setTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  // Reinicia el recorrido cuando se aplica un nuevo nivel inicial de batería.
  const resetDistance = () => {
    lastPositionRef.current = null;
    setDistanceKm(0);
  };

  // Limpia la vigilancia GPS al desmontar el componente que usa este hook.
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  return {
    tracking,
    position,
    speedKmh,
    distanceKm,
    error,
    startTracking,
    stopTracking,
    resetDistance,
  };
}

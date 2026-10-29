import { useId } from "react";

// Mezcla colores hexadecimales para crear tonos claros y oscuros del arco.
function mixHexColors(baseHex, targetHex, ratio) {
  const clamp = (value) => Math.min(255, Math.max(0, value));

  const toRgb = (hex) => {
    const safeHex = hex.replace("#", "");
    const normalized =
      safeHex.length === 3
        ? safeHex
            .split("")
            .map((char) => char + char)
            .join("")
        : safeHex;

    const number = Number.parseInt(normalized, 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
    };
  };

  const base = toRgb(baseHex);
  const target = toRgb(targetHex);

  const mixed = {
    r: clamp(Math.round(base.r + (target.r - base.r) * ratio)),
    g: clamp(Math.round(base.g + (target.g - base.g) * ratio)),
    b: clamp(Math.round(base.b + (target.b - base.b) * ratio)),
  };

  return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
}

// Dibuja el velocímetro SVG: pista, arco proporcional, marcas y lectura numérica.
export function DigitalSpeedGauge({ value = 0, max = 120, accent = "#7de0ff" }) {
  const gaugeId = useId().replace(/:/g, "");
  // Limita la velocidad al rango permitido y calcula cuánto del semicírculo iluminar.
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0;
  const safeAccent = /^#[0-9A-Fa-f]{3,6}$/.test(accent) ? accent : "#7de0ff";
  const accentSoft = mixHexColors(safeAccent, "#ffffff", 0.52);
  const accentDeep = mixHexColors(safeAccent, "#0a1921", 0.38);
  const arcLength = Math.PI * 106;
  const dash = (safeValue / max) * arcLength;

  return (
    <div
      className="digital-gauge"
      aria-label={`Velocidad ${Math.round(safeValue)} kilómetros por hora`}
      style={{
        "--gauge-accent": safeAccent,
        "--gauge-accent-soft": accentSoft,
      }}
    >
      <svg viewBox="0 0 320 220" className="digital-gauge-svg" role="img" aria-hidden="true">
        {/* Degradado que da profundidad y color al indicador de velocidad. */}
        <defs>
          <linearGradient id={`digitalGaugeGradient-${gaugeId}`} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor={accentDeep} />
            <stop offset="35%" stopColor={safeAccent} />
            <stop offset="100%" stopColor={accentSoft} />
          </linearGradient>
        </defs>

        {/* Semicírculo de fondo: representa el rango completo disponible. */}
        <path
          d="M 54 170 A 106 106 0 0 1 266 170"
          className="digital-gauge-track"
        />

        {/* Arco de avance: su longitud crece en proporción a los km/h actuales. */}
        <path
          d="M 54 170 A 106 106 0 0 1 266 170"
          className="digital-gauge-progress"
          stroke={`url(#digitalGaugeGradient-${gaugeId})`}
          style={{
            strokeDasharray: `${dash} ${arcLength}`,
            filter: `drop-shadow(0 0 16px ${safeAccent}AA)`,
          }}
        />

        {/* Marcas y números de referencia distribuidos entre 0 y 120 km/h. */}
        <g className="digital-gauge-ticks">
          {[0, 15, 30, 45, 60, 75, 90, 105, 120].map((tick) => {
            const angle = -180 + (tick / max) * 180;
            const radians = (angle * Math.PI) / 180;
            const x1 = 160 + Math.cos(radians) * 92;
            const y1 = 170 + Math.sin(radians) * 92;
            const x2 = 160 + Math.cos(radians) * 108;
            const y2 = 170 + Math.sin(radians) * 108;
            const labelX = 160 + Math.cos(radians) * 122;
            const labelY = 170 + Math.sin(radians) * 122;

            return (
              <g key={tick}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="digital-gauge-tick"
                  style={{ stroke: "var(--text-strong, #ffffff)" }}
                />
                {tick <= max && (
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    className="digital-gauge-label"
                    style={{ fill: "var(--text-strong, #ffffff)" }}
                  >
                    {tick}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Lectura central en cifras, sincronizada con la posición del arco. */}
      <div
        className="digital-gauge-readout"
        style={{
          borderColor: `${safeAccent}99`,
          boxShadow: `0 0 18px ${safeAccent}22, inset 0 0 14px ${safeAccent}1a`,
        }}
      >
        <strong style={{ color: "var(--text-strong, #ffffff)" }}>
          {Math.round(safeValue).toString()}
        </strong>
        <span style={{ color: safeAccent }}>KM/H</span>
      </div>
    </div>
  );
}

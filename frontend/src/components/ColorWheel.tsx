import { useRef, useCallback } from 'react';
import { SHADE_STEPS, hslToRgbString } from '../hooks/useSettings';

interface ColorWheelProps {
  hue: number;
  onPick: (hue: number) => void;
  size?: number;
}

// Anillos concéntricos, borde pálido (50) a centro oscuro (950) — igual que la
// estructura de una escala de Tailwind, para que cada anillo tenga "su ajuste y
// número CSS" visible de un vistazo.
export default function ColorWheel({ hue, onPick, size = 200 }: ColorWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const radius = size / 2;
  const ringWidth = radius / SHADE_STEPS.length;

  const pickFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      angle = (angle + 360) % 360;
      onPick(angle);
    },
    [onPick]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignora: algunos dispositivos/pointerIds sintéticos no soportan captura;
      // el pick por click sigue funcionando igual.
    }
    pickFromEvent(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    pickFromEvent(e.clientX, e.clientY);
  };

  const markerAngleRad = (hue * Math.PI) / 180;
  const markerRadius = radius - ringWidth * (SHADE_STEPS.length - 1.5); // sobre el anillo 600 aprox.
  const markerX = radius + markerRadius * Math.cos(markerAngleRad);
  const markerY = radius + markerRadius * Math.sin(markerAngleRad);

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className="relative cursor-crosshair select-none touch-none"
      style={{ width: size, height: size }}
    >
      {SHADE_STEPS.map((shade, i) => {
        const outer = radius - ringWidth * i;
        const inner = radius - ringWidth * (i + 1);
        const stops = Array.from({ length: 13 }, (_, k) => {
          const h = k * 30;
          return `rgb(${hslToRgbString(h, shade.s, shade.l)}) ${h}deg`;
        }).join(', ');
        return (
          <div
            key={shade.step}
            className="absolute top-0 left-0 rounded-full pointer-events-none"
            style={{
              width: size,
              height: size,
              background: `conic-gradient(from 0deg, ${stops})`,
              maskImage: `radial-gradient(circle, transparent ${inner}px, black ${inner}px, black ${outer}px, transparent ${outer}px)`,
              WebkitMaskImage: `radial-gradient(circle, transparent ${inner}px, black ${inner}px, black ${outer}px, transparent ${outer}px)`,
            }}
          />
        );
      })}
      {/* Marcador de matiz seleccionado */}
      <div
        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none"
        style={{
          left: markerX - 7,
          top: markerY - 7,
          backgroundColor: `rgb(${hslToRgbString(hue, 85, 45)})`,
        }}
      />
    </div>
  );
}

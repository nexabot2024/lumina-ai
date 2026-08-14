import { useState } from 'react';

/**
 * useState respaldado en localStorage — sobrevive a un refresco de página o a
 * cerrar/reabrir el navegador. Se usa para que el jobId de un trabajo largo
 * (Secuencia de Imágenes, Cola de Edición, Editor de Clips, Compilación) no se
 * pierda solo por recargar: al montar, si hay uno guardado, el componente
 * reconecta directo al EventSource de ese job en vez de arrancar de cero.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersisted = (next: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
      try {
        if (resolved === '' || resolved === null || resolved === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(resolved));
        }
      } catch {
        // localStorage lleno o no disponible (modo privado) — el estado en memoria sigue funcionando
      }
      return resolved;
    });
  };

  return [value, setPersisted] as const;
}

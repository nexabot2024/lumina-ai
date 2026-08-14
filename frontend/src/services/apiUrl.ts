/**
 * URL base del backend. Si se abrió la web desde localhost, apunta a localhost;
 * si se abrió desde otra máquina en la red (ej. un Mac accediendo por IP LAN),
 * apunta a esa misma IP, para que la petición vuelva a la máquina que sirve el backend
 * en vez de intentar conectarse a sí misma.
 */
export const API_URL =
  import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000`;

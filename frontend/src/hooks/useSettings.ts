import { useEffect, useState } from 'react';

export interface PaletteDef {
  key: string;
  label: string;
  swatch: string; // color-600 para mostrar en el selector
  scale: Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;
}

export const PALETTES: PaletteDef[] = [
  {
    key: 'violet',
    label: 'Violeta',
    swatch: '124 58 237',
    scale: {
      '50': '245 243 255', '100': '237 233 254', '200': '221 214 254', '300': '196 181 253',
      '400': '167 139 250', '500': '139 92 246', '600': '124 58 237', '700': '109 40 217',
      '800': '91 33 182', '900': '76 29 149', '950': '46 16 101',
    },
  },
  {
    key: 'blue',
    label: 'Azul',
    swatch: '37 99 235',
    scale: {
      '50': '239 246 255', '100': '219 234 254', '200': '191 219 254', '300': '147 197 253',
      '400': '96 165 250', '500': '59 130 246', '600': '37 99 235', '700': '29 78 216',
      '800': '30 64 175', '900': '30 58 138', '950': '23 37 84',
    },
  },
  {
    key: 'emerald',
    label: 'Esmeralda',
    swatch: '5 150 105',
    scale: {
      '50': '236 253 245', '100': '209 250 229', '200': '167 243 208', '300': '110 231 183',
      '400': '52 211 153', '500': '16 185 129', '600': '5 150 105', '700': '4 120 87',
      '800': '6 95 70', '900': '6 78 59', '950': '2 44 34',
    },
  },
  {
    key: 'rose',
    label: 'Rosa',
    swatch: '225 29 72',
    scale: {
      '50': '255 241 242', '100': '255 228 230', '200': '254 205 211', '300': '253 164 175',
      '400': '251 113 133', '500': '244 63 94', '600': '225 29 72', '700': '190 18 60',
      '800': '159 18 57', '900': '136 19 55', '950': '76 5 25',
    },
  },
  {
    key: 'amber',
    label: 'Ámbar',
    swatch: '217 119 6',
    scale: {
      '50': '255 251 235', '100': '254 243 199', '200': '253 230 138', '300': '252 211 77',
      '400': '251 191 36', '500': '245 158 11', '600': '217 119 6', '700': '180 83 9',
      '800': '146 64 14', '900': '120 53 15', '950': '69 26 3',
    },
  },
  {
    key: 'cyan',
    label: 'Cian',
    swatch: '8 145 178',
    scale: {
      '50': '236 254 255', '100': '207 250 254', '200': '165 243 252', '300': '103 232 249',
      '400': '34 211 238', '500': '6 182 212', '600': '8 145 178', '700': '14 116 144',
      '800': '21 94 117', '900': '22 78 99', '950': '8 51 68',
    },
  },
];

const DEFAULT_PALETTE = 'violet';
const DEFAULT_NAME = 'Lumina AI';
const DEFAULT_LOGO = '/logo.webp';
export const CUSTOM_PALETTE_KEY = 'custom';

export interface CardStyleDef {
  key: string;
  label: string;
  description: string;
}

export const CARD_STYLES: CardStyleDef[] = [
  { key: 'vibrant', label: 'Vibrante', description: 'Forma decorativa degradada + botones con brillo' },
  { key: 'tinted', label: 'Tintada', description: 'Fondo con el color de acento, sin borde ni sombra' },
  { key: 'bordered', label: 'Con borde', description: 'Blanco/oscuro plano con borde fino, más sobria' },
  { key: 'flat', label: 'Plana', description: 'Sin caja visible — solo tipografía y espacio' },
];

export interface FontDef {
  key: string;
  label: string;
  stack: string;
}

export const FONTS: FontDef[] = [
  { key: 'inter', label: 'Inter (por defecto)', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { key: 'sora', label: 'Sora', stack: "'Sora', ui-sans-serif, system-ui, sans-serif" },
  { key: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" },
  { key: 'lora', label: 'Lora (serif)', stack: "'Lora', ui-serif, Georgia, serif" },
];

const DEFAULT_CARD_STYLE = 'vibrant';
const DEFAULT_FONT = 'inter';

const KEYS = {
  name: 'lumina-settings-name',
  logo: 'lumina-settings-logo',
  palette: 'lumina-settings-palette',
  customHue: 'lumina-settings-custom-hue',
  cardStyle: 'lumina-settings-card-style',
  font: 'lumina-settings-font',
  cardBgImage: 'lumina-settings-card-bg-image',
  cardBgBlur: 'lumina-settings-card-bg-blur',
  hideSystemName: 'lumina-settings-hide-system-name',
  btn3dGlowHue: 'lumina-settings-btn-3d-glow-hue',
};

const DEFAULT_CARD_BG_BLUR = 0;

const DEFAULT_BTN_3D_GLOW_HUE = 262; // mismo tono que el violeta por defecto del acento

// Saturación/luminosidad por paso, calibrado para parecerse a las escalas de Tailwind
// (borde pálido = 50, centro oscuro = 950). Usado tanto por la rueda de color como
// para generar la rampa completa a partir de un solo matiz elegido por el usuario.
export const SHADE_STEPS: Array<{ step: string; s: number; l: number }> = [
  { step: '50', s: 40, l: 97 }, { step: '100', s: 55, l: 94 }, { step: '200', s: 65, l: 87 },
  { step: '300', s: 75, l: 77 }, { step: '400', s: 80, l: 66 }, { step: '500', s: 85, l: 55 },
  { step: '600', s: 85, l: 45 }, { step: '700', s: 80, l: 37 }, { step: '800', s: 75, l: 30 },
  { step: '900', s: 65, l: 24 }, { step: '950', s: 55, l: 15 },
];

export function hslToRgbString(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return `${r} ${g} ${b}`;
}

export function generateScaleFromHue(hue: number): PaletteDef['scale'] {
  const scale = {} as PaletteDef['scale'];
  SHADE_STEPS.forEach(({ step, s, l }) => {
    (scale as Record<string, string>)[step] = hslToRgbString(hue, s, l);
  });
  return scale;
}

function getStoredCustomHue(): number {
  const raw = localStorage.getItem(KEYS.customHue);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : 270;
}

export function applyPalette(key: string) {
  const scale =
    key === CUSTOM_PALETTE_KEY
      ? generateScaleFromHue(getStoredCustomHue())
      : (PALETTES.find(p => p.key === key) || PALETTES[0]).scale;
  const root = document.documentElement;
  (Object.keys(scale) as Array<keyof PaletteDef['scale']>).forEach(step => {
    root.style.setProperty(`--accent-${step}`, scale[step]);
  });
}

export function applyCardStyle(key: string) {
  document.documentElement.setAttribute('data-card-style', key);
}

export function applyFont(key: string) {
  const font = FONTS.find(f => f.key === key) || FONTS[0];
  document.documentElement.style.setProperty('--font-sans', font.stack);
}

export function applyCardBgImage(dataUrl: string | null) {
  document.documentElement.style.setProperty('--card-bg-image', dataUrl ? `url(${dataUrl})` : 'none');
  // Aparte de la variable, marca si hay imagen o no — el CSS solo genera la capa
  // ::before (imagen + velo) cuando este atributo está puesto; así, sin imagen elegida
  // (el caso de la enorme mayoría de tarjetas del sistema) no se pinta ninguna capa
  // extra encima del color de cada tarjeta, evitando el filo doble que dejaba antes.
  document.documentElement.toggleAttribute('data-card-bg-image', !!dataUrl);
}

export function applyCardBgBlur(px: number) {
  document.documentElement.style.setProperty('--card-bg-blur', `${px}px`);
}

export function applyBtn3dGlow(hue: number) {
  document.documentElement.style.setProperty('--btn-3d-glow-rgb', hslToRgbString(hue, 85, 55));
}

export function useSettings() {
  const [systemName, setSystemNameState] = useState(
    () => localStorage.getItem(KEYS.name) || DEFAULT_NAME
  );
  const [logoUrl, setLogoUrlState] = useState(
    () => localStorage.getItem(KEYS.logo) || DEFAULT_LOGO
  );
  const [paletteKey, setPaletteKeyState] = useState(
    () => localStorage.getItem(KEYS.palette) || DEFAULT_PALETTE
  );
  const [customHue, setCustomHueState] = useState(getStoredCustomHue);
  const [cardStyle, setCardStyleState] = useState(
    () => localStorage.getItem(KEYS.cardStyle) || DEFAULT_CARD_STYLE
  );
  const [fontKey, setFontKeyState] = useState(
    () => localStorage.getItem(KEYS.font) || DEFAULT_FONT
  );
  const [cardBgImage, setCardBgImageState] = useState<string | null>(
    () => localStorage.getItem(KEYS.cardBgImage)
  );
  const [cardBgBlur, setCardBgBlurState] = useState(() => {
    const raw = localStorage.getItem(KEYS.cardBgBlur);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_CARD_BG_BLUR;
  });
  const [hideSystemName, setHideSystemNameState] = useState(
    () => localStorage.getItem(KEYS.hideSystemName) === 'true'
  );
  const [btn3dGlowHue, setBtn3dGlowHueState] = useState(() => {
    const raw = localStorage.getItem(KEYS.btn3dGlowHue);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_BTN_3D_GLOW_HUE;
  });

  useEffect(() => {
    applyPalette(paletteKey);
  }, [paletteKey, customHue]);

  useEffect(() => {
    document.title = systemName;
  }, [systemName]);

  useEffect(() => {
    applyCardStyle(cardStyle);
  }, [cardStyle]);

  useEffect(() => {
    applyFont(fontKey);
  }, [fontKey]);

  useEffect(() => {
    applyCardBgImage(cardBgImage);
  }, [cardBgImage]);

  useEffect(() => {
    applyCardBgBlur(cardBgBlur);
  }, [cardBgBlur]);

  useEffect(() => {
    applyBtn3dGlow(btn3dGlowHue);
  }, [btn3dGlowHue]);

  const setSystemName = (name: string) => {
    const value = name.trim() || DEFAULT_NAME;
    setSystemNameState(value);
    localStorage.setItem(KEYS.name, value);
  };

  const setLogoUrl = (url: string) => {
    const value = url || DEFAULT_LOGO;
    setLogoUrlState(value);
    localStorage.setItem(KEYS.logo, value);
  };

  const setPaletteKey = (key: string) => {
    setPaletteKeyState(key);
    localStorage.setItem(KEYS.palette, key);
  };

  const setCustomHue = (hue: number) => {
    const value = ((Math.round(hue) % 360) + 360) % 360;
    setCustomHueState(value);
    localStorage.setItem(KEYS.customHue, String(value));
    setPaletteKey(CUSTOM_PALETTE_KEY);
  };

  const setCardStyle = (key: string) => {
    setCardStyleState(key);
    localStorage.setItem(KEYS.cardStyle, key);
  };

  const setFontKey = (key: string) => {
    setFontKeyState(key);
    localStorage.setItem(KEYS.font, key);
  };

  const setCardBgImage = (dataUrl: string | null) => {
    setCardBgImageState(dataUrl);
    if (dataUrl) {
      localStorage.setItem(KEYS.cardBgImage, dataUrl);
    } else {
      localStorage.removeItem(KEYS.cardBgImage);
    }
  };

  const setCardBgBlur = (px: number) => {
    const value = Math.max(0, Math.min(20, Math.round(px)));
    setCardBgBlurState(value);
    localStorage.setItem(KEYS.cardBgBlur, String(value));
  };

  const setHideSystemName = (hide: boolean) => {
    setHideSystemNameState(hide);
    localStorage.setItem(KEYS.hideSystemName, String(hide));
  };

  const setBtn3dGlowHue = (hue: number) => {
    const value = ((Math.round(hue) % 360) + 360) % 360;
    setBtn3dGlowHueState(value);
    localStorage.setItem(KEYS.btn3dGlowHue, String(value));
  };

  const resetSettings = () => {
    localStorage.removeItem(KEYS.name);
    localStorage.removeItem(KEYS.logo);
    localStorage.removeItem(KEYS.palette);
    localStorage.removeItem(KEYS.customHue);
    localStorage.removeItem(KEYS.cardStyle);
    localStorage.removeItem(KEYS.font);
    localStorage.removeItem(KEYS.cardBgImage);
    localStorage.removeItem(KEYS.cardBgBlur);
    localStorage.removeItem(KEYS.hideSystemName);
    localStorage.removeItem(KEYS.btn3dGlowHue);
    setSystemNameState(DEFAULT_NAME);
    setLogoUrlState(DEFAULT_LOGO);
    setPaletteKeyState(DEFAULT_PALETTE);
    setCustomHueState(270);
    setCardStyleState(DEFAULT_CARD_STYLE);
    setFontKeyState(DEFAULT_FONT);
    setCardBgImageState(null);
    setCardBgBlurState(DEFAULT_CARD_BG_BLUR);
    setHideSystemNameState(false);
    setBtn3dGlowHueState(DEFAULT_BTN_3D_GLOW_HUE);
  };

  return {
    systemName, setSystemName,
    logoUrl, setLogoUrl,
    paletteKey, setPaletteKey,
    customHue, setCustomHue,
    cardStyle, setCardStyle,
    fontKey, setFontKey,
    cardBgImage, setCardBgImage,
    cardBgBlur, setCardBgBlur,
    hideSystemName, setHideSystemName,
    btn3dGlowHue, setBtn3dGlowHue,
    resetSettings,
  };
}

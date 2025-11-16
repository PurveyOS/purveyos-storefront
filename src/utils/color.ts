export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function adjustColor(hex: string, lightness: number, saturation?: number): string {
  const hsl = hexToHsl(hex);
  const newL = Math.max(0, Math.min(100, hsl.l + lightness));
  const newS = saturation !== undefined ? saturation : hsl.s;
  
  return `hsl(${hsl.h}, ${newS}%, ${newL}%)`;
}

export function generateColorVariants(primaryColor: string, accentColor: string) {
  return {
    primary: primaryColor,
    primaryLight: adjustColor(primaryColor, 10),
    primaryDark: adjustColor(primaryColor, -20),
    accent: accentColor,
    accentLight: adjustColor(accentColor, 10),
    accentDark: adjustColor(accentColor, -20),
  };
}
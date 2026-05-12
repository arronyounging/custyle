import { Vibrant } from 'node-vibrant/node';
import type { VibrantResult, VibrantSwatch } from './types.js';

function toSwatch(swatch: any, name: string): VibrantSwatch | null {
  if (!swatch) return null;
  return {
    hex: swatch.hex,
    rgb: swatch.rgb as [number, number, number],
    population: swatch.population,
    name,
  };
}

export async function extractColors(imageBuffer: Buffer): Promise<VibrantResult> {
  try {
    const palette = await Vibrant.from(imageBuffer).getPalette();
    return {
      vibrant: toSwatch(palette.Vibrant, 'Vibrant'),
      muted: toSwatch(palette.Muted, 'Muted'),
      darkVibrant: toSwatch(palette.DarkVibrant, 'Dark Vibrant'),
      darkMuted: toSwatch(palette.DarkMuted, 'Dark Muted'),
      lightVibrant: toSwatch(palette.LightVibrant, 'Light Vibrant'),
      lightMuted: toSwatch(palette.LightMuted, 'Light Muted'),
    };
  } catch (err) {
    console.error('node-vibrant extraction failed:', err);
    return {
      vibrant: null, muted: null, darkVibrant: null,
      darkMuted: null, lightVibrant: null, lightMuted: null,
    };
  }
}

export function vibrantToColorList(result: VibrantResult): Array<{ hex: string; name: string; population: number }> {
  return Object.values(result)
    .filter((s): s is VibrantSwatch => s !== null)
    .sort((a, b) => b.population - a.population);
}

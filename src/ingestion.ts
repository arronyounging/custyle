import type { DeterministicSignals } from './types.js';

const TIMEOUT_MS = 8000;

export async function fetchUrlMetadata(url: string): Promise<DeterministicSignals> {
  const empty: DeterministicSignals = {
    title: '', metaDescription: '', ogTitle: '', ogDescription: '',
    ogImage: '', themeColor: '', favicon: '',
    cssVariables: {}, fontFaceDeclarations: [], googleFontsLinks: [],
    h1Texts: [], visibleTextSample: '', navItems: [], ctaTexts: [],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CustyleBrandLens/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return empty;

    const html = await res.text();
    return parseHtml(html, url);
  } catch (err) {
    console.error('URL fetch failed:', (err as Error).message);
    return empty;
  }
}

function parseHtml(html: string, baseUrl: string): DeterministicSignals {
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*?)["']`, 'i');
    const alt = new RegExp(`content=["']([^"']*?)["'][^>]+(?:name|property)=["']${name}["']`, 'i');
    return re.exec(html)?.[1] ?? alt.exec(html)?.[1] ?? '';
  };

  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const themeColor = meta('theme-color');
  const ogImage = meta('og:image');

  // CSS variables from :root
  const cssVariables: Record<string, string> = {};
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/g);
  if (rootMatch) {
    for (const block of rootMatch) {
      const vars = block.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g);
      for (const v of vars) {
        const name = v[1].trim();
        const value = v[2].trim();
        if (name.includes('color') || name.includes('bg') || name.includes('font') ||
            value.startsWith('#') || value.startsWith('rgb')) {
          cssVariables[`--${name}`] = value;
        }
      }
    }
  }

  // Font faces
  const fontFaceDeclarations: string[] = [];
  const fontFaces = html.matchAll(/font-family\s*:\s*["']?([^"';}\n]+)/gi);
  for (const m of fontFaces) {
    const family = m[1].trim().replace(/["']/g, '');
    if (family && !fontFaceDeclarations.includes(family)) {
      fontFaceDeclarations.push(family);
    }
  }

  // Google Fonts
  const googleFontsLinks: string[] = [];
  const gfLinks = html.matchAll(/href=["'](https:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/g);
  for (const m of gfLinks) googleFontsLinks.push(m[1]);

  // H1 texts
  const h1Texts: string[] = [];
  const h1s = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const m of h1s) h1Texts.push(stripTags(m[1]).trim());

  // Visible text sample
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const visibleTextSample = bodyMatch
    ? stripTags(bodyMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 1500)
    : '';

  // Nav items
  const navItems: string[] = [];
  const navMatch = /<nav[^>]*>([\s\S]*?)<\/nav>/gi;
  for (const nm of html.matchAll(navMatch)) {
    const links = nm[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi);
    for (const l of links) {
      const text = l[1].trim();
      if (text.length > 1 && text.length < 30) navItems.push(text);
    }
  }

  // CTA texts
  const ctaTexts: string[] = [];
  const buttons = html.matchAll(/<(?:button|a)[^>]*class="[^"]*(?:btn|cta|button|primary)[^"]*"[^>]*>([^<]+)/gi);
  for (const b of buttons) {
    const text = b[1].trim();
    if (text.length > 1 && text.length < 40) ctaTexts.push(text);
  }

  // Favicon
  const faviconMatch = /href=["']([^"']*?(?:favicon|icon)[^"']*?)["']/i.exec(html);
  let favicon = faviconMatch?.[1] ?? '';
  if (favicon && !favicon.startsWith('http')) {
    try { favicon = new URL(favicon, baseUrl).href; } catch { /* noop */ }
  }

  return {
    title,
    metaDescription: meta('description'),
    ogTitle: meta('og:title'),
    ogDescription: meta('og:description'),
    ogImage,
    themeColor,
    favicon,
    cssVariables,
    fontFaceDeclarations: fontFaceDeclarations.slice(0, 10),
    googleFontsLinks: googleFontsLinks.slice(0, 5),
    h1Texts: h1Texts.slice(0, 5),
    visibleTextSample,
    navItems: navItems.slice(0, 15),
    ctaTexts: ctaTexts.slice(0, 10),
  };
}

function stripTags(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

export async function downloadOgImage(ogImageUrl: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(ogImageUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

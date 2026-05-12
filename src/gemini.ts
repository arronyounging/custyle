import { GoogleGenAI } from '@google/genai';
import {
  VISUAL_EXTRACTION_PROMPT, BRAND_SYNTHESIS_PROMPT, CONCEPT_NARRATIVE_PROMPT,
  VISUAL_EXTRACTION_SCHEMA, BRAND_SYNTHESIS_SCHEMA, CONCEPT_NARRATIVE_SCHEMA,
} from './prompts.js';
import type {
  DeterministicSignals, VisualExtractionOutput, BrandSynthesisOutput,
  ConceptSeed, MerchConcept, VibrantSwatch,
} from './types.js';

let genai: GoogleGenAI;

export function initGemini() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is required');
  genai = new GoogleGenAI({ apiKey });
}

// ── Call 1: Visual Extraction (Flash-Lite) ──

export async function callVisualExtraction(
  signals: DeterministicSignals,
  colorSwatches: Array<{ hex: string; name: string }>,
  opts: { imageBase64?: string; imageMimeType?: string; url?: string },
): Promise<VisualExtractionOutput> {
  const deterministicJson = JSON.stringify({
    cssVariables: signals.cssVariables,
    themeColor: signals.themeColor,
    fontFaceDeclarations: signals.fontFaceDeclarations,
    googleFontsLinks: signals.googleFontsLinks,
    colorCluster: colorSwatches,
  }, null, 2);

  const userText = `Analyze the brand visual signals.

ownershipState: style_reference

Deterministic signals (GROUND TRUTH — do not override):
${deterministicJson}`;

  const parts: any[] = [];

  // Images first, then text (Gemini multimodal best practice)
  if (opts.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: opts.imageMimeType ?? 'image/png',
        data: opts.imageBase64,
      },
    });
  }

  parts.push({ text: userText });

  const config: any = {
    responseMimeType: 'application/json',
    responseSchema: VISUAL_EXTRACTION_SCHEMA,
  };

  // If URL provided, use Gemini URL Context
  if (opts.url) {
    config.tools = [{ urlContext: {} }];
  }

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      ...(opts.url ? [{ role: 'user' as const, parts: [{ text: `Analyze the brand at: ${opts.url}` }] }] : []),
      { role: 'user' as const, parts },
    ],
    config: {
      systemInstruction: VISUAL_EXTRACTION_PROMPT,
      ...config,
    },
  });

  return JSON.parse(response.text ?? '{}') as VisualExtractionOutput;
}

// ── Call 2: Brand Synthesis (Flash) ──

export async function callBrandSynthesis(
  signals: DeterministicSignals,
  colorSummary: string[],
  fontCategory: string,
  visualMotifs: string[],
): Promise<BrandSynthesisOutput> {
  const userText = `Compile brand essence, voice, context, and risk assessment.

ownershipState: style_reference

Text signals:
- title: ${signals.title}
- metaDescription: ${signals.metaDescription}
- ogTitle: ${signals.ogTitle}
- ogDescription: ${signals.ogDescription}
- h1Text: ${signals.h1Texts.join(', ')}
- visibleText (truncated): ${signals.visibleTextSample.slice(0, 800)}
- navItems: ${signals.navItems.join(', ')}
- ctaTexts: ${signals.ctaTexts.join(', ')}

Visual signal summary:
- dominantColors: ${colorSummary.join(', ')}
- fontCategory: ${fontCategory}
- visualMotifs: ${visualMotifs.join(', ')}`;

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user' as const, parts: [{ text: userText }] }],
    config: {
      systemInstruction: BRAND_SYNTHESIS_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: BRAND_SYNTHESIS_SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  });

  return JSON.parse(response.text ?? '{}') as BrandSynthesisOutput;
}

// ── Call 3: Concept Narrative (Flash-Lite) ──

export async function callConceptNarrative(
  seeds: ConceptSeed[],
  essenceSummary: string,
  visualMotifs: string[],
  tone: string[],
): Promise<MerchConcept[]> {
  const userText = `Write narratives for these 4 concept seeds.

Brand essence summary: ${essenceSummary}
Brand visual motifs: ${visualMotifs.join(', ')}
Brand tone: ${tone.join(', ')}
ownershipState: style_reference

Concept seeds:
${JSON.stringify(seeds, null, 2)}`;

  const response = await genai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user' as const, parts: [{ text: userText }] }],
    config: {
      systemInstruction: CONCEPT_NARRATIVE_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: CONCEPT_NARRATIVE_SCHEMA,
      temperature: 0.7,
    },
  });

  const parsed = JSON.parse(response.text ?? '{"concepts":[]}');
  const concepts: MerchConcept[] = parsed.concepts.map((c: any, i: number) => ({
    ...c,
    category: seeds[i]?.category ?? 'T_SHIRT',
    baseColor: seeds[i]?.baseColor ?? '#000000',
    baseColorName: seeds[i]?.baseColorName ?? 'Black',
    placement: seeds[i]?.placement ?? 'center_chest',
  }));

  return concepts;
}

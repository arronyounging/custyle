import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Response } from 'express';
import type { SSEEvent, BrandLensInput, ColorToken } from './types.js';
import { initGemini, callVisualExtraction, callBrandSynthesis, callConceptNarrative } from './gemini.js';
import { fetchUrlMetadata, downloadOgImage } from './ingestion.js';
import { extractColors, vibrantToColorList } from './color-extract.js';
import { matchArchetype, scoreCategoryFit, generateConceptSeeds, ARCHETYPE_LABELS } from './merch-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const PORT = parseInt(process.env.PORT ?? '3457', 10);

// Init Gemini
initGemini();

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ── SSE Helper ──

function sendSSE(res: Response, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function initSSE(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

// ── Pipeline ──

async function runPipeline(input: BrandLensInput, res: Response) {
  try {
    sendSSE(res, { phase: 'start', message: 'Checking the source...' });

    // Stage 1: Ingestion
    let signals = {
      title: '', metaDescription: '', ogTitle: '', ogDescription: '',
      ogImage: '', themeColor: '', favicon: '',
      cssVariables: {} as Record<string, string>,
      fontFaceDeclarations: [] as string[], googleFontsLinks: [] as string[],
      h1Texts: [] as string[], visibleTextSample: '', navItems: [] as string[], ctaTexts: [] as string[],
    };

    let imageBuffer: Buffer | null = null;
    let imageMimeType = 'image/png';

    if (input.type === 'url' && input.url) {
      signals = await fetchUrlMetadata(input.url);
      sendSSE(res, {
        phase: 'metadata',
        message: 'Reading visible brand signals...',
        data: { title: signals.title, description: signals.metaDescription || signals.ogDescription },
      });

      // Try to download OG image for color extraction
      if (signals.ogImage) {
        imageBuffer = await downloadOgImage(signals.ogImage);
      }
    } else if (input.type === 'image' && input.imageBuffer) {
      imageBuffer = input.imageBuffer;
      imageMimeType = input.imageMimeType ?? 'image/png';
    }

    // Stage 2: Color extraction (node-vibrant) — the magic moment
    let colorSwatches: Array<{ hex: string; name: string; population: number }> = [];
    if (imageBuffer) {
      const vibrantResult = await extractColors(imageBuffer);
      colorSwatches = vibrantToColorList(vibrantResult);
    }

    // Also include CSS theme-color if available
    if (signals.themeColor) {
      colorSwatches.unshift({ hex: signals.themeColor, name: 'Theme Color', population: 999999 });
    }

    // Include CSS variable colors
    for (const [key, value] of Object.entries(signals.cssVariables)) {
      if (value.startsWith('#') && value.length <= 9) {
        colorSwatches.push({ hex: value, name: key, population: 500000 });
      }
    }

    if (colorSwatches.length > 0) {
      sendSSE(res, {
        phase: 'colors',
        message: 'Found dominant colors...',
        data: { swatches: colorSwatches.slice(0, 8) },
      });
    }

    // Stage 3: Gemini calls (parallel when possible)
    sendSSE(res, { phase: 'start', message: 'Analyzing brand signals with AI...' });

    const imageBase64 = imageBuffer?.toString('base64');

    // Call 1 + Call 2 in parallel
    const [visualOutput, synthesisOutput] = await Promise.all([
      callVisualExtraction(
        signals,
        colorSwatches.map(s => ({ hex: s.hex, name: s.name })),
        { imageBase64, imageMimeType, url: input.url },
      ),
      callBrandSynthesis(
        signals,
        colorSwatches.map(s => s.hex),
        signals.fontFaceDeclarations[0] ?? 'unknown',
        [], // visual motifs not available yet, will use empty
      ),
    ]);

    // Emit visual results
    sendSSE(res, {
      phase: 'visual',
      message: 'Found typography and visual patterns...',
      data: {
        typography: visualOutput.typographySystem,
        imagery: visualOutput.imageryStyle,
        motifs: visualOutput.visualMotifs,
        layout: visualOutput.layoutComposition,
        texture: visualOutput.textureMaterialLanguage,
        logo: visualOutput.logoDetection,
        printNotes: visualOutput.printSuitabilityNotes,
        fullColorSystem: visualOutput.colorSystem,
      },
    });

    // Emit personality & risk
    sendSSE(res, {
      phase: 'personality',
      message: 'Understanding brand personality...',
      data: {
        essence: synthesisOutput.essence,
        risk: synthesisOutput.riskAssessment,
      },
    });

    // Emit voice
    sendSSE(res, {
      phase: 'voice',
      message: 'Analyzing brand voice...',
      data: {
        voice: synthesisOutput.voice,
        context: synthesisOutput.context,
      },
    });

    // Stage 4: Merch Rule Engine
    const archetype = matchArchetype(synthesisOutput.essence.personalityAxes);
    const categoryFit = scoreCategoryFit(archetype);

    // Gather all colors from visual extraction
    const allColors: ColorToken[] = [
      ...(visualOutput.colorSystem.primary ?? []),
      ...(visualOutput.colorSystem.secondary ?? []),
      ...(visualOutput.colorSystem.accent ?? []),
    ];

    const conceptSeeds = generateConceptSeeds(archetype, allColors, categoryFit);

    // Stage 5: Concept narratives (Call 3)
    sendSSE(res, { phase: 'start', message: 'Creating merch concept directions...' });

    const concepts = await callConceptNarrative(
      conceptSeeds,
      synthesisOutput.essence.positioningSummary,
      visualOutput.visualMotifs,
      synthesisOutput.voice.tone,
    );

    sendSSE(res, {
      phase: 'concepts',
      message: 'Here are your merch directions.',
      data: {
        archetype,
        archetypeLabel: ARCHETYPE_LABELS[archetype],
        categoryFit: categoryFit.slice(0, 6),
        concepts,
      },
    });

    // Final complete event
    sendSSE(res, {
      phase: 'complete',
      data: {
        brandKit: {
          essence: synthesisOutput.essence,
          expression: visualOutput,
          voice: synthesisOutput.voice,
          context: synthesisOutput.context,
          risk: synthesisOutput.riskAssessment,
          archetype,
          categoryFit,
          concepts,
        },
      },
    });

  } catch (err) {
    console.error('Pipeline error:', err);
    sendSSE(res, {
      phase: 'error',
      message: `Analysis failed: ${(err as Error).message}`,
    });
  } finally {
    res.end();
  }
}

// ── Routes ──

// URL mode (GET with SSE)
app.get('/api/brand-lens/stream', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'url query parameter is required' });
    return;
  }

  initSSE(res);

  req.on('close', () => { /* client disconnected */ });

  await runPipeline({ type: 'url', url }, res);
});

// Image mode (POST with SSE)
app.post('/api/brand-lens/stream', upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'image file is required' });
    return;
  }

  initSSE(res);

  req.on('close', () => { /* client disconnected */ });

  await runPipeline({
    type: 'image',
    imageBuffer: file.buffer,
    imageMimeType: file.mimetype,
  }, res);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'brand-lens-demo' });
});

// Start
app.listen(PORT, () => {
  console.log(`\n  Brand Lens Demo running at http://localhost:${PORT}\n`);
});

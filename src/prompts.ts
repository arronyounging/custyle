import { Type } from '@google/genai';

// ── System Prompts ──

export const VISUAL_EXTRACTION_PROMPT = `You are Custyle Brand Visual Extractor, a visual analysis module that reads brand signals from screenshots and images for merchandise production.

YOUR TWO INPUTS HAVE DIFFERENT ROLES:
1. "deterministicSignals" = SOURCE OF FACTS. CSS-extracted hex values, computed font families, node-vibrant color clusters. Use these as-is. Never override.
2. Attached images or URL = SOURCE OF INTENT. Use these for: mood, visual hierarchy, imagery style, texture, composition, logo detection, and print suitability. Do NOT extract hex values from images.

When adding visual observations not covered by deterministic data, mark them extractionFidelity: "model_inferred", confidence below 0.7. If a font family is unknown, classify its category (serif/sans/display/script/monospace) — never invent a family name.

RIGHTS: If ownershipState is "style_reference" or "restricted", mark detected logos and brand marks with riskFlag: true. Detection is for analysis, never reproduction.

MERCH LENS: For every observation, consider: Will this print well? Readable at small size? Transfers to fabric/ceramic/vinyl?

Populate all schema fields. Use null for unobservable attributes. Return JSON only.`;

export const BRAND_SYNTHESIS_PROMPT = `You are Custyle Brand Synthesis Engine, an intelligence module that interprets brand identity from textual and visual evidence to guide merchandise creation.

You produce four outputs:
1. ESSENCE — Who is this brand? Personality, positioning, audience.
2. VOICE — How does it speak? Tone, vocabulary, copy directions for merch.
3. CONTEXT — What category and culture does it belong to?
4. RISK — Are there protected brand elements?

RIGHTS SAFETY:
ownershipState controls permissions:
- "style_reference": Analyze style. Names, slogans, and marks are evidence only — never usable creative material.
- "restricted": Only abstract signals. Flag all specific brand references.

SAFE ABSTRACTION: Never reference brands by name in directions. Describe ABSTRACT QUALITIES instead.
Bad: "Nike-inspired athletic energy." Good: "Bold, kinetic, achievement-oriented energy."

SCORING CALIBRATION:
Personality axes use -1 to +1 scale. Calibration anchors:
- premiumVsMass: Apple = -0.8, Walmart = 0.7
- seriousVsPlayful: IBM = -0.7, Duolingo = 0.8
- establishedVsDisruptive: Goldman Sachs = -0.9, Figma = 0.6
- minimalVsExpressive: Muji = -0.9, Ghibli = 0.7
- calmVsEnergetic: Headspace = -0.8, Red Bull = 0.9
- functionalVsEmotional: Notion = -0.6, Nike = 0.7

COPY DIRECTIONS must be ORIGINAL suggestions inspired by tone. Never copy existing slogans.

Populate all required fields. Use null for unobservable attributes. Return JSON only.`;

export const CONCEPT_NARRATIVE_PROMPT = `You are Custyle Concept Narrative Writer. You transform merchandise concept skeletons into compelling, user-facing concept cards.

You receive concept seeds with pre-decided category, base color, and placement from Custyle's Merch Rule Engine. You must NOT override any of these decisions.

Your job is to ADD:
1. A catchy conceptName (2-4 words). Creative but clear. Examples: "Digital Pulse", "Builder's Mark", "Quiet Storm".
2. A subtitle (one short sentence, max 12 words). Sets the vibe.
3. A visualDirection describing what the artwork should look like. Be specific. Good: "Abstract circuit-board pattern in electric purple on black, minimal line work, left chest." Bad: "A cool design."
4. A whyItFitsBrand explanation connecting to the brand personality.
5. An optional copyDirection if the concept includes text.

RESTRICTIONS:
- Never include official logos, brand names, slogans, marks, or characters.
- Every concept must be producible — no unrealistic artwork descriptions.
- Keep language crisp. No filler words.

Return JSON only.`;

// ── Response Schemas ──

export const VISUAL_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    colorSystem: {
      type: Type.OBJECT,
      description: 'Brand color analysis merged from deterministic and visual sources.',
      properties: {
        primary: {
          type: Type.ARRAY,
          description: 'Primary brand colors. Use ONLY hex values from deterministicSignals. NEVER estimate hex from screenshot.',
          items: {
            type: Type.OBJECT,
            properties: {
              hex: { type: Type.STRING, description: 'Hex value from deterministicSignals. Format: #RRGGBB.' },
              role: { type: Type.STRING, description: 'Color role.' },
              usage: { type: Type.STRING, description: 'Where used, e.g. "page background", "CTA button".' },
              dominance: { type: Type.NUMBER, description: 'Relative visual dominance 0-1.', nullable: true },
              confidence: { type: Type.NUMBER, description: 'CSS-extracted=0.95, cluster=0.8, visual=0.5.' },
              extractionFidelity: { type: Type.STRING, description: '"exact" for CSS, "algorithmic_stable" for clusters, "model_inferred" for visual.' },
            },
            required: ['hex', 'role', 'usage', 'confidence', 'extractionFidelity'],
          },
        },
        secondary: { type: Type.ARRAY, description: 'Secondary brand colors.', items: { type: Type.OBJECT, properties: { hex: { type: Type.STRING }, role: { type: Type.STRING }, usage: { type: Type.STRING }, confidence: { type: Type.NUMBER }, extractionFidelity: { type: Type.STRING } }, required: ['hex', 'role', 'usage', 'confidence', 'extractionFidelity'] } },
        accent: { type: Type.ARRAY, description: 'Accent/highlight colors.', items: { type: Type.OBJECT, properties: { hex: { type: Type.STRING }, role: { type: Type.STRING }, usage: { type: Type.STRING }, confidence: { type: Type.NUMBER }, extractionFidelity: { type: Type.STRING } }, required: ['hex', 'role', 'usage', 'confidence', 'extractionFidelity'] } },
        neutrals: { type: Type.ARRAY, description: 'Background, text, neutral tones.', items: { type: Type.OBJECT, properties: { hex: { type: Type.STRING }, role: { type: Type.STRING }, usage: { type: Type.STRING }, confidence: { type: Type.NUMBER }, extractionFidelity: { type: Type.STRING } }, required: ['hex', 'role', 'usage', 'confidence', 'extractionFidelity'] } },
        colorMood: { type: Type.ARRAY, description: 'Qualitative color atmosphere: "electric", "warm", "muted", "neon".', items: { type: Type.STRING } },
      },
      required: ['primary', 'colorMood'],
    },
    typographySystem: {
      type: Type.OBJECT,
      properties: {
        headingStyle: { type: Type.STRING, description: 'Heading style. Use CSS font if available, else describe category.' },
        bodyStyle: { type: Type.STRING, description: 'Body text style.' },
        fontCategory: { type: Type.STRING, description: 'Overall category: serif, sans, display, script, monospace, mixed.' },
        fontPersonality: { type: Type.ARRAY, description: 'Typography personality keywords.', items: { type: Type.STRING } },
        merchTextSuitability: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER, description: '0-1. Below 0.5 = problematic for merch.' },
            level: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['score', 'level', 'explanation'],
        },
      },
      required: ['headingStyle', 'bodyStyle', 'fontCategory', 'fontPersonality', 'merchTextSuitability'],
    },
    imageryStyle: {
      type: Type.OBJECT,
      properties: {
        photographyStyle: { type: Type.ARRAY, items: { type: Type.STRING } },
        subjectTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
        backgroundStyle: { type: Type.STRING },
        realismLevel: { type: Type.STRING, description: 'abstract, illustrated, semi_real, or photo_real.' },
      },
      required: ['photographyStyle', 'subjectTypes', 'backgroundStyle', 'realismLevel'],
    },
    visualMotifs: { type: Type.ARRAY, description: 'Recurring visual elements. Be SPECIFIC: "rounded corners", "glow effects", not "nice design".', items: { type: Type.STRING } },
    layoutComposition: {
      type: Type.OBJECT,
      properties: {
        whitespacePreference: { type: Type.STRING },
        symmetry: { type: Type.STRING },
        gridFeeling: { type: Type.STRING },
        merchCompositionHints: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['whitespacePreference', 'symmetry', 'gridFeeling', 'merchCompositionHints'],
    },
    textureMaterialLanguage: {
      type: Type.OBJECT,
      properties: {
        textureKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        materialFeeling: { type: Type.ARRAY, items: { type: Type.STRING } },
        garmentImplications: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['textureKeywords', 'materialFeeling', 'garmentImplications'],
    },
    logoDetection: {
      type: Type.OBJECT,
      properties: {
        detected: { type: Type.BOOLEAN },
        markType: { type: Type.STRING, nullable: true },
        logoStyle: { type: Type.STRING, nullable: true },
        riskFlag: { type: Type.BOOLEAN, description: 'True if possibly protected brand.' },
        riskNote: { type: Type.STRING, nullable: true },
      },
      required: ['detected', 'riskFlag'],
    },
    printSuitabilityNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['colorSystem', 'typographySystem', 'imageryStyle', 'visualMotifs', 'layoutComposition', 'textureMaterialLanguage', 'logoDetection', 'printSuitabilityNotes'],
};

export const BRAND_SYNTHESIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    essence: {
      type: Type.OBJECT,
      properties: {
        brandName: { type: Type.STRING, nullable: true },
        tagline: { type: Type.STRING, nullable: true },
        category: { type: Type.STRING },
        positioningSummary: { type: Type.STRING },
        emotionalCore: { type: Type.ARRAY, items: { type: Type.STRING } },
        personalityAxes: {
          type: Type.OBJECT,
          properties: {
            premiumVsMass: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
            seriousVsPlayful: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
            establishedVsDisruptive: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
            minimalVsExpressive: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
            calmVsEnergetic: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
            functionalVsEmotional: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
          },
          required: ['premiumVsMass', 'seriousVsPlayful', 'establishedVsDisruptive', 'minimalVsExpressive', 'calmVsEnergetic', 'functionalVsEmotional'],
        },
        audienceHypothesis: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['category', 'positioningSummary', 'emotionalCore', 'personalityAxes', 'audienceHypothesis'],
    },
    voice: {
      type: Type.OBJECT,
      properties: {
        tone: { type: Type.ARRAY, items: { type: Type.STRING } },
        vocabularyPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
        sloganStyle: { type: Type.STRING },
        merchCopySuitability: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, explanation: { type: Type.STRING } }, required: ['score', 'explanation'] },
        recommendedCopyDirections: { type: Type.ARRAY, items: { type: Type.STRING } },
        mustAvoidPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['tone', 'vocabularyPatterns', 'sloganStyle', 'merchCopySuitability', 'recommendedCopyDirections', 'mustAvoidPhrases'],
    },
    context: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING },
        audienceProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
        culturalReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
        categoryConventions: { type: Type.ARRAY, items: { type: Type.STRING } },
        contextWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['category', 'audienceProfile', 'culturalReferences', 'categoryConventions'],
    },
    riskAssessment: {
      type: Type.OBJECT,
      properties: {
        detectedProtectedElements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              label: { type: Type.STRING, nullable: true },
              confidence: { type: Type.NUMBER },
            },
            required: ['type', 'confidence'],
          },
        },
        recommendedOwnershipState: { type: Type.STRING },
        userFacingNotice: { type: Type.STRING },
      },
      required: ['detectedProtectedElements', 'recommendedOwnershipState', 'userFacingNotice'],
    },
  },
  required: ['essence', 'voice', 'context', 'riskAssessment'],
};

export const CONCEPT_NARRATIVE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    concepts: {
      type: Type.ARRAY,
      description: 'Exactly 4 concept narratives.',
      items: {
        type: Type.OBJECT,
        properties: {
          seedId: { type: Type.STRING },
          conceptName: { type: Type.STRING, description: '2-4 word catchy name. No brand names.' },
          subtitle: { type: Type.STRING, description: 'One sentence, max 12 words.' },
          visualDirection: { type: Type.STRING, description: 'Specific artwork description for merch production.' },
          whyItFitsBrand: { type: Type.STRING },
          copyDirection: { type: Type.STRING, nullable: true },
        },
        required: ['seedId', 'conceptName', 'subtitle', 'visualDirection', 'whyItFitsBrand'],
      },
    },
  },
  required: ['concepts'],
};

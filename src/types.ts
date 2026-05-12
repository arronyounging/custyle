// ── Input ──

export interface BrandLensInput {
  type: 'url' | 'image';
  url?: string;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  userInstruction?: string;
}

// ── Deterministic Signals (from HTTP fetch + node-vibrant) ──

export interface DeterministicSignals {
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  themeColor: string;
  favicon: string;
  cssVariables: Record<string, string>;
  fontFaceDeclarations: string[];
  googleFontsLinks: string[];
  h1Texts: string[];
  visibleTextSample: string;
  navItems: string[];
  ctaTexts: string[];
}

export interface VibrantSwatch {
  hex: string;
  rgb: [number, number, number];
  population: number;
  name: string;
}

export interface VibrantResult {
  vibrant: VibrantSwatch | null;
  muted: VibrantSwatch | null;
  darkVibrant: VibrantSwatch | null;
  darkMuted: VibrantSwatch | null;
  lightVibrant: VibrantSwatch | null;
  lightMuted: VibrantSwatch | null;
}

// ── Gemini Call 1: Visual Extraction ──

export interface ColorToken {
  hex: string;
  role: 'primary' | 'secondary' | 'accent' | 'neutral' | 'background' | 'text' | 'cta';
  usage: string;
  dominance: number | null;
  confidence: number;
  extractionFidelity: 'exact' | 'algorithmic_stable' | 'model_inferred';
}

export interface VisualExtractionOutput {
  colorSystem: {
    primary: ColorToken[];
    secondary: ColorToken[];
    accent: ColorToken[];
    neutrals: ColorToken[];
    colorMood: string[];
  };
  typographySystem: {
    headingStyle: string;
    bodyStyle: string;
    fontCategory: string;
    fontPersonality: string[];
    merchTextSuitability: { score: number; level: string; explanation: string };
  };
  imageryStyle: {
    photographyStyle: string[];
    subjectTypes: string[];
    backgroundStyle: string;
    realismLevel: string;
  };
  visualMotifs: string[];
  layoutComposition: {
    whitespacePreference: string;
    symmetry: string;
    gridFeeling: string;
    merchCompositionHints: string[];
  };
  textureMaterialLanguage: {
    textureKeywords: string[];
    materialFeeling: string[];
    garmentImplications: string[];
  };
  logoDetection: {
    detected: boolean;
    markType: string | null;
    logoStyle: string | null;
    riskFlag: boolean;
    riskNote: string | null;
  };
  printSuitabilityNotes: string[];
}

// ── Gemini Call 2: Brand Synthesis ──

export interface AxisScore {
  score: number;
  explanation: string;
}

export interface BrandSynthesisOutput {
  essence: {
    brandName: string | null;
    tagline: string | null;
    category: string;
    positioningSummary: string;
    emotionalCore: string[];
    personalityAxes: {
      premiumVsMass: AxisScore;
      seriousVsPlayful: AxisScore;
      establishedVsDisruptive: AxisScore;
      minimalVsExpressive: AxisScore;
      calmVsEnergetic: AxisScore;
      functionalVsEmotional: AxisScore;
    };
    audienceHypothesis: string[];
  };
  voice: {
    tone: string[];
    vocabularyPatterns: string[];
    sloganStyle: string;
    merchCopySuitability: { score: number; explanation: string };
    recommendedCopyDirections: string[];
    mustAvoidPhrases: string[];
  };
  context: {
    category: string;
    audienceProfile: string[];
    culturalReferences: string[];
    categoryConventions: string[];
    contextWarnings: string[];
  };
  riskAssessment: {
    detectedProtectedElements: Array<{
      type: string;
      label: string | null;
      confidence: number;
    }>;
    recommendedOwnershipState: 'style_reference' | 'restricted';
    userFacingNotice: string;
  };
}

// ── Merch Rule Engine ──

export type BrandArchetype =
  | 'tech_minimal'
  | 'streetwear_creator'
  | 'premium_corporate'
  | 'fun_illustrative'
  | 'lifestyle_warm';

export type ProductCategory =
  | 'T_SHIRT' | 'HOODIE' | 'SWEATSHIRT'
  | 'CANVAS_BAG' | 'TOTE_BAG'
  | 'MUG' | 'MOUSE_PAD' | 'PHONE_CASE'
  | 'STICKER' | 'NOTEBOOK';

export interface ProductCategoryFit {
  category: ProductCategory;
  fitScore: number;
  fitLevel: 'low' | 'medium' | 'high';
}

export interface ConceptSeed {
  seedId: string;
  category: ProductCategory;
  baseColor: string;
  baseColorName: string;
  placement: string;
  artworkStyleHint: string;
}

// ── Gemini Call 3: Concept Narrative ──

export interface MerchConcept {
  seedId: string;
  conceptName: string;
  subtitle: string;
  category: ProductCategory;
  baseColor: string;
  baseColorName: string;
  placement: string;
  visualDirection: string;
  whyItFitsBrand: string;
  copyDirection: string | null;
}

// ── SSE Events ──

export type SSEPhase =
  | 'start'
  | 'metadata'
  | 'colors'
  | 'visual'
  | 'personality'
  | 'voice'
  | 'concepts'
  | 'complete'
  | 'error';

export interface SSEEvent {
  phase: SSEPhase;
  message?: string;
  data?: unknown;
}

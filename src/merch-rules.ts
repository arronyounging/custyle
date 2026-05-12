import type {
  BrandArchetype, ProductCategory, ProductCategoryFit,
  ConceptSeed, AxisScore, ColorToken,
} from './types.js';

// ── Archetype Matching ──

interface PersonalityAxes {
  premiumVsMass: AxisScore;
  seriousVsPlayful: AxisScore;
  establishedVsDisruptive: AxisScore;
  minimalVsExpressive: AxisScore;
  calmVsEnergetic: AxisScore;
  functionalVsEmotional: AxisScore;
}

const ARCHETYPE_WEIGHTS: Record<BrandArchetype, Record<string, number>> = {
  tech_minimal: {
    minimalVsExpressive: -0.4, seriousVsPlayful: -0.2,
    calmVsEnergetic: -0.2, functionalVsEmotional: -0.3,
  },
  streetwear_creator: {
    seriousVsPlayful: 0.2, establishedVsDisruptive: 0.4,
    calmVsEnergetic: 0.3, minimalVsExpressive: 0.3,
  },
  premium_corporate: {
    premiumVsMass: -0.5, seriousVsPlayful: -0.3,
    establishedVsDisruptive: -0.3, minimalVsExpressive: -0.2,
  },
  fun_illustrative: {
    seriousVsPlayful: 0.5, minimalVsExpressive: 0.4,
    functionalVsEmotional: 0.3, calmVsEnergetic: 0.2,
  },
  lifestyle_warm: {
    functionalVsEmotional: 0.3, calmVsEnergetic: -0.2,
    premiumVsMass: 0.1, seriousVsPlayful: 0.2,
  },
};

function axisValue(axes: PersonalityAxes, key: string): number {
  return (axes as any)[key]?.score ?? 0;
}

export function matchArchetype(axes: PersonalityAxes): BrandArchetype {
  let best: BrandArchetype = 'tech_minimal';
  let bestScore = -Infinity;

  for (const [archetype, weights] of Object.entries(ARCHETYPE_WEIGHTS)) {
    let score = 0;
    for (const [axis, target] of Object.entries(weights)) {
      const actual = axisValue(axes, axis);
      score -= Math.abs(actual - target);
    }
    if (score > bestScore) {
      bestScore = score;
      best = archetype as BrandArchetype;
    }
  }
  return best;
}

// ── Category Fit ──

interface CategoryRule {
  boosts: Array<{ category: ProductCategory; delta: number }>;
  penalizes: Array<{ category: ProductCategory; delta: number }>;
  placements: string[];
  baseColors: string[];
}

const CATEGORY_RULES: Record<BrandArchetype, CategoryRule> = {
  tech_minimal: {
    boosts: [
      { category: 'HOODIE', delta: 15 }, { category: 'T_SHIRT', delta: 12 },
      { category: 'MUG', delta: 10 }, { category: 'STICKER', delta: 10 },
      { category: 'MOUSE_PAD', delta: 8 }, { category: 'NOTEBOOK', delta: 6 },
    ],
    penalizes: [],
    placements: ['left_chest', 'back_large', 'center_chest', 'front_center'],
    baseColors: ['#000000', '#1a1a2e', '#ffffff', '#1e3a5f'],
  },
  streetwear_creator: {
    boosts: [
      { category: 'HOODIE', delta: 18 }, { category: 'T_SHIRT', delta: 16 },
      { category: 'STICKER', delta: 12 }, { category: 'TOTE_BAG', delta: 8 },
    ],
    penalizes: [{ category: 'NOTEBOOK', delta: -8 }],
    placements: ['back_large', 'center_chest', 'all_over', 'front_center'],
    baseColors: ['#000000', '#2d2d2d', '#f5f0e8', '#1a1a1a'],
  },
  premium_corporate: {
    boosts: [
      { category: 'NOTEBOOK', delta: 14 }, { category: 'MUG', delta: 12 },
      { category: 'T_SHIRT', delta: 10 }, { category: 'TOTE_BAG', delta: 10 },
    ],
    penalizes: [{ category: 'STICKER', delta: -6 }],
    placements: ['left_chest', 'corner', 'center_chest', 'front_center'],
    baseColors: ['#ffffff', '#1e3a5f', '#000000', '#f5f0e8'],
  },
  fun_illustrative: {
    boosts: [
      { category: 'STICKER', delta: 18 }, { category: 'T_SHIRT', delta: 16 },
      { category: 'PHONE_CASE', delta: 14 }, { category: 'TOTE_BAG', delta: 12 },
    ],
    penalizes: [],
    placements: ['center_chest', 'all_over', 'front_center', 'back_large'],
    baseColors: ['#ffffff', '#e8f0fe', '#fff0f0', '#f5f0e8'],
  },
  lifestyle_warm: {
    boosts: [
      { category: 'TOTE_BAG', delta: 14 }, { category: 'HOODIE', delta: 14 },
      { category: 'T_SHIRT', delta: 12 }, { category: 'MUG', delta: 12 },
      { category: 'CANVAS_BAG', delta: 10 },
    ],
    penalizes: [{ category: 'MOUSE_PAD', delta: -6 }],
    placements: ['center_chest', 'left_chest', 'back_large', 'front_center'],
    baseColors: ['#f5f0e8', '#556b2f', '#d4a0a0', '#ffffff'],
  },
};

const ALL_CATEGORIES: ProductCategory[] = [
  'T_SHIRT', 'HOODIE', 'SWEATSHIRT', 'CANVAS_BAG', 'TOTE_BAG',
  'MUG', 'MOUSE_PAD', 'PHONE_CASE', 'STICKER', 'NOTEBOOK',
];

const BASE_COLOR_NAMES: Record<string, string> = {
  '#000000': 'Black', '#1a1a1a': 'Charcoal', '#1a1a2e': 'Dark Navy',
  '#2d2d2d': 'Washed Black', '#1e3a5f': 'Navy', '#556b2f': 'Olive',
  '#d4a0a0': 'Dusty Rose', '#e8f0fe': 'Ice Blue', '#fff0f0': 'Blush',
  '#f5f0e8': 'Natural', '#ffffff': 'White',
};

export function scoreCategoryFit(archetype: BrandArchetype): ProductCategoryFit[] {
  const scores: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) scores[cat] = 50;

  const rule = CATEGORY_RULES[archetype];
  for (const b of rule.boosts) scores[b.category] = (scores[b.category] ?? 50) + b.delta;
  for (const p of rule.penalizes) scores[p.category] = (scores[p.category] ?? 50) + p.delta;

  return Object.entries(scores)
    .map(([category, score]) => ({
      category: category as ProductCategory,
      fitScore: Math.max(0, Math.min(100, score)),
      fitLevel: (score >= 65 ? 'high' : score >= 45 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    }))
    .sort((a, b) => b.fitScore - a.fitScore);
}

export function generateConceptSeeds(
  archetype: BrandArchetype,
  colors: ColorToken[],
  categoryFit: ProductCategoryFit[],
): ConceptSeed[] {
  const rule = CATEGORY_RULES[archetype];
  const topCategories = categoryFit.filter(c => c.fitLevel !== 'low').slice(0, 4);

  // Ensure at least 4 categories
  while (topCategories.length < 4) {
    const next = categoryFit.find(c => !topCategories.includes(c));
    if (next) topCategories.push(next);
    else break;
  }

  const brandPrimary = colors[0]?.hex ?? rule.baseColors[0];

  const seeds: ConceptSeed[] = topCategories.slice(0, 4).map((cat, i) => {
    const baseColor = rule.baseColors[i % rule.baseColors.length];
    const placement = rule.placements[i % rule.placements.length];

    return {
      seedId: `seed_${i + 1}`,
      category: cat.category,
      baseColor,
      baseColorName: BASE_COLOR_NAMES[baseColor] ?? 'Custom',
      placement,
      artworkStyleHint: `Brand primary ${brandPrimary} on ${BASE_COLOR_NAMES[baseColor] ?? baseColor}, ${archetype.replace(/_/g, ' ')} aesthetic`,
    };
  });

  return seeds;
}

export const ARCHETYPE_LABELS: Record<BrandArchetype, string> = {
  tech_minimal: 'Tech Minimal',
  streetwear_creator: 'Streetwear Creator',
  premium_corporate: 'Premium Corporate',
  fun_illustrative: 'Fun Illustrative',
  lifestyle_warm: 'Lifestyle Warm',
};

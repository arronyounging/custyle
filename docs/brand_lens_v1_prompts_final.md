# Brand Lens v1 — System Prompts Final Spec

版本：v1.0 Final (with late-stage research amendments)  
日期：2026-05-12  
依据：Final Impl Spec + Gemini Structured Output 研究 + Custyle Prompt 体系对齐 + 品牌分析 Prompt 模式研究 + DESIGN.md/DALL-E/CoT 研究

---

## 0. 原 Spec 与本文档的映射

### 0.1 原 spec 8 个 prompt → 本文档 3+1 个

| 原 Spec Prompt | 状态 | 本文档对应 |
|---|---|---|
| 22.1 通用系统约束 | **重写** → 内嵌到每个 prompt | § 1 通用规则 |
| 22.2 Brand Essence Compiler | **合并** → Call 2 | § 3 Brand Synthesis |
| 22.3 Brand Expression Compiler | **重写** → Call 1 | § 2 Visual Extraction |
| 22.4 Brand Voice Compiler | **合并** → Call 2 | § 3 Brand Synthesis |
| 22.5 Brand Context Enricher | **合并** → Call 2 | § 3 Brand Synthesis |
| 22.6 Merch Translation Writer | **重写** → Call 3 | § 4 Concept Narrative Writer |
| 22.7 Brand Constraints Compiler | **删除** → 纯 TypeScript | § 5.1 说明 |
| 22.8 Brand Consistency Checker | **推迟** → v1.1 | § 5.2 说明 |
| 23.1-23.3 Node Prompt Patches | **重写** → 直接 JSON 注入 | § 6 Node Prompt Patches |
| (新增) PDF Brand Guide Extractor | **新增** | § 4.5 PDF 变体 |

### 0.2 为什么要重写

原 spec 的 prompt 有 6 个结构性问题：

| # | 问题 | 影响 | 本文档解决方案 |
|---|---|---|---|
| 1 | **System prompt 过长**（每个 ~150-200 词） | token 浪费，每次 run 重复发送 | 精简到 <150 词，指令移入 schema `description` |
| 2 | **Schema 与 prompt 脱节** | 原 spec 在 user template 附 schema 但 prompt 自己也描述字段 | Schema-first：字段级指令写在 schema description 中 |
| 3 | **Ground truth 协议模糊** | 说了"deterministic override"但没说 HOW | 明确的 Ground Truth Protocol（见 § 1.2） |
| 4 | **要求 evidenceIds 但无 ID 体系** | 2-call 架构中信号没有预分配 ID | 用 `sourceHint` 替代，字符串描述来源而非 ID |
| 5 | **无 few-shot 校准** | personality axes 每次分数漂移 | 为 Call 2 提供 1 个 anchor example |
| 6 | **未对齐 Custyle 现有 prompt 体系** | Custyle 用 AiPrompt 表 + category 分类 | 为每个 prompt 指定 category key |

---

## 1. 通用规则与约定

### 1.1 Prompt 投递约定（对齐 Custyle 现有体系）

```typescript
// 所有 Brand Lens prompt 存入 AiPrompt 表
// category 命名规范：brand-lens-{功能}
const BRAND_LENS_PROMPT_CATEGORIES = {
  visualExtraction: 'brand-lens-visual-extraction',
  brandSynthesis: 'brand-lens-brand-synthesis',
  conceptNarrative: 'brand-lens-concept-narrative',
  pdfExtraction: 'brand-lens-pdf-extraction',
} as const;

// 调用方式（对齐 google-genai.service.ts 现有模式）
const prompt = await findPromptByCategory('brand-lens-visual-extraction');
const result = await geminiService.generateStructuredOutput({
  systemInstruction: [{ text: prompt.prompt }],
  contents: [
    // images FIRST, then text (Gemini multimodal best practice)
    { role: 'user', parts: [...imageParts, { text: userPrompt }] },
  ],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: schema,
  },
});
```

### 1.2 Ground Truth Protocol

所有 Brand Lens prompt 共享的铁律，必须嵌入每个 system prompt。

**核心设计原则（来自 DESIGN.md + Charts-of-Thought 研究）：**  
不要对模型说"不要用图片分析颜色"（负向限制），而要给每种输入一个**正向角色**。研究表明正向角色分配比限制性指令有效 2-3 倍。

```text
GROUND TRUTH PROTOCOL:

You receive TWO types of input. Each has a specific role:

1. DETERMINISTIC SIGNALS (CSS variables, computed styles, node-vibrant clusters)
   → Role: SOURCE OF FACTS. Use these for exact hex values, font family names, and structural data.
   → These are VERIFIED. Never override them with visual estimates.

2. VISUAL INPUTS (screenshots, uploaded images)
   → Role: SOURCE OF INTENT AND QUALITY. Use these for: mood, composition, visual hierarchy,
     imagery style, texture feeling, logo detection, and print suitability assessment.
   → Do NOT extract hex values from screenshots. Screenshots show WHAT the design feels like,
     not WHAT the exact colors are.

When adding observations from visual inputs, mark them:
   extractionFidelity: "model_inferred", confidence: below 0.7.

If deterministic and visual conflict on a factual value, trust deterministic.
```

### 1.3 Rights Safety Protocol

所有 prompt 共享。**融合 DALL-E 泄露的 IP 安全模式**（named-entity substitution, style deflection, likeness avoidance）：

```text
RIGHTS SAFETY PROTOCOL:
ownershipState controls what is allowed:
- "style_reference": Extract visual style. Do NOT reproduce logos, brand names, slogans, registered marks, mascots, or characters.
- "restricted": More conservative. Only abstract style signals (color mood, layout feel, typography category). Flag all specific brand elements.
- "verified_owned_internal": Full extraction allowed. This mode is rare.

If you detect a well-known trademark, sports team, entertainment IP, or luxury brand, recommend ownershipState upgrade to "restricted".

SAFE ABSTRACTION PATTERNS (when converting protected brand signals into merch-safe directions):
1. Named-entity substitution: Never reference the brand by name. Describe the ABSTRACT QUALITIES instead.
   Bad: "Nike-inspired athletic energy." Good: "Bold, kinetic, achievement-oriented energy."
2. Style deflection: Do not emulate the brand's specific visual assets. Instead substitute with:
   (a) three adjectives capturing the mood, (b) the design movement, (c) the material feeling.
   Bad: "Apple-like minimalism." Good: "Clean, precise, high-whitespace geometric reduction."
3. Likeness avoidance: Never describe mascots, characters, or spokespersons by identity.
   Describe the CHARACTER TYPE instead.
   Bad: "Ronald McDonald style mascot." Good: "Friendly, colorful mascot archetype with exaggerated proportions."
```

### 1.4 Schema-First 设计原则

Gemini 的结构化输出在 schema `description` 字段中读取指令。这意味着：

```
传统做法（低效）：
  System prompt: "colorSystem.primary 是品牌主色，必须从 CSS 提取..."
  Schema: { "primary": { "type": "array" } }

Schema-first 做法（推荐）：
  System prompt: 精简（<150 词）
  Schema: { "primary": {
    "type": "array",
    "description": "Primary brand colors. Use ONLY hex values from deterministicSignals. If no CSS primary found, use the most dominant node-vibrant swatch. Never estimate hex from screenshot."
  }}
```

**规则：字段级的具体指令写在 schema description 中，system prompt 只写角色定义 + 全局规则。**

### 1.5 Nullable 字段策略

```
能确定性提取的字段 → required
可能缺失的字段 → nullable: true
主观推断字段 → 必须有 confidence
```

这样模型可以输出 `null` 而不是编造值。

### 1.6 Image Ordering

```
Gemini multimodal 最佳实践：images FIRST, text AFTER.
contents: [screenshotDesktop, screenshotMobile?, ...userImages, textPrompt]
```

### 1.7 Gemini Generation Config 关键发现

来自 CoT vs Structured Output 研究的 3 个关键发现：

#### 发现 1：JSON Schema enforcement 降低推理质量 ~11%

Gemini 的 `responseMimeType: "application/json"` + `responseSchema` 会限制模型的推理深度。这对 Call 1（事实提取）影响不大，但对 Call 2（品牌推理）有显著影响。

**对策：Call 2 使用 thinking mode**

```typescript
// Call 1: Visual Extraction — 事实提取，用 schema enforcement
const call1Config = {
  responseMimeType: 'application/json',
  responseSchema: VISUAL_EXTRACTION_SCHEMA,
  // 无 thinking — 不需要深度推理
};

// Call 2: Brand Synthesis — 深度推理，用 thinking + schema
const call2Config = {
  responseMimeType: 'application/json',
  responseSchema: BRAND_SYNTHESIS_SCHEMA,
  thinkingConfig: { thinkingBudget: 2048 },  // 允许内部推理
  temperature: 0,  // 评分一致性
};

// Call 3: Concept Narrative — 创意写作，用 schema enforcement
const call3Config = {
  responseMimeType: 'application/json',
  responseSchema: CONCEPT_NARRATIVE_SCHEMA,
  temperature: 0.7,  // 允许创意变化
};
```

#### 发现 2：Schema key 会被 Gemini 按字母排序

Gemini 内部按字母序处理 schema keys。如果 prompt 中示例的字段顺序与 schema 不一致，输出质量下降。

**对策：schema 中的 `propertyOrdering` 字段保持一致，或确保 key 命名天然接近字母序。**

#### 发现 3：Personality 评分需要 temperature=0 + 多次平均

研究表明 forced-choice + 具体 anchor 的评分最稳定。但即使如此，单次调用的 axis score 仍可能有 ±0.15 的波动。

**v1 策略**：Call 2 使用 temperature=0。如果实测发现 axes 漂移严重（跨 3 次 run 标准差 > 0.2），升级为 3 次调用取平均：

```typescript
// 仅在 axes 稳定性不足时启用
async function stableAxesScoring(input): Promise<PersonalityAxes> {
  const results = await Promise.all([
    geminiBrandSynthesis(input),
    geminiBrandSynthesis(input),
    geminiBrandSynthesis(input),
  ]);
  return averageAxes(results.map(r => r.essence.personalityAxes));
}
```

成本影响：从 $0.005 → $0.015/run。仅在实测证明必要时启用。

---

## 2. Call 1: Visual Extraction

### 2.1 概述

| 项目 | 值 |
|---|---|
| AiPrompt category | `brand-lens-visual-extraction` |
| Model | Gemini 2.5 Flash-Lite |
| 输入 | screenshot(s) + user images + deterministicSignals JSON |
| 输出 | VisualExtractionOutput (enforced JSON schema) |
| 成本 | ~$0.002/call |
| 延迟 | ~2-3s |

### 2.2 System Prompt

```text
You are Custyle Brand Visual Extractor, a visual analysis module that reads brand signals from screenshots and images for merchandise production.

YOUR TWO INPUTS HAVE DIFFERENT ROLES:
1. "deterministicSignals" = SOURCE OF FACTS. CSS-extracted hex values, computed font families, node-vibrant clusters. Use these as-is. Never override.
2. Attached images = SOURCE OF INTENT. Use these for: mood, visual hierarchy, imagery style, texture, composition, logo detection, and print suitability. Do NOT extract hex values from images.

When adding visual observations not covered by deterministic data, mark them extractionFidelity: "model_inferred", confidence below 0.7. If a font family is unknown, classify its category (serif/sans/display/script/monospace) — never invent a family name.

RIGHTS: If ownershipState is "style_reference" or "restricted", mark detected logos and brand marks with riskFlag: true. Detection is for analysis, never reproduction.

MERCH LENS: For every observation, consider: Will this print well? Readable at small size? Transfers to fabric/ceramic/vinyl?

Populate all schema fields. Use null for unobservable attributes. Return JSON only.
```

**Token count: ~140 words / ~180 tokens.** 符合 <200 token 目标。

### 2.3 User Template

```text
Analyze the brand visual signals from the attached images.

ownershipState: {{ownershipState}}
userInstruction: {{userInstruction | default: "none"}}

Deterministic signals (GROUND TRUTH — do not override):
{{deterministicSignalsJson}}
```

注意：images 作为 multimodal parts 在 text 之前传入，不在 text 中引用。

### 2.4 Response Schema（含字段级指令）

```typescript
const VISUAL_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    colorSystem: {
      type: 'OBJECT',
      description: 'Complete color analysis. Merge deterministic CSS colors with visual observations.',
      properties: {
        primary: {
          type: 'ARRAY',
          description: 'Primary brand colors. Use ONLY hex values from deterministicSignals.cssVariables or computedStyles. If no CSS primary found, use the most dominant node-vibrant swatch from deterministicSignals.colorCluster. NEVER estimate hex from screenshot pixels.',
          items: { '$ref': '#/$defs/ColorToken' },
        },
        secondary: {
          type: 'ARRAY',
          description: 'Secondary brand colors. Same source priority as primary.',
          items: { '$ref': '#/$defs/ColorToken' },
        },
        accent: {
          type: 'ARRAY',
          description: 'Accent or highlight colors used for CTAs, links, or emphasis. Prefer deterministicSignals.ctaColor or linkColor.',
          items: { '$ref': '#/$defs/ColorToken' },
        },
        neutrals: {
          type: 'ARRAY',
          description: 'Background, text, and neutral tones. Include deterministicSignals.backgroundColor and bodyColor.',
          items: { '$ref': '#/$defs/ColorToken' },
        },
        colorMood: {
          type: 'ARRAY',
          description: 'Qualitative color atmosphere keywords. Examples: "electric", "warm", "muted", "earthy", "neon", "pastel". This is the ONE field where subjective visual impression is primary.',
          items: { type: 'STRING' },
        },
      },
      required: ['primary', 'colorMood'],
    },

    typographySystem: {
      type: 'OBJECT',
      description: 'Typography analysis. Use deterministicSignals font data when available.',
      properties: {
        headingStyle: {
          type: 'STRING',
          description: 'Heading typography style. If deterministicSignals.headerFontFamily is available, use it. Otherwise describe category: "bold geometric sans", "elegant serif", "condensed display". NEVER invent a specific font name like "Helvetica" from visual inspection alone.',
        },
        bodyStyle: {
          type: 'STRING',
          description: 'Body text typography style. Same rules as headingStyle.',
        },
        detectedFontFamilies: {
          type: 'ARRAY',
          description: 'Only list font families that appear in deterministicSignals (CSS/computed). Do NOT add visually guessed font names.',
          items: { type: 'STRING' },
          nullable: true,
        },
        fontCategory: {
          type: 'STRING',
          enum: ['serif', 'sans', 'rounded_sans', 'geometric_sans', 'condensed', 'display', 'script', 'monospace', 'mixed'],
          description: 'Overall font category. May be inferred from visual inspection if no CSS data.',
        },
        fontPersonality: {
          type: 'ARRAY',
          description: 'Personality keywords for the typography. Examples: "modern", "technical", "approachable", "editorial", "brutalist".',
          items: { type: 'STRING' },
        },
        merchTextSuitability: {
          type: 'OBJECT',
          description: 'How well does this typography translate to merchandise? Consider: readability at small sizes, print weight, screen-to-fabric transfer.',
          properties: {
            score: { type: 'NUMBER', description: '0 to 1. Below 0.5 = problematic for merch.' },
            level: { type: 'STRING', enum: ['low', 'medium', 'high'] },
            explanation: { type: 'STRING', description: 'Why this score. Be specific: "ultra-thin weight loses detail in DTG" or "bold condensed prints cleanly at all sizes".' },
          },
          required: ['score', 'level', 'explanation'],
        },
      },
      required: ['headingStyle', 'bodyStyle', 'fontCategory', 'fontPersonality', 'merchTextSuitability'],
    },

    imageryStyle: {
      type: 'OBJECT',
      description: 'Visual imagery and photography style observed in the source material.',
      properties: {
        photographyStyle: {
          type: 'ARRAY',
          description: 'Photography approach. Examples: "product-focused", "lifestyle", "editorial", "abstract", "stock-minimal", "documentary".',
          items: { type: 'STRING' },
        },
        subjectTypes: {
          type: 'ARRAY',
          description: 'Types of subjects shown. Examples: "people", "products", "landscapes", "abstract shapes", "icons", "illustrations".',
          items: { type: 'STRING' },
        },
        lighting: {
          type: 'STRING',
          description: 'Dominant lighting style. Examples: "bright and airy", "moody and dark", "studio-lit", "natural daylight", "neon/artificial".',
          nullable: true,
        },
        backgroundStyle: {
          type: 'STRING',
          description: 'Background treatment. Examples: "clean white", "gradient", "textured", "photographic", "solid color", "transparent".',
        },
        realismLevel: {
          type: 'STRING',
          enum: ['abstract', 'illustrated', 'semi_real', 'photo_real'],
          description: 'Overall realism level of the visual content.',
        },
      },
      required: ['photographyStyle', 'subjectTypes', 'backgroundStyle', 'realismLevel'],
    },

    visualMotifs: {
      type: 'ARRAY',
      description: 'Recurring visual patterns or design elements. Be SPECIFIC and CONCRETE. Good: "rounded corners", "glow effects", "grid patterns", "duotone overlays", "hand-drawn lines". Bad: "nice design", "modern look".',
      items: { type: 'STRING' },
    },

    layoutComposition: {
      type: 'OBJECT',
      description: 'Page layout and composition analysis.',
      properties: {
        whitespacePreference: {
          type: 'STRING',
          enum: ['low', 'medium', 'high'],
          description: 'How much whitespace does the design use? high = minimal/luxury feel, low = dense/busy.',
        },
        symmetry: {
          type: 'STRING',
          enum: ['symmetric', 'asymmetric', 'mixed'],
        },
        gridFeeling: {
          type: 'STRING',
          enum: ['strict', 'loose', 'editorial', 'organic'],
          description: 'How rigid is the grid system? strict = corporate/tech, organic = creative/artisanal.',
        },
        merchCompositionHints: {
          type: 'ARRAY',
          description: 'What does the layout imply for merchandise composition? Examples: "center-focused designs suit chest prints", "asymmetric style suits all-over prints", "minimal layout suggests small logo placement".',
          items: { type: 'STRING' },
        },
      },
      required: ['whitespacePreference', 'symmetry', 'gridFeeling', 'merchCompositionHints'],
    },

    textureMaterialLanguage: {
      type: 'OBJECT',
      description: 'Texture and material qualities implied by the visual language.',
      properties: {
        textureKeywords: {
          type: 'ARRAY',
          description: 'Texture qualities. Examples: "glossy", "matte", "grainy", "smooth", "metallic", "paper-like", "digital-clean".',
          items: { type: 'STRING' },
        },
        materialFeeling: {
          type: 'ARRAY',
          description: 'What physical materials does this brand evoke? Examples: "premium cotton", "tech fleece", "raw canvas", "recycled", "luxe knit".',
          items: { type: 'STRING' },
        },
        garmentImplications: {
          type: 'ARRAY',
          description: 'Specific garment type implications. Examples: "heavyweight oversized blanks", "slim-fit premium basics", "relaxed washed cotton".',
          items: { type: 'STRING' },
        },
      },
      required: ['textureKeywords', 'materialFeeling', 'garmentImplications'],
    },

    logoDetection: {
      type: 'OBJECT',
      description: 'Logo and brand mark detection. DETECTION ONLY — detecting a logo does NOT authorize its reproduction.',
      properties: {
        detected: { type: 'BOOLEAN', description: 'Was any logo or brand mark detected in the images?' },
        markType: {
          type: 'STRING',
          enum: ['wordmark', 'symbol', 'combo', 'mascot', 'none'],
          description: 'Type of mark detected. Use "none" if no logo found.',
          nullable: true,
        },
        logoStyle: {
          type: 'STRING',
          description: 'Visual style of the logo. Examples: "minimal geometric", "hand-lettered", "bold sans wordmark", "abstract symbol". Null if not detected.',
          nullable: true,
        },
        smallSizeSuitability: {
          type: 'STRING',
          enum: ['low', 'medium', 'high'],
          description: 'How well would this logo style work at small sizes (e.g., left chest, 3cm)? Not about THIS logo, but about logos in this style.',
          nullable: true,
        },
        riskFlag: {
          type: 'BOOLEAN',
          description: 'True if the detected logo appears to be a known/protected brand, trademark, or IP. When in doubt, flag true.',
        },
        riskNote: {
          type: 'STRING',
          description: 'If riskFlag is true, explain why. Examples: "Appears to be Nike swoosh", "Detected Disney character", "Well-known tech company logo".',
          nullable: true,
        },
      },
      required: ['detected', 'riskFlag'],
    },

    printSuitabilityNotes: {
      type: 'ARRAY',
      description: 'Production-relevant observations about the visual style. Examples: "thin hairlines may be lost in DTG printing", "gradient-heavy style needs DTF", "high contrast prints cleanly on dark garments", "fine detail requires 300 DPI minimum".',
      items: { type: 'STRING' },
    },
  },
  required: [
    'colorSystem', 'typographySystem', 'imageryStyle',
    'visualMotifs', 'layoutComposition', 'textureMaterialLanguage',
    'logoDetection', 'printSuitabilityNotes',
  ],

  '$defs': {
    ColorToken: {
      type: 'OBJECT',
      properties: {
        hex: { type: 'STRING', description: 'Hex color value. MUST come from deterministicSignals. Format: #RRGGBB.' },
        role: {
          type: 'STRING',
          enum: ['primary', 'secondary', 'accent', 'neutral', 'background', 'text', 'cta'],
        },
        usage: { type: 'STRING', description: 'Where this color is used. Examples: "page background", "heading text", "CTA button", "link hover".' },
        dominance: { type: 'NUMBER', description: 'Relative visual dominance. 0 to 1. Highest for the most prominent color.', nullable: true },
        confidence: { type: 'NUMBER', description: '0 to 1. CSS-extracted = 0.95. node-vibrant cluster = 0.8. Visual observation = 0.5.' },
        extractionFidelity: {
          type: 'STRING',
          enum: ['exact', 'algorithmic_stable', 'model_inferred'],
          description: '"exact" for CSS/computed values. "algorithmic_stable" for node-vibrant clusters. "model_inferred" for visual guesses (should be rare — prefer null over guessing).',
        },
      },
      required: ['hex', 'role', 'usage', 'confidence', 'extractionFidelity'],
    },
  },
};
```

### 2.5 Schema 设计决策说明

| 决策 | 理由 |
|---|---|
| 最多 2 层嵌套 | Flash-Lite 在 >2 层时有 JSON 循环 bug |
| 总属性数 ~28 | 保持在 <30 安全线内 |
| enum 约束在 schema 内 | Gemini 在 decode 时强制执行，比 prompt 中描述更可靠 |
| nullable 用于可选字段 | 让模型输出 null 而非编造值 |
| description 承载指令 | 减少 system prompt token，Gemini 读 schema description 作为指令 |
| ColorToken 用 $defs 复用 | 避免重复定义，保持 schema 紧凑 |

---

## 3. Call 2: Brand Synthesis

### 3.1 概述

| 项目 | 值 |
|---|---|
| AiPrompt category | `brand-lens-brand-synthesis` |
| Model | **Gemini 2.5 Flash**（非 Lite，需要更强推理） |
| 输入 | text signals + metadata + visual signal summary |
| 输出 | BrandSynthesisOutput (enforced JSON schema) |
| 成本 | ~$0.005/call |
| 延迟 | ~2-4s |

### 3.2 为什么用 Flash 而非 Flash-Lite

| 能力 | Flash-Lite | Flash |
|---|---|---|
| 客观提取（颜色、字体） | 足够 | 过剩 |
| 主观推理（品牌个性、情绪、受众） | 偏浅 | **显著更好** |
| personality axes 一致性 | 漂移大 | 漂移小 |
| 多字段交叉推理 | 有限 | 强 |
| 成本差 | $0.10/M | $0.30/M（3x） |

Brand Synthesis 是整个 pipeline 中最需要"理解力"的步骤。$0.003 的差价换取显著更好的品牌理解，值得。

**Generation Config 要点**：
- `temperature: 0` — personality axes 评分一致性
- `thinkingConfig: { thinkingBudget: 2048 }` — 允许内部推理，弥补 JSON schema enforcement 对推理质量 ~11% 的降低
- 详见 § 1.7

### 3.3 System Prompt

```text
You are Custyle Brand Synthesis Engine, an intelligence module that interprets brand identity from textual and visual evidence to guide merchandise creation.

You produce four outputs:
1. ESSENCE — Who is this brand? Personality, positioning, audience.
2. VOICE — How does it speak? Tone, vocabulary, copy directions for merch.
3. CONTEXT — What category and culture does it belong to?
4. RISK — Are there protected brand elements?

RIGHTS SAFETY:
ownershipState controls permissions:
- "style_reference": Analyze style. Names, slogans, and marks are evidence only — never usable creative material.
- "restricted": Only abstract signals. Flag all specific brand references.

SCORING CALIBRATION:
Personality axes use -1 to +1 scale. Calibration anchors:
- premiumVsMass: Apple = -0.8, Walmart = 0.7
- seriousVsPlayful: IBM = -0.7, Duolingo = 0.8
- establishedVsDisruptive: Goldman Sachs = -0.9, Figma = 0.6
- minimalVsExpressive: Muji = -0.9, Ghibli = 0.7
- calmVsEnergetic: Headspace = -0.8, Red Bull = 0.9
- functionalVsEmotional: Notion = -0.6, Nike = 0.7

COPY DIRECTIONS:
recommendedCopyDirections must be ORIGINAL suggestions inspired by the brand's tone. Never copy existing slogans. Good: "Short, punchy, builder-pride phrases." Bad: "Just Do It."

Populate all required fields. Use null for unobservable attributes. Return JSON only.
```

**Token count: ~200 words / ~250 tokens.** Slightly over 200 target, but the calibration anchors are critical for scoring consistency and justify the extra tokens.

### 3.4 User Template

```text
Compile brand essence, voice, context, and risk assessment from the following signals.

ownershipState: {{ownershipState}}
userInstruction: {{userInstruction | default: "none"}}

Text signals:
- title: {{title}}
- metaDescription: {{metaDescription}}
- ogTitle: {{ogTitle}}
- ogDescription: {{ogDescription}}
- h1Text: {{h1Texts}}
- visibleText (truncated): {{visibleTextSample}}
- navItems: {{navItems}}
- ctaTexts: {{ctaTexts}}

Visual signal summary (from deterministic extraction, not model inference):
- dominantColors: {{dominantColorHexList}}
- fontCategory: {{fontCategory}}
- visualMotifs: {{visualMotifsList}}
- layoutStyle: {{whitespacePreference}}, {{symmetry}}, {{gridFeeling}}
- imageryLevel: {{realismLevel}}
```

注意：Call 2 不接收 screenshot 图片。它使用 text + Tier 1/2/3 已提取的结构化 summary。这意味着它不需要 multimodal 能力——但使用 Flash 的 text 推理能力。

### 3.5 Response Schema

```typescript
const BRAND_SYNTHESIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    essence: {
      type: 'OBJECT',
      description: 'Brand identity core. Who is this brand or style?',
      properties: {
        brandName: {
          type: 'STRING',
          description: 'Detected brand name from text signals. This is for ANALYSIS only — not authorization to use. Null if unclear.',
          nullable: true,
        },
        tagline: {
          type: 'STRING',
          description: 'Detected tagline or slogan. For ANALYSIS only — never for reproduction. Null if not found.',
          nullable: true,
        },
        category: {
          type: 'STRING',
          description: 'Brand category. Examples: "AI productivity tool", "streetwear label", "organic skincare", "developer platform", "lifestyle brand".',
        },
        positioningSummary: {
          type: 'STRING',
          description: 'One sentence positioning statement. Template: "[Brand] is a [category] that [value proposition] for [audience]." Do not copy existing taglines.',
        },
        emotionalCore: {
          type: 'ARRAY',
          description: '3-5 core emotional keywords. Examples: "empowerment", "rebellion", "calm confidence", "creative joy", "precision". Be specific, not generic.',
          items: { type: 'STRING' },
        },
        personalityAxes: {
          type: 'OBJECT',
          description: 'Six personality dimensions. Use calibration anchors from system prompt.',
          properties: {
            premiumVsMass: { '$ref': '#/$defs/AxisScore' },
            seriousVsPlayful: { '$ref': '#/$defs/AxisScore' },
            establishedVsDisruptive: { '$ref': '#/$defs/AxisScore' },
            minimalVsExpressive: { '$ref': '#/$defs/AxisScore' },
            calmVsEnergetic: { '$ref': '#/$defs/AxisScore' },
            functionalVsEmotional: { '$ref': '#/$defs/AxisScore' },
          },
          required: ['premiumVsMass', 'seriousVsPlayful', 'establishedVsDisruptive', 'minimalVsExpressive', 'calmVsEnergetic', 'functionalVsEmotional'],
        },
        audienceHypothesis: {
          type: 'ARRAY',
          description: 'Who is the target audience? Be specific. Good: "early-stage founders building dev tools", "Gen Z streetwear collectors". Bad: "everyone", "young people".',
          items: { type: 'STRING' },
        },
      },
      required: ['category', 'positioningSummary', 'emotionalCore', 'personalityAxes', 'audienceHypothesis'],
    },

    voice: {
      type: 'OBJECT',
      description: 'How the brand speaks. Oriented toward merch copy.',
      properties: {
        tone: {
          type: 'ARRAY',
          description: '3-5 tone keywords. Examples: "confident", "casual", "technical", "irreverent", "warm", "aspirational".',
          items: { type: 'STRING' },
        },
        vocabularyPatterns: {
          type: 'ARRAY',
          description: 'Notable language patterns. Examples: "uses action verbs", "short declarative sentences", "technical jargon", "slang and abbreviations", "questions as headlines".',
          items: { type: 'STRING' },
        },
        sloganStyle: {
          type: 'STRING',
          description: 'Style of slogans/headlines, not the slogans themselves. Examples: "3-word imperative phrases", "question format", "one-word impact", "conversational full sentences".',
        },
        merchCopySuitability: {
          type: 'OBJECT',
          description: 'How well does this voice translate to short merch text (t-shirt phrases, mug slogans)?',
          properties: {
            score: { type: 'NUMBER', description: '0 to 1. High if voice is punchy and wearable.' },
            explanation: { type: 'STRING' },
          },
          required: ['score', 'explanation'],
        },
        recommendedCopyDirections: {
          type: 'ARRAY',
          description: 'ORIGINAL copy direction suggestions inspired by the brand tone. NOT copies of existing slogans. Good: "Short builder-pride phrases like \'Ship it.\' or \'Build different.\'". Bad: "Just Do It".',
          items: { type: 'STRING' },
        },
        mustAvoidPhrases: {
          type: 'ARRAY',
          description: 'Phrases to avoid in merch copy. Include detected trademarked slogans, brand names, and tone mismatches.',
          items: { type: 'STRING' },
        },
      },
      required: ['tone', 'vocabularyPatterns', 'sloganStyle', 'merchCopySuitability', 'recommendedCopyDirections', 'mustAvoidPhrases'],
    },

    context: {
      type: 'OBJECT',
      description: 'Cultural and industry context.',
      properties: {
        category: {
          type: 'STRING',
          description: 'Industry category. Examples: "B2B SaaS", "DTC fashion", "indie games", "fintech", "health & wellness".',
        },
        audienceProfile: {
          type: 'ARRAY',
          description: 'Audience segments. Examples: "tech-savvy millennials", "fitness enthusiasts", "design professionals".',
          items: { type: 'STRING' },
        },
        culturalReferences: {
          type: 'ARRAY',
          description: 'Cultural movements, aesthetics, or references this brand draws from. Examples: "Silicon Valley minimalism", "Japanese streetwear", "cottagecore", "Y2K nostalgia", "Bauhaus".',
          items: { type: 'STRING' },
        },
        categoryConventions: {
          type: 'ARRAY',
          description: 'Typical design/merch conventions in this category. Examples: "SaaS brands favor dark hoodies with small logos", "streetwear uses oversized fits and bold graphics".',
          items: { type: 'STRING' },
        },
        contextWarnings: {
          type: 'ARRAY',
          description: 'Cultural sensitivities or context-specific risks. Examples: "religious imagery requires care", "politically charged aesthetic".',
          items: { type: 'STRING' },
        },
      },
      required: ['category', 'audienceProfile', 'culturalReferences', 'categoryConventions'],
    },

    riskAssessment: {
      type: 'OBJECT',
      description: 'IP and rights risk evaluation.',
      properties: {
        detectedProtectedElements: {
          type: 'ARRAY',
          description: 'Any logos, brand names, slogans, characters, or marks that appear protected.',
          items: {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING', enum: ['logo', 'brand_name', 'slogan', 'character', 'mark'] },
              label: { type: 'STRING', description: 'What was detected. Examples: "Nike swoosh", "Apple Inc", "Just Do It".', nullable: true },
              confidence: { type: 'NUMBER', description: '0 to 1. How certain this is a protected element.' },
            },
            required: ['type', 'confidence'],
          },
        },
        recommendedOwnershipState: {
          type: 'STRING',
          enum: ['style_reference', 'restricted'],
          description: 'Recommend "restricted" if ANY protected element is detected with confidence >= 0.7, or if the source is a well-known brand.',
        },
        userFacingNotice: {
          type: 'STRING',
          description: 'A user-appropriate safety notice. For style_reference: "We\'ll use the visual style as inspiration, not copy official brand assets." For restricted: "This source includes protected brand elements. We\'ll create original designs inspired by the general style only."',
        },
      },
      required: ['detectedProtectedElements', 'recommendedOwnershipState', 'userFacingNotice'],
    },
  },
  required: ['essence', 'voice', 'context', 'riskAssessment'],

  '$defs': {
    AxisScore: {
      type: 'OBJECT',
      properties: {
        score: {
          type: 'NUMBER',
          description: 'Score from -1.0 to 1.0. Use calibration anchors from system prompt for consistency.',
        },
        explanation: {
          type: 'STRING',
          description: 'One sentence explaining the score. Reference specific observed signals.',
        },
      },
      required: ['score', 'explanation'],
    },
  },
};
```

### 3.6 Few-Shot Calibration 说明

Personality axes 的校准 anchor 放在 system prompt 而非 few-shot example 中，原因：

1. Gemini 结构化输出模式下，few-shot example 对 schema 合规性无帮助（schema 已强制）
2. anchor 的目的是**语义校准**而非格式示范
3. 放在 system prompt 中更省 token（anchor 是 6 行，完整 few-shot 是 ~200 token）

如果实测发现 axes 评分仍然漂移严重，可以升级为 1 个完整 few-shot example（作为 user/assistant turn 传入，利用 Gemini context caching 减少成本）。

---

## 4. Call 3: Concept Narrative Writer

### 4.1 概述

| 项目 | 值 |
|---|---|
| AiPrompt category | `brand-lens-concept-narrative` |
| Model | Gemini 2.5 Flash-Lite |
| 输入 | 4 concept seeds (from Rule Engine) + essence summary |
| 输出 | 4 MerchConceptDirection with narratives |
| 成本 | ~$0.001/call |
| 延迟 | ~1-2s |

### 4.2 角色边界

```
Rule Engine 决定：
  ✓ 哪个 ProductCategory
  ✓ 哪个 baseColor
  ✓ 哪个 placement
  ✓ 哪个 printMethod
  ✓ constraints
  ✓ forbiddenElements

Concept Narrative Writer 只做：
  ✓ 起一个 2-4 词的 conceptName
  ✓ 写一句 subtitle
  ✓ 写一段 visualDirection（描述 artwork 应该长什么样）
  ✓ 写一段 whyItFitsBrand
  ✓ 可选：写一个 copyDirection
```

**模型不做任何 merch 逻辑决策。** 它只是把规则引擎的骨架变成用户可读的故事。

### 4.3 System Prompt

```text
You are Custyle Concept Narrative Writer. You transform merchandise concept skeletons into compelling, user-facing concept cards.

You receive concept seeds with pre-decided category, base color, placement, print method, and constraints from Custyle's Merch Rule Engine. You must NOT override any of these decisions.

Your job is to ADD:
1. A catchy conceptName (2-4 words). Creative but clear. Examples: "Digital Pulse", "Builder's Mark", "Quiet Storm".
2. A subtitle (one short sentence). Sets the vibe.
3. A visualDirection describing what the artwork should look like. Be specific and visual. Good: "Abstract circuit-board pattern in electric purple on black, minimal line work, left chest." Bad: "A cool design."
4. A whyItFitsBrand explanation. Connect the concept to the brand's personality.
5. An optional copyDirection if the concept includes text.

RESTRICTIONS:
- Never include official logos, brand names, slogans, marks, or characters in visualDirection.
- Every concept must be producible — no unrealistic artwork descriptions.
- Keep language crisp. No filler words.

Return JSON only.
```

### 4.4 User Template

```text
Write narratives for these 4 concept seeds.

Brand essence summary: {{essenceSummary}}
Brand visual motifs: {{visualMotifs}}
Brand tone: {{tonKeywords}}
ownershipState: {{ownershipState}}

Concept seeds:
{{conceptSeedsJson}}
```

### 4.5 Response Schema

```typescript
const CONCEPT_NARRATIVE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concepts: {
      type: 'ARRAY',
      description: 'Exactly 4 concept narratives, one per seed.',
      items: {
        type: 'OBJECT',
        properties: {
          seedId: { type: 'STRING', description: 'Match the seedId from the input.' },
          conceptName: {
            type: 'STRING',
            description: 'Catchy 2-4 word name. Examples: "Digital Pulse", "Quiet Storm", "Raw Signal", "Neon Ritual". Must NOT contain any brand names.',
          },
          subtitle: {
            type: 'STRING',
            description: 'One sentence subtitle. Sets mood and intent. Max 12 words.',
          },
          visualDirection: {
            type: 'STRING',
            description: 'Specific artwork description. Include: style (minimal/bold/illustrated), key visual elements, color usage, composition. Must be producible with the specified print method. Do NOT reference any protected brand elements.',
          },
          whyItFitsBrand: {
            type: 'STRING',
            description: 'One sentence connecting this concept to the brand personality. Reference specific brand signals.',
          },
          copyDirection: {
            type: 'STRING',
            description: 'Optional. If the concept includes text, suggest a copy angle (not a specific phrase). Example: "Short imperative verb + noun format". Null if concept is graphic-only.',
            nullable: true,
          },
        },
        required: ['seedId', 'conceptName', 'subtitle', 'visualDirection', 'whyItFitsBrand'],
      },
    },
  },
  required: ['concepts'],
};
```

### 4.6 PDF Brand Guide Extractor（Call 2 变体）

当输入是 PDF 品牌手册时，使用单独的 prompt 替代 Call 1 + Call 2。

| 项目 | 值 |
|---|---|
| AiPrompt category | `brand-lens-pdf-extraction` |
| Model | **Gemini 2.5 Flash**（PDF 信息密度高） |
| 输入 | PDF file + optional user instruction |
| 输出 | 合并的 VisualExtraction + BrandSynthesis |
| 成本 | ~$0.008/call |

System Prompt:

```text
You are Custyle Brand Guide Analyzer. You extract structured brand intelligence from PDF brand guidelines for merchandise production.

PDF brand guides typically contain: logo usage rules, color palettes (with exact values), typography specifications, photography style, illustration guidelines, tone of voice, and do/don't sections.

EXTRACTION PRIORITIES:
1. Color values from palette pages are EXACT — use them as-is with extractionFidelity: "exact".
2. Font names from typography pages are EXACT — include the specific family name.
3. Logo usage rules inform logoDetection and rights constraints.
4. Do/Don't sections directly map to mustAvoid constraints.

RIGHTS SAFETY:
ownershipState controls permissions. Even with a brand guide PDF, do NOT assume the user owns this brand. Follow the provided ownershipState.

MERCH ORIENTATION:
For every extracted signal, consider: How does this translate to merchandise? A color that works on screen may not print well. A thin typeface may not embroider cleanly.

Return JSON only.
```

User Template:

```text
Extract brand intelligence from the attached PDF brand guide.

ownershipState: {{ownershipState}}
userInstruction: {{userInstruction | default: "none"}}

The PDF is attached as a document.
```

Schema: 使用合并的 VisualExtraction + BrandSynthesis schema（两个 schema 的 top-level properties merge 成一个）。

---

## 5. 被移除 / 推迟的 Prompt

### 5.1 Brand Constraints Compiler → 纯 TypeScript

原 spec 的 22.7 Brand Constraints Compiler 用 Gemini 把 BrandKit 各层转化为 mustUse/shouldUse/mustAvoid 约束。

**v1 改为纯 TypeScript 实现。** 理由：

1. Constraint 逻辑是确定性的：
   - 高置信度 exact 颜色 → mustUse
   - 中置信度 motif → shouldUse
   - 所有 protected elements → mustAvoid
   - 所有 print risk → mustAvoid
2. 规则完全可编码，不需要模型推理
3. 省一次 Gemini 调用（~$0.002 + ~1s）
4. 输出更稳定，不随模型版本变化

实现：

```typescript
function compileBrandConstraints(
  visual: VisualExtractionOutput,
  synthesis: BrandSynthesisOutput,
  merchOutput: MerchRuleOutputV1,
  riskReport: RiskReportArtifact,
): BrandConstraints {
  const mustUse: BrandConstraint[] = [];
  const shouldUse: BrandConstraint[] = [];
  const mustAvoid: BrandConstraint[] = [];

  // ── Colors ──
  visual.colorSystem.primary
    .filter(c => c.confidence >= 0.8 && c.extractionFidelity === 'exact')
    .forEach(c => mustUse.push({
      constraintId: `COLOR_MUST_${c.hex}`,
      type: 'color',
      instruction: `Use ${c.hex} as a primary color in the design.`,
      strength: 'hard',
      confidence: c.confidence,
      appliesTo: 'artwork',
    }));

  visual.colorSystem.accent
    .filter(c => c.confidence >= 0.6)
    .forEach(c => shouldUse.push({
      constraintId: `COLOR_SHOULD_${c.hex}`,
      type: 'color',
      instruction: `Consider using ${c.hex} as an accent color.`,
      strength: 'soft',
      confidence: c.confidence,
      appliesTo: 'artwork',
    }));

  // ── Visual Motifs ──
  visual.visualMotifs.forEach(motif => shouldUse.push({
    constraintId: `MOTIF_${motif.replace(/\s/g, '_')}`,
    type: 'motif',
    instruction: `Incorporate "${motif}" as a visual element.`,
    strength: 'soft',
    confidence: 0.65,
    appliesTo: 'concept',
  }));

  // ── Rights (ALWAYS hard) ──
  mustAvoid.push({
    constraintId: 'RIGHTS_DEFAULT_001',
    type: 'rights',
    instruction: 'Do not reproduce official logos, brand names, slogans, registered marks, or protected characters from the source.',
    strength: 'hard',
    confidence: 1.0,
    appliesTo: 'all',
  });

  if (riskReport.ownershipState === 'restricted') {
    riskReport.detectedProtectedElements.forEach(el => mustAvoid.push({
      constraintId: `RIGHTS_BLOCKED_${el.type}`,
      type: 'rights',
      instruction: `Specifically blocked: ${el.label ?? el.type}. Do not reference or reproduce.`,
      strength: 'hard',
      confidence: el.confidence,
      appliesTo: 'all',
    }));
  }

  // ── Print Safety ──
  visual.printSuitabilityNotes.forEach((note, i) => {
    if (note.includes('lost') || note.includes('fail') || note.includes('avoid')) {
      mustAvoid.push({
        constraintId: `PRINT_RISK_${i}`,
        type: 'print',
        instruction: note,
        strength: 'hard',
        confidence: 0.85,
        appliesTo: 'artwork',
      });
    }
  });

  // ── Archetype-specific avoid patterns ──
  const archetypeRule = CATEGORY_FIT_RULES.find(
    r => r.archetype === merchOutput.matchedArchetype
  );
  archetypeRule?.avoidPatterns.forEach(pattern => mustAvoid.push({
    constraintId: `ARCHETYPE_AVOID_${pattern}`,
    type: 'composition',
    instruction: `Avoid ${pattern.replace(/_/g, ' ')} — inconsistent with brand archetype.`,
    strength: 'soft',
    confidence: 0.7,
    appliesTo: 'concept',
  }));

  return { mustUse, shouldUse, mustAvoid };
}
```

### 5.2 Brand Consistency Checker → 推迟 v1.1

原 spec 的 22.8 prompt 在 v1 不需要：

- v1 的核心 flow 是 Brand Lens → Create Flow，不需要回评
- Consistency Check 需要 artwork 生成完成后才能运行
- v1 先跑通闭环，v1.1 再加回评 + refine loop

v1.1 恢复时，可以使用原 spec 22.8 的 prompt，但需调整：

```
- designMode 判定 → v1.1 引入
- dynamic weights → v1.1 引入
- 用 Flash（非 Lite）做 consistency check，因为需要 cross-reference 多层信号
```

---

## 6. Node Prompt Patches

### 6.1 与原 spec 的差异

原 spec 假设 workflow-contracts 已实现，patch 格式是 "When brandContext is provided, compile into intentContract.brandContext and node3Payload.constraints"。

实际情况：workflow-contracts 尚未实现。v1 通过 `externalContexts.brand` 直接传 JSON。

### 6.2 Design Graph 入口 Patch

```text
## Brand Context Injection

When externalContexts.brand is present, it contains a Brand Style Kit from Custyle Brand Lens.

CONSUMPTION RULES:
1. Treat externalContexts.brand as a FIRST-CLASS input. Do not re-analyze the brand.
2. Do not overwrite or discard brand context.

PRIORITY ORDER (highest first):
1. Explicit user instruction in this turn
2. Hard brand constraints (constraints.mustUse, constraints.mustAvoid)
3. Selected Brand Lens concept (selectedConcept)
4. Product/category selections from user
5. Soft brand preferences (constraints.shouldUse)
6. General creative inference

RIGHTS ENFORCEMENT:
If externalContexts.brand.ownershipState is "style_reference" or "restricted":
- NEVER use official logo, brand name, slogan, registered mark, mascot, or protected character
- NEVER imply official collaboration or endorsement
- Create ORIGINAL designs inspired by the brand mood and visual language
- Check constraints.mustAvoid for specifically blocked elements
```

### 6.3 Artwork Generation Patch

对齐 Custyle 现有的 designDescription 6-field 格式：

```text
## Brand-Guided Artwork Generation

When brand constraints are provided via externalContexts.brand:

DESIGN DESCRIPTION MAPPING:
- subject: Derive from selectedConcept.visualDirection. Must be original, not a reproduction.
- action_or_state: Align with brand essence.emotionalCore.
- style_and_modifiers: Use brand colorPalette hex codes as "Hex Code [CODE]". Apply visual motifs.
- composition_and_framing: Follow selectedConcept.placement constraints.
- environment_or_background: "isolated" unless concept specifies otherwise.
- technical_specs: "FOCUS SOLELY ON THE ISOLATED GRAPHIC ARTWORK. No product mockups, no garments, no human models."

MANDATORY CONSTRAINTS:
- Use ONLY colors from externalContexts.brand.colorPalette
- Respect all constraints.mustAvoid entries
- Keep artwork print-ready for the specified printMethod
- Ensure minimum contrast ratio for readability

FORBIDDEN:
- Unauthorized official logos or brand marks
- Fake brand marks that resemble the source brand
- Protected slogans, characters, or trademarks
- Product mockups inside isolated artwork
- Complex full-background scenes unless concept explicitly requires
```

### 6.4 Product Match Patch

```text
## Brand-Guided Product Selection

When externalContexts.brand contains colorGarmentPairings:

1. Use colorGarmentPairings as PRIMARY source for product color selection.
2. Match garmentBaseColor.catalogColorName to Printful product catalog.
3. Prefer pairings where:
   - contrastRatio >= 4.5 (for text-containing designs)
   - contrastRatio >= 3.0 (for graphic-only designs)
   - printMethodCompatibility for the target method = "good"
4. If no perfect match, find closest catalog color by hex distance.
5. Never select a garment color that creates a visualRisk of "low_contrast" with the print colors.
```

### 6.5 Scene Preview Patch

```text
## Brand-Guided Scene Styling

When externalContexts.brand is present, use it to influence scene generation:

- Scene mood should reflect brand essence.emotionalCore
- Background tone should complement brand colorSystem
- Composition style should align with brand layoutComposition
- Product styling should match brand textureMaterialLanguage

Do NOT reproduce source brand visual assets in the scene.
Keep scene as original lifestyle/product photography that happens to match the brand's aesthetic.
```

---

## 7. Prompt 管理与测试

### 7.1 AiPrompt 表注册

```sql
INSERT INTO ai_prompts (type, category, prompt, model, config, active)
VALUES
  ('SYSTEM', 'brand-lens-visual-extraction',    '...', 'gemini-2.5-flash-lite', '{}', true),
  ('SYSTEM', 'brand-lens-brand-synthesis',       '...', 'gemini-2.5-flash',      '{}', true),
  ('SYSTEM', 'brand-lens-concept-narrative',     '...', 'gemini-2.5-flash-lite', '{}', true),
  ('SYSTEM', 'brand-lens-pdf-extraction',        '...', 'gemini-2.5-flash',      '{}', true);
```

### 7.2 Prompt 版本管理

v1 暂不做 prompt 版本化（AiPrompt 表没有 version 字段）。

策略：
- 通过 `active` 字段切换新旧 prompt
- 重要变更在 git 中记录 diff
- v1.1 可以加 version + A/B test 支持

### 7.3 Prompt 质量评估

每次 prompt 变更后，跑 15 品牌测试集：

```typescript
interface PromptEvalResult {
  brandUrl: string;
  callType: 'visual_extraction' | 'brand_synthesis' | 'concept_narrative';

  // Call 1 质量
  colorAccuracy: number;        // 1-5 (CSS exact vs output)
  fontCategoryAccuracy: number; // 1-5
  motifRelevance: number;       // 1-5
  printNoteUsefulness: number;  // 1-5

  // Call 2 质量
  essenceAccuracy: number;      // 1-5 ("它懂这个品牌吗？")
  axisConsistency: number;      // 1-5 (跨 run 一致性)
  voiceRelevance: number;       // 1-5
  riskDetectionAccuracy: number;// 1-5
  copyDirectionOriginality: number; // 1-5 (是否抄袭了原品牌 slogan)

  // Call 3 质量
  conceptNameCreativity: number;    // 1-5
  visualDirectionSpecificity: number; // 1-5
  conceptProducibility: number;     // 1-5

  // 系统指标
  schemaComplianceRate: number;     // 0-1 (JSON 解析成功率)
  latencyMs: number;
  tokenCount: number;

  notes: string;
}
```

通过标准：
- schemaComplianceRate >= 0.98
- 所有 1-5 评分项平均 >= 3.5
- colorAccuracy >= 4.0（因为有确定性信号兜底）
- riskDetectionAccuracy >= 4.0（安全底线）
- 跨 3 次 run 的 axisConsistency >= 3.5

---

## 8. 汇总：原 Spec 每条 prompt 的具体变更

### 8.1 通用系统约束（原 22.1）

| 原文 | 变更 | 理由 |
|---|---|---|
| "Output valid JSON only." | **保留** → 内嵌到每个 prompt 末尾 | 不变 |
| "Never invent unsupported brand facts." | **保留** → 内嵌 | 不变 |
| "Every major claim must reference evidenceIds when possible." | **改为** "include confidence scores" | 2-call 架构无预分配 evidenceId |
| "Deterministic signals override visual guesses." | **升级** → Ground Truth Protocol（5 条具体规则）| 原文太模糊 |
| "Do not authorize ownership." | **保留** → Rights Safety Protocol | 不变 |
| "For style_reference or restricted mode..." | **保留** → 内嵌 | 不变 |
| "Translate brand style into merch-ready constraints." | **改为** schema 中 merch-oriented description | 指令下沉到字段级 |
| "Use confidence scores." | **保留** → schema 中 confidence 字段 | 不变 |
| "Separate visual inspiration from protected identity." | **保留** → Rights Safety Protocol | 不变 |

### 8.2 Brand Essence Compiler（原 22.2）→ 合并入 Call 2

| 原文规则 | 去向 |
|---|---|
| "compile Layer 1: Brand Essence from RawSignals" | Call 2 essence 部分 |
| "identify emotional core, who it speaks to" | Call 2 schema: emotionalCore, audienceHypothesis |
| "every field must include evidenceIds" | **改为** confidence score only |
| "if evidence weak, mark confidence below 0.6" | **保留** → Call 2 schema description |
| "keep result useful for merch generation" | **保留** → Call 2 schema 各字段 description |

**新增**：personality axes calibration anchors（原 spec 没有）

### 8.3 Brand Expression Compiler（原 22.3）→ 重写为 Call 1

| 原文规则 | 状态 |
|---|---|
| "deterministic signals override model guesses" | **升级** → Ground Truth Protocol |
| "CSS variables, computed styles more reliable than visual estimates" | **升级** → schema 中每个 color 字段的 description |
| "vision-derived hex values must not be treated as exact" | **升级** → "NEVER estimate hex from screenshot" in schema description |
| "if exact fonts not available, classify category" | **保留** → fontCategory field + description |
| "detected logos not automatically allowed" | **保留** → logoDetection.riskFlag |
| "keep print visibility, readability in mind" | **升级** → printSuitabilityNotes field 独立输出 |

**新增**：
- textureMaterialLanguage（原 spec 有定义但 prompt 未提及）
- merchCompositionHints（从 layout 推导 merch 含义）
- extractionFidelity 三级分类（exact/algorithmic_stable/model_inferred）

### 8.4 Brand Voice Compiler（原 22.4）→ 合并入 Call 2

| 原文规则 | 去向 |
|---|---|
| "do not invent official slogans" | Call 2 system prompt + schema description |
| "do not copy third-party slogans" | Call 2: mustAvoidPhrases + recommendedCopyDirections 的 description |
| "identify tone, vocabulary patterns" | Call 2 schema: tone, vocabularyPatterns |
| "provide copy directions, not final slogans" | **强化** → schema description 明确 "ORIGINAL suggestions, NOT copies" |
| "evaluate whether voice is wearable on merch" | Call 2: merchCopySuitability |

### 8.5 Brand Context Enricher（原 22.5）→ 合并入 Call 2

| 原文规则 | 去向 |
|---|---|
| "use search-grounded context only when provided" | **移除** → v1 不使用 search grounding |
| "do not recommend copying competitor assets" | Call 2: rights safety protocol |
| "focus on what context means for merch" | Call 2 schema: categoryConventions description |

### 8.6 Merch Translation Writer（原 22.6）→ 重写为 Call 3

| 变更 | 说明 |
|---|---|
| 角色从 "turn rule engine output into merch directions" → "write narratives for concept seeds" | 职责缩小：Rule Engine 的完整输出已包含 category/color/placement，模型只写故事 |
| 移除 "include category, base color, placement, artwork style, print method" 要求 | 这些来自 seed，不需要模型生成 |
| 新增 conceptName, subtitle, visualDirection, whyItFitsBrand 的具体格式要求 | 这是模型的唯一职责 |
| 保留 "do not override rule engine decisions" | **强化** → system prompt 第一句 |
| 保留 "respect ownershipState" | 不变 |

### 8.7 Brand Constraints Compiler（原 22.7）→ 删除

整体替换为 TypeScript 函数 `compileBrandConstraints()`（见 § 5.1）。

理由：约束生成逻辑 100% 确定性，不需要模型推理。

### 8.8 Brand Consistency Checker（原 22.8）→ 推迟 v1.1

保留原 prompt 设计，v1.1 恢复时调整：
- 使用 Flash（非 Lite）
- 加入 designMode 判定
- 加入 dynamic weights

### 8.9 Node Prompt Patches（原 23.1-23.3）→ 重写

| 原文 | 变更 |
|---|---|
| "compile into intentContract.brandContext and node3Payload.constraints" | → "read from externalContexts.brand" |
| 未提及 designDescription 6-field format | → 新增 designDescription mapping 指引 |
| 未提及 Printful catalog 映射 | → 新增 catalogColorName matching 指引 |
| 未提及 Scene Preview | → 新增 Scene Preview patch |

---

## 9. Token 成本总结

| Prompt | System Prompt Tokens | Schema Tokens (est.) | User Input Tokens (est.) | Output Tokens (est.) | Model | Cost/call |
|---|---|---|---|---|---|---|
| Call 1: Visual Extraction | ~180 | ~600 | ~400 + images ~520 | ~800 | Flash-Lite | ~$0.002 |
| Call 2: Brand Synthesis | ~250 | ~500 | ~600 | ~900 | Flash | ~$0.005 |
| Call 3: Concept Narrative | ~150 | ~200 | ~300 | ~500 | Flash-Lite | ~$0.001 |
| PDF Extraction | ~200 | ~900 | ~200 + PDF tokens | ~1500 | Flash | ~$0.008 |

**总计（URL 输入）：3 calls = ~$0.008/run**  
**总计（PDF 输入）：1 call = ~$0.008/run**

加上 Firecrawl ($0.005) 和 Brandfetch (free)：
- URL flow 总成本：**~$0.013/run**
- PDF flow 总成本：**~$0.008/run**

### 9.1 Context Caching 优化（可选）

Gemini 支持 system prompt context caching（缓存后输入 token 成本降 75%）。

对于高频使用场景（>100 runs/day），可以为 Call 1 和 Call 2 开启 context caching：

```typescript
// 创建 cached context（每次 prompt 更新后重建）
const cachedContext = await gemini.createCachedContent({
  model: 'gemini-2.5-flash-lite',
  systemInstruction: visualExtractionSystemPrompt,
  ttl: '86400s',  // 24 hours
});

// 使用 cached context 调用
const result = await gemini.generateContent({
  cachedContent: cachedContext.name,
  contents: [{ role: 'user', parts: [...images, { text: userPrompt }] }],
  generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
});
```

预估节省：system prompt tokens 从 $0.0002 降到 $0.00005/call。对单次调用影响微小，但高频场景累积显著。

---

## 10. 实施 Checklist

```
Phase 0 (Spike):
  □ 将 Call 1 system prompt + schema 实装到测试脚本
  □ 跑 5 个 URL 验证 schema compliance rate
  □ 验证 Ground Truth Protocol 是否有效（CSS hex 是否被保留）
  □ 验证 logoDetection.riskFlag 准确率

Phase 1:
  □ 注册 4 个 AiPrompt 到数据库
  □ 实装 Call 1 (Flash-Lite) + Call 2 (Flash) parallel
  □ 实装 PDF Extraction (Flash) 单 call
  □ 实装 compileBrandConstraints() TypeScript 函数
  □ 跑 15 品牌完整评估

Phase 2:
  □ 实装 Call 3 Concept Narrative Writer
  □ 验证 concept quality（name creativity, visual direction specificity）
  □ 端到端测试：URL → Brand Kit → Concept → Create Flow

Phase 3:
  □ 注入 Node Prompt Patches 到现有 design graph prompts
  □ 验证 designDescription 6-field format 对齐
  □ 验证 Printful catalog color matching

Phase 0 额外验证 (来自 late-stage 研究):
  □ 验证 Call 2 thinking mode 是否提升 axes 评分稳定性
  □ 验证 temperature=0 vs 0.3 对 axes 评分一致性的影响
  □ 验证 Safe Abstraction Patterns 是否有效阻断品牌名泄漏
  □ 跑 3 次同一 brand 验证 axes 标准差 < 0.2
```

---

## 11. 附录：Late-Stage 研究补充

以下发现在主文档完成后由额外研究 agent 返回，已回溯整合到 § 1.2、§ 1.3、§ 1.7、§ 2.2、§ 3.2。此处汇总记录。

### 11.1 DESIGN.md 模式 (Google Labs)

DESIGN.md 使用 **双层格式**：YAML front matter 提供机器可读 token（hex, font stacks, spacing），prose 段落解释设计意图。核心模式：**"Tokens 给 agent 精确值。Prose 告诉它们 WHY。"**

**对 Brand Lens 的启发**：我们的 Schema-first 设计完全对齐此模式——schema `description` 承载 WHY，字段值承载 WHAT。

### 11.2 Dembrandt 无 LLM

Dembrandt 是**纯确定性**工具——无 LLM prompt。Playwright 渲染 → computed DOM styles → confidence 评分 → DTCG token 输出。LLM 只作为 MCP wrapper 调用入口。

**验证了我们的架构决策**：确定性信号提取不需要模型，模型只用于定性分析。

### 11.3 Ground Truth Override 最佳实践

研究显示"分离观察与推理"（Charts-of-Thought）最有效：

```
不好的做法：
  "Do not use the image to extract colors."
  → 模型仍然倾向于从图片中推测颜色

好的做法：
  "Image = SOURCE OF INTENT (mood, hierarchy, composition).
   CSS data = SOURCE OF FACTS (hex, font-family)."
  → 给每种输入一个正向角色，模型执行得更准确
```

已回溯整合到 § 1.2 Ground Truth Protocol 和 § 2.2 Call 1 System Prompt。

### 11.4 DALL-E IP 安全模式

从泄露的 DALL-E system prompt 中提取的 3 个可复用模式：

1. **Named-entity substitution**: 不提及品牌名，改用抽象品质描述
2. **Style deflection**: 不模仿品牌资产，改用 (a) 三个形容词 + (b) 设计运动 + (c) 材质感
3. **Likeness avoidance**: 不描述角色身份，改用角色类型

已回溯整合到 § 1.3 Rights Safety Protocol 的 Safe Abstraction Patterns。

### 11.5 Personality 评分一致性

ACL 2025 研究发现：
- **Forced-choice 优于 Likert scale** — 对 temperature 更不敏感
- **关键词锚点优于长段描述** — 简洁的 anchor 比详细 rubric 更一致
- **temperature=0 + 3 次平均** 是 gold standard

已回溯整合到 § 1.7（temperature=0 + 可选 3-pass 平均）和 § 3.3（calibration anchors 用简洁关键词格式）。

### 11.6 JSON Schema vs 推理质量

Gemini 的 JSON Schema constrained decoding 降低推理质量 ~11%。

对策矩阵：

| Call | 推理需求 | Schema Enforcement | Thinking Mode | Temperature |
|---|---|---|---|---|
| Call 1: Visual Extraction | 低（事实提取）| ✅ 使用 | ❌ 不需要 | 0 |
| Call 2: Brand Synthesis | **高（品牌推理）** | ✅ 使用 | ✅ `thinkingBudget: 2048` | 0 |
| Call 3: Concept Narrative | 中（创意写作）| ✅ 使用 | ❌ 不需要 | 0.7 |
| PDF Extraction | 中高 | ✅ 使用 | ✅ `thinkingBudget: 1024` | 0 |

已回溯整合到 § 1.7 Generation Config。

# Brand Lens v1 — Final Implementation Spec

版本：v1.0 Final  
日期：2026-05-12  
定位：Safe Brand-to-Merch Compiler  
状态：Implementation-Ready  
基于：v1.1 Draft Spec + 6 方向技术调研 + Custyle 现有架构对齐

---

## 0. Executive Summary

### 0.1 一句话定义

**Brand Lens 把用户输入的 URL、图片、Logo、PDF 品牌手册，安全地编译成可被 Custyle Create Flow、Product Match、Scene Preview 消费的 Brand Style Kit 与 Merch Translation。**

行业定位：**Brand-to-Merch Compiler**  
竞争空白：市场上无人做 brand extraction → merch direction 的端到端闭环。

### 0.2 命名规范

| 面向 | 名称 |
|---|---|
| 用户侧产品名 | **Brand Lens** |
| 技术内部模块名 | **BrandDNA Module** |
| 用户侧输出名 | **Brand Style Kit** |
| 内部 artifact 类型 | `BrandKitArtifact` |
| 风险报告 artifact | `RiskReportArtifact` |

### 0.3 核心差异化

> Claude Design helps brands make on-brand digital assets.  
> Custyle Brand Lens helps styles become safe, original, production-ready merch.

Google DESIGN.md 是品牌规格的新兴标准格式，但它是静态规格文件。Brand Lens 是动态提取 + 安全翻译 + 商品方向生成的运行时系统。

### 0.4 v1 证明一个闭环

```
用户给一个 URL / 图片 / PDF
  → 3-tier 信号提取（CSS exact → node-vibrant cluster → Gemini vision）
  → 2 次 Gemini 调用（visual extraction + brand synthesis）
  → Merch Rule Engine（15-20 条硬编码规则）
  → 输出 Brand Style Kit + 4 个可生产商品方向
  → 用户选择方向 → 进入 Create Flow
  → 通过 Rights Gate / Print Gate
```

### 0.5 v1 第一性原则

1. **确定性信号优先**：hex 值只从 CSS/computed style/color cluster 来，不从 vision model 猜。
2. **安全默认**：默认 `style_reference`，不公开 ownership 声明。
3. **规则引擎主导商品决策**：Gemini 只写 narrative，不做 merch 逻辑。
4. **Print Gate 是硬闸**：高 Brand Fit 不能掩盖生产不可行。
5. **渐进式输出**：5 秒内出 fast snapshot，不让用户等黑盒。
6. **可追溯**：每个信号标记 extractionFidelity + evidenceIds。

---

## 1. 用户场景

### 1.1 场景 A：Founder / Creator Merch

> 我刚创业，想给团队、客户、社区做一批高质量周边。

- 有官网、logo、deck 或 brand guide
- 默认 `style_reference`，logo 只作视觉参考
- 推荐：Minimal founder tee, Launch hoodie, Community sticker pack, Customer gift tote

### 1.2 场景 B：Brand-Inspired Self Expression

> 我喜欢这个 vibe，帮我做点 my own 的东西。

- 不拥有品牌，想借鉴审美
- `style_reference` / `restricted`，剥离 logo/name/slogan
- 推荐：Vibe tee, Aesthetic hoodie, Moodboard sticker, Graphic tote

### 1.3 场景 C：Brand Discovery / Pre-launch

> 我还没有完整品牌系统，有几张参考图和关键词，帮我定方向然后做商品。

- 输入混合：图片 + 文字 + 竞品 URL
- 创建 provisional Brand Style Kit
- 推荐：4 个商品方向用于验证品牌风格

---

## 2. 安全边界

### 2.1 Ownership State

```typescript
type OwnershipStateV1 =
  | 'style_reference'    // 默认。借鉴风格，不复制 logo/name/slogan/mark
  | 'restricted'         // 检测到知名品牌/高风险 IP。只能做抽象风格参考
  | 'verified_owned_internal';  // 仅内部白名单/B2B 人工审核。v1 公共产品不开放
```

### 2.2 状态机

```
默认 → style_reference
检测到 known brand（via Brandfetch API）/ high-risk IP → restricted
内部白名单 + 人工审核 → verified_owned_internal
```

### 2.3 style_reference 允许 vs 禁止

允许：抽象颜色氛围、字体类别、构图语言、视觉情绪、非保护性图形语言、通用文化气质。

禁止：官方 logo、品牌名、slogan、注册商标、专有角色、官方 mascot、暗示合作或官方授权。

### 2.4 restricted 触发条件

```
Known trademark match（via Brandfetch lookup）
Famous brand logo detected（via Gemini vision）
Protected character detected
Sports league / team mark detected
Entertainment IP detected
Luxury / streetwear trademark detected
User instruction explicitly asks to copy brand assets
```

### 2.5 明确阻断

```
用户上传 Nike logo + 勾选 "我拥有版权" → 系统仍然保持 style_reference / restricted
```

v1 不向公共用户暴露 `owned` 状态。

---

## 3. 系统架构

### 3.1 顶层结构

```
User Input (URL / Image / PDF / Text)
  │
  ├── Stage 0: Preflight ─────────────────────── 安全检查 + 输入分类
  │
  ├── Stage 1: Source Ingestion (3-tier) ──────── 确定性信号提取
  │     ├── Tier 1: HTTP fetch + CSS parse         (~200ms, free)
  │     ├── Tier 2: Firecrawl render + screenshot  (~5-8s, $0.005)
  │     └── Tier 3: node-vibrant color cluster     (~100ms, free)
  │
  ├── Stage 2: Brand Intelligence (2 Gemini calls, parallel)
  │     ├── Call 1: Visual Extraction              (Flash-Lite, from screenshot + images)
  │     └── Call 2: Brand Synthesis                (Flash, from text + metadata + Call 1 summary)
  │
  ├── Stage 3: Risk Assessment ────────────────── Brandfetch lookup + Gemini 检测合并
  │
  ├── Stage 4: Merch Rule Engine ──────────────── 纯 TypeScript 规则，不用模型
  │     ├── archetype matching
  │     ├── category fit scoring
  │     ├── color-garment pairing
  │     ├── placement strategy
  │     └── print method compatibility
  │
  ├── Stage 5: Concept Generation ─────────────── 4 concepts + Gemini Flash-Lite narrative
  │
  └── Stage 6: Brand Portrait Finalize ────────── UI view model + save-lite
```

### 3.2 与 Custyle 现有架构的集成点

```
Brand Lens Module (新建)
  │
  ├── 使用: @google/genai SDK (已有 google-genai.service.ts)
  ├── 使用: PostgreSQL + Prisma (新建 brand_kits 表)
  ├── 使用: Valkey pub/sub (SSE progressive reveal)
  ├── 使用: Printful product catalog (已有 SKU + color hex mapping)
  │
  ├── 输出: BrandContextInputV1 JSON
  │     ├── → Create Domain: 注入 design graph 的 externalContexts
  │     ├── → Product Match: ColorGarmentPairing 指导产品选色
  │     └── → Scene Preview: brand mood 影响场景风格
  │
  └── 不依赖: workflow-contracts (尚未实现，直接传 JSON)
```

### 3.3 技术选型

| 组件 | 选择 | 理由 |
|---|---|---|
| URL 渲染 | **Firecrawl API** | 比自建 Playwright 省运维，$0.005/page，自带反检测，返回 screenshot + metadata |
| CSS 提取 | **自写 HTTP fetch + CSS parse** | Tier 1 快速路径，纯 Node.js，零成本，成功率 ~60-70% |
| 色彩聚类 | **node-vibrant** | 语义化 6 swatch（Vibrant/Muted/Dark*/Light*），比 color-thief 更适合品牌设计场景 |
| 视觉分析 | **Gemini 2.5 Flash-Lite** | $0.10/M input，结构化 JSON 输出可靠，multimodal 原生 |
| 品牌合成 | **Gemini 2.5 Flash** | synthesis 需更强推理，Flash 贵 3x 但质量显著优于 Lite |
| Narrative 生成 | **Gemini 2.5 Flash-Lite** | 写文案不需要强推理，成本最低 |
| Merch 规则 | **硬编码 TypeScript** | 可测试、可调试、确定性、不依赖模型幻觉 |
| Known brand 检测 | **Brandfetch API (free tier)** | 500K req/mo 免费，返回 logo/color/font/industry，比自建品牌库可靠 |
| 字体检测（URL）| **Playwright getComputedStyle** | Firecrawl 渲染后提取 font-family，精确可靠 |
| 字体检测（图片）| **分类而非识别** | v1 只输出字体类别（serif/sans/display），不编造具体字体名 |
| 存储 | **PostgreSQL + Prisma** | 现有基础设施，brand_kits 表存 JSONB artifact |
| 进度推送 | **Valkey pub/sub → SSE** | 现有基础设施，前端消费 SSE 做 progressive reveal |

### 3.4 成本预估

```
每次 Brand Lens Run:
  Firecrawl:                    $0.005
  Gemini Flash-Lite (visual):   $0.002
  Gemini Flash (synthesis):     $0.005
  Gemini Flash-Lite (narrative):$0.001
  Brandfetch:                   free (500K/mo)
  node-vibrant:                 free
  ─────────────────────────────
  Total:                        ~$0.013/run

  1,000 runs/month = $13
  10,000 runs/month = $130
```

---

## 4. Source Ingestion Layer

### 4.1 输入类型

```typescript
type BrandLensInputTypeV1 =
  | 'url'
  | 'single_image'
  | 'multi_image'        // 最多 5 张
  | 'pdf_brand_guide'
  | 'plain_text_modulation';

// v1 不支持
type DeferredInputType =
  | 'video' | 'reel' | 'social_handle'
  | 'music_playlist' | 'pinterest_board';
```

### 4.2 输入角色

```typescript
type SourceRole =
  | 'base'               // 主要风格来源，如官网
  | 'reference'           // 辅助风格来源，如 moodboard
  | 'modulation'          // 调制指令，如 "更年轻一点"
  | 'constraint'          // 硬约束，如 "只能黑白"
  | 'negative_reference'; // 反向参考，如 "不要这么 corporate"
```

### 4.3 URL 输入：3-Tier 降级策略

不使用 URL Ingestion Router（5 种 mode 过重）。v1 采用固定 3-tier 降级：

#### Tier 1: HTTP Fetch + CSS Parse（~200ms, free）

```typescript
interface Tier1Result {
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  themeColor: string;
  favicon: string;
  cssVariables: Record<string, string>;  // --color-primary, --font-heading, etc.
  fontFaceDeclarations: string[];        // @font-face families
  googleFontsLinks: string[];            // href from <link>
  h1Text: string[];
  status: 'sufficient' | 'insufficient';
}
```

实现：

```typescript
async function tier1HttpFetch(url: string): Promise<Tier1Result> {
  // 1. HTTP GET with timeout 5s
  // 2. Parse HTML: <meta>, <link>, <style>, <h1>-<h3>
  // 3. Parse CSS files: extract :root { --* } variables
  // 4. Detect @font-face and Google Fonts links
  // 5. Determine sufficiency: has colors + has fonts = sufficient
  // If sufficient, skip Tier 2 (save $0.005 and 5-8s)
}
```

成功率估计：

| 网站类型 | Tier 1 成功率 |
|---|---|
| Design-system-driven SaaS | ~80% |
| WordPress + theme framework | ~50% |
| Tailwind CSS sites | ~20%（颜色在 utility classes） |
| Legacy / enterprise | ~15% |
| SPA (React/Vue) | ~5% |

#### Tier 2: Firecrawl Render（~5-8s, $0.005/page）

仅当 Tier 1 status = 'insufficient' 时触发。

```typescript
interface Tier2Result {
  screenshotDesktop: Buffer;   // 1280x800 viewport
  screenshotMobile: Buffer;    // 390x844 viewport
  computedStyles: {
    headerFontFamily: string;
    bodyFontFamily: string;
    headerColor: string;       // hex
    bodyColor: string;         // hex
    backgroundColor: string;   // hex
    ctaColor: string;          // hex
    ctaTextColor: string;      // hex
    linkColor: string;         // hex
  };
  visibleText: string;         // truncated to 2000 chars
  navItems: string[];
  ctaTexts: string[];
}
```

Firecrawl 替代自建 Playwright 的理由：

```
✓ 自带 anti-bot / Cloudflare bypass
✓ 托管基础设施，无需维护 headless browser
✓ 返回 screenshot + metadata 一体化
✓ $0.005/page，比 Browserless ($0.01+) 更便宜
✗ 如果 Firecrawl 也被阻断 → 降级为 screenshot_required
```

#### Tier 3: node-vibrant Color Cluster（~100ms, free）

对 Tier 2 的 screenshotDesktop 运行 node-vibrant。

```typescript
interface Tier3Result {
  vibrant: Swatch | null;
  muted: Swatch | null;
  darkVibrant: Swatch | null;
  darkMuted: Swatch | null;
  lightVibrant: Swatch | null;
  lightMuted: Swatch | null;
}

interface Swatch {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  population: number;  // pixel count
}
```

#### 信号合并优先级

```
CSS variables / computed styles (exact)         → 最高优先
  > node-vibrant color cluster (algorithmic)    → 次高优先
  > Gemini vision inference (model_inferred)    → 仅用于定性信号
```

**铁律：Vision 模型猜的 hex 不进入 ColorToken。** ColorBench 测试显示 VLM 颜色准确率仅 ~49%。

### 4.4 Image 输入处理

```
Image(s)
  ├── node-vibrant → 6 semantic swatches
  ├── Gemini Flash-Lite vision → composition, imagery style, mood, logo detection, risk
  └── OCR (Gemini built-in) → detected text for voice analysis
```

### 4.5 PDF Brand Guide 输入处理

```
PDF
  ├── Gemini Flash (PDF native support) → structured extraction:
  │     color palette table
  │     typography section
  │     logo usage section
  │     do/don't section
  │     photography style
  │     tone of voice
  └── node-vibrant on rendered pages → supplementary color validation
```

PDF 输入使用 Gemini Flash（非 Lite），因为 PDF 品牌手册信息密度高，需要更强推理。

### 4.6 URL 安全限制

```typescript
const URL_BLOCKLIST = {
  protocols: ['file:', 'ftp:', 'data:', 'javascript:'],
  ipRanges: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  hosts: ['localhost', '0.0.0.0'],
};

const URL_LIMITS = {
  maxRedirects: 5,
  maxResourceSize: '10MB',
  maxPageSize: '25MB',
  timeoutMs: 15000,
};
```

---

## 5. Brand Intelligence：2 次 Gemini 调用

### 5.1 为什么 2 次而非 4 次

原 spec 设计 4 个 parallel compiler（essence/expression/voice/context）。研究后认为 2 次更优：

| 对比项 | 4 parallel | 2 parallel |
|---|---|---|
| Gemini 调用次数 | 4 | 2 |
| 延迟 | max(4 calls) ≈ 3-5s | max(2 calls) ≈ 2-4s |
| 成本 | ~$0.008 | ~$0.004 |
| 冲突合并 | 需要 Signal Normalizer 合并 4 组输出 | 天然不冲突 |
| 上下文 | 每个 compiler 只看部分信号 | 每个 call 看完整相关上下文 |

分工逻辑：

```
Call 1: Visual Extraction — 从 screenshot + images 提取视觉信号
  输入 = 确定性信号（CSS colors/fonts）+ screenshot + user images
  输出 = colorSystem, typographySystem, imageryStyle, visualMotifs, layoutComposition, logoDetection

Call 2: Brand Synthesis — 从 text + metadata + Call 1 摘要提取语义信号
  输入 = meta text + DOM text + OG data + Call 1 output summary
  输出 = essence, voice, context, riskAssessment
```

两个 call **并行发起**，因为 Call 2 不依赖 Call 1 的完整结果——它使用的是 Tier 1/2 已经提取的 text/metadata，加上一份 "visual signal summary"（颜色列表 + 字体类别，这些在 Tier 1-3 后已经有了）。

### 5.2 Call 1: Visual Extraction Prompt

```
Model: Gemini 2.5 Flash-Lite
Input: screenshot(s) + user images + deterministic signals JSON
Output: Structured JSON (enforced schema)
```

System prompt:

```text
You are Custyle Brand Visual Extractor.

Your job is to analyze visual brand signals from screenshots and images,
and compile them into a structured Brand Expression profile.

You receive two types of input:
1. deterministicSignals: CSS-extracted colors, fonts, and metadata. These are GROUND TRUTH.
2. visualInputs: screenshots and/or user-uploaded images for qualitative analysis.

Rules:
1. Output valid JSON matching the provided schema.
2. NEVER override deterministic color hex values with your own guesses.
   If CSS says the primary color is #7E45F2, use #7E45F2.
3. You MAY supplement deterministic signals with visual observations:
   - Identify colors visible in images that CSS did not capture
   - Classify typography style (serif/sans/display/script) when exact font is unknown
   - Describe imagery style, composition, visual motifs, texture language
4. For each supplementary observation, set extractionFidelity to 'model_inferred' and confidence < 0.7.
5. Detect logo/mark presence but do NOT authorize reproduction.
6. Flag potential protected elements (known brand logos, characters, trademarks).
7. Evaluate print suitability: contrast, line weight, small-size readability.
8. Keep all observations oriented toward merch production, not web design.

Return JSON only.
```

User template:

```text
Analyze the visual brand signals from the following inputs.

ownershipState: {{ownershipState}}
userInstruction: {{userInstruction}}

Deterministic signals (GROUND TRUTH, do not override):
{{deterministicSignalsJson}}

Visual inputs are attached as images.

Output schema:
{{visualExtractionSchema}}
```

### 5.3 Call 2: Brand Synthesis Prompt

```
Model: Gemini 2.5 Flash
Input: text signals + metadata + visual signal summary (from Tier 1-3, not Call 1)
Output: Structured JSON (enforced schema)
```

System prompt:

```text
You are Custyle Brand Synthesis Engine.

Your job is to compile Brand Essence, Voice, and Context from textual and metadata signals,
combined with a visual signal summary.

You produce:
1. Brand Essence: personality axes, emotional core, positioning, audience hypothesis
2. Brand Voice: tone, vocabulary patterns, copy directions, merch copy suitability
3. Brand Context: category, audience profile, cultural references, category conventions
4. Risk Assessment: detected protected elements, recommended ownership state

Rules:
1. Output valid JSON matching the provided schema.
2. Use only provided signals. Never invent brand facts.
3. Every claim must include confidence score.
4. For style_reference/restricted: treat brand names, slogans, marks as evidence only, not as usable creative material.
5. Do not authorize official brand usage.
6. Copy directions must be original suggestions inspired by the brand's tone, not reproductions of existing slogans.
7. If evidence is weak, mark confidence below 0.6 and phrase as hypothesis.
8. Personality axes use -1 to 1 scale.
9. Focus on what matters for merch: wearability, giftability, audience resonance.

Return JSON only.
```

User template:

```text
Compile Brand Essence, Voice, Context, and Risk Assessment.

ownershipState: {{ownershipState}}
userInstruction: {{userInstruction}}

Text signals:
{{textSignalsJson}}

Visual signal summary:
{{visualSummaryJson}}

Output schema:
{{brandSynthesisSchema}}
```

### 5.4 Call 1 输出 Schema

```typescript
interface VisualExtractionOutput {
  colorSystem: {
    primary: ColorToken[];
    secondary: ColorToken[];
    accent: ColorToken[];
    neutrals: ColorToken[];
    backgrounds: ColorToken[];
    textColors: ColorToken[];
    ctaColors: ColorToken[];
    colorMood: string[];           // e.g. ["electric", "futuristic", "warm"]
  };

  typographySystem: {
    detectedFonts: FontToken[];
    headingStyle: string;          // e.g. "bold geometric sans"
    bodyStyle: string;             // e.g. "clean humanist sans"
    fontPersonality: string[];     // e.g. ["modern", "technical", "approachable"]
    merchTextSuitability: {
      score: number;               // 0-1
      level: 'low' | 'medium' | 'high';
      explanation: string;
    };
  };

  imageryStyle: {
    photographyStyle: string[];
    subjectTypes: string[];
    lighting: string;
    composition: string;
    backgroundStyle: string;
    realismLevel: 'abstract' | 'illustrated' | 'semi_real' | 'photo_real';
  };

  visualMotifs: string[];          // e.g. ["rounded shapes", "glow effects", "grid patterns"]

  layoutComposition: {
    layoutStyle: string;
    whitespacePreference: 'low' | 'medium' | 'high';
    symmetry: 'symmetric' | 'asymmetric' | 'mixed';
    gridFeeling: 'strict' | 'loose' | 'editorial' | 'organic';
  };

  textureMaterialLanguage: {
    textureKeywords: string[];
    materialFeeling: string[];
    garmentImplications: string[];
  };

  logoDetection: {
    detected: boolean;
    markType?: 'wordmark' | 'symbol' | 'combo' | 'mascot';
    logoStyle?: string;
    smallSizeSuitability?: 'low' | 'medium' | 'high';
    riskFlag: boolean;              // true if potentially protected
  };

  printSuitabilityNotes: string[];  // e.g. ["thin lines may be lost in DTG", "gradient needs DTF"]
}
```

### 5.5 Call 2 输出 Schema

```typescript
interface BrandSynthesisOutput {
  essence: {
    brandName?: string;             // detected, not authorized for use
    tagline?: string;               // detected, not authorized for use
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
    storytellingStructure: string;
    merchCopySuitability: { score: number; explanation: string; };
    recommendedCopyDirections: string[];  // original suggestions, NOT copied slogans
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
      type: 'logo' | 'brand_name' | 'slogan' | 'character' | 'mark';
      label?: string;
      confidence: number;
    }>;
    recommendedOwnershipState: OwnershipStateV1;
    userFacingNotice: string;
  };
}

interface AxisScore {
  score: number;           // -1 to 1
  leftLabel: string;
  rightLabel: string;
  explanation: string;
}
```

---

## 6. Risk Assessment

### 6.1 双源验证

```
Brandfetch API lookup (by domain)
  → 返回 known brand data (logo, colors, industry)
  → 如果匹配 → riskLevel 升级

Gemini Call 2 riskAssessment
  → 返回 detected protected elements
  → 如果 confidence >= 0.7 → riskLevel 升级
```

合并逻辑：

```typescript
function finalizeRisk(
  brandfetchResult: BrandfetchResult | null,
  geminiRisk: RiskAssessment,
): RiskReportArtifact {
  let ownershipState: OwnershipStateV1 = 'style_reference';

  // Brandfetch 命中 = 已知品牌
  if (brandfetchResult?.isKnownBrand) {
    ownershipState = 'restricted';
  }

  // Gemini 检测到高置信度受保护元素
  if (geminiRisk.detectedProtectedElements.some(e => e.confidence >= 0.7)) {
    ownershipState = 'restricted';
  }

  // 用户明确要求复制品牌资产
  if (geminiRisk.recommendedOwnershipState === 'restricted') {
    ownershipState = 'restricted';
  }

  return {
    artifactType: 'RiskReportArtifact',
    ownershipState,
    rightsRiskLevel: ownershipState === 'restricted' ? 'high' : 'low',
    detectedProtectedElements: geminiRisk.detectedProtectedElements,
    blockedElements: buildBlockedList(ownershipState, geminiRisk),
    allowedStyleSignals: buildAllowedList(ownershipState),
    userFacingNotice: buildUserNotice(ownershipState),
  };
}
```

### 6.2 RiskReportArtifact

```typescript
interface RiskReportArtifact {
  artifactType: 'RiskReportArtifact';
  riskReportId: string;
  ownershipState: OwnershipStateV1;
  rightsRiskLevel: 'low' | 'medium' | 'high' | 'blocked';
  printRiskLevel: 'low' | 'medium' | 'high';
  detectedProtectedElements: ProtectedElement[];
  blockedElements: string[];
  allowedStyleSignals: string[];
  userFacingNotice: string;
  internalNotes: string[];
}
```

---

## 7. Merch Rule Engine

### 7.1 设计原则

Merch Rule Engine 是 Custyle 护城河。**纯 TypeScript 硬编码，不用模型。**

Gemini 只在 Stage 5 写 concept narrative，不参与 merch 逻辑决策。

### 7.2 输入输出

```typescript
// 输入
interface MerchRuleInputV1 {
  essence: BrandSynthesisOutput['essence'];
  expression: VisualExtractionOutput;
  voice: BrandSynthesisOutput['voice'];
  context: BrandSynthesisOutput['context'];
  ownershipState: OwnershipStateV1;
  targetCategories?: ProductCategory[];
  userInstruction?: string;
  catalogColors: CatalogColor[];      // 从 Printful 产品目录加载
  printRules: PrintRule[];            // 硬编码生产规则
}

// 输出
interface MerchRuleOutputV1 {
  matchedArchetype: BrandArchetype;
  productCategoryFitMatrix: ProductCategoryFit[];
  garmentRecommendations: GarmentRecommendation[];
  colorGarmentPairings: ColorGarmentPairing[];
  printMethodCompatibility: PrintMethodCompatibility[];
  placementStrategies: PlacementStrategy[];
  conceptSeeds: ConceptSeed[];        // 4 个 concept 骨架
  appliedRuleIds: string[];
  warnings: string[];
}
```

### 7.3 Brand Archetype Matching

5 个品牌原型，基于 personality axes 匹配：

```typescript
type BrandArchetype =
  | 'tech_minimal'
  | 'streetwear_creator'
  | 'premium_corporate'
  | 'fun_illustrative'
  | 'lifestyle_warm';

function matchArchetype(axes: PersonalityAxes): BrandArchetype {
  const scores = {
    tech_minimal: weightedScore(axes, {
      minimalVsExpressive: -0.4,    // prefer minimal
      seriousVsPlayful: -0.2,       // slightly serious
      calmVsEnergetic: -0.2,        // calm
      functionalVsEmotional: -0.3,  // functional
    }),
    streetwear_creator: weightedScore(axes, {
      seriousVsPlayful: 0.2,        // playful
      establishedVsDisruptive: 0.4, // disruptive
      calmVsEnergetic: 0.3,         // energetic
      minimalVsExpressive: 0.3,     // expressive
    }),
    premium_corporate: weightedScore(axes, {
      premiumVsMass: -0.5,          // premium
      seriousVsPlayful: -0.3,       // serious
      establishedVsDisruptive: -0.3,// established
      minimalVsExpressive: -0.2,    // minimal
    }),
    fun_illustrative: weightedScore(axes, {
      seriousVsPlayful: 0.5,        // playful
      minimalVsExpressive: 0.4,     // expressive
      functionalVsEmotional: 0.3,   // emotional
      calmVsEnergetic: 0.2,         // energetic
    }),
    lifestyle_warm: weightedScore(axes, {
      functionalVsEmotional: 0.3,   // emotional
      calmVsEnergetic: -0.2,        // calm
      premiumVsMass: 0.1,           // slightly mass
      seriousVsPlayful: 0.2,        // playful
    }),
  };

  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)[0][0] as BrandArchetype;
}
```

### 7.4 Product Category 定义

与 Custyle 现有产品目录对齐：

```typescript
type ProductCategory =
  | 'T_SHIRT'
  | 'HOODIE'
  | 'SWEATSHIRT'
  | 'CANVAS_BAG'
  | 'TOTE_BAG'
  | 'MUG'
  | 'MOUSE_PAD'
  | 'PHONE_CASE'
  | 'STICKER'
  | 'NOTEBOOK'
  | 'KIDS_CLOTHING';
```

### 7.5 Category Fit 规则

```typescript
interface CategoryFitRule {
  ruleId: string;
  archetype: BrandArchetype;
  boosts: Array<{ category: ProductCategory; delta: number }>;
  penalizes: Array<{ category: ProductCategory; delta: number }>;
  recommendedPlacements: string[];
  recommendedBaseColorFamilies: string[];
  avoidPatterns: string[];
}

const CATEGORY_FIT_RULES: CategoryFitRule[] = [
  {
    ruleId: 'MERCH_TECH_MINIMAL_001',
    archetype: 'tech_minimal',
    boosts: [
      { category: 'HOODIE', delta: 15 },
      { category: 'T_SHIRT', delta: 12 },
      { category: 'MUG', delta: 10 },
      { category: 'STICKER', delta: 10 },
      { category: 'MOUSE_PAD', delta: 8 },
      { category: 'NOTEBOOK', delta: 6 },
    ],
    penalizes: [
      { category: 'KIDS_CLOTHING', delta: -10 },
    ],
    recommendedPlacements: ['left_chest', 'back_large'],
    recommendedBaseColorFamilies: ['black', 'charcoal', 'white', 'navy'],
    avoidPatterns: ['busy_full_background', 'loud_all_over', 'oversized_graphic'],
  },
  {
    ruleId: 'MERCH_STREETWEAR_001',
    archetype: 'streetwear_creator',
    boosts: [
      { category: 'HOODIE', delta: 18 },
      { category: 'T_SHIRT', delta: 16 },
      { category: 'STICKER', delta: 12 },
      { category: 'TOTE_BAG', delta: 8 },
    ],
    penalizes: [
      { category: 'NOTEBOOK', delta: -8 },
      { category: 'MOUSE_PAD', delta: -6 },
    ],
    recommendedPlacements: ['back_large', 'center_chest', 'all_over'],
    recommendedBaseColorFamilies: ['black', 'washed_charcoal', 'off_white', 'cream'],
    avoidPatterns: ['small_subtle_logo', 'corporate_left_chest'],
  },
  {
    ruleId: 'MERCH_PREMIUM_001',
    archetype: 'premium_corporate',
    boosts: [
      { category: 'T_SHIRT', delta: 10 },
      { category: 'MUG', delta: 12 },
      { category: 'NOTEBOOK', delta: 14 },
      { category: 'TOTE_BAG', delta: 10 },
    ],
    penalizes: [
      { category: 'STICKER', delta: -6 },
      { category: 'KIDS_CLOTHING', delta: -12 },
    ],
    recommendedPlacements: ['left_chest', 'corner'],
    recommendedBaseColorFamilies: ['white', 'navy', 'black', 'natural'],
    avoidPatterns: ['loud_graphics', 'all_over_print', 'neon_colors'],
  },
  {
    ruleId: 'MERCH_FUN_001',
    archetype: 'fun_illustrative',
    boosts: [
      { category: 'T_SHIRT', delta: 16 },
      { category: 'STICKER', delta: 18 },
      { category: 'PHONE_CASE', delta: 14 },
      { category: 'TOTE_BAG', delta: 12 },
      { category: 'KIDS_CLOTHING', delta: 10 },
    ],
    penalizes: [
      { category: 'NOTEBOOK', delta: -4 },
    ],
    recommendedPlacements: ['center_chest', 'all_over', 'wraparound'],
    recommendedBaseColorFamilies: ['white', 'light_blue', 'pink', 'yellow', 'natural'],
    avoidPatterns: ['minimal_small_logo', 'dark_moody'],
  },
  {
    ruleId: 'MERCH_LIFESTYLE_001',
    archetype: 'lifestyle_warm',
    boosts: [
      { category: 'T_SHIRT', delta: 12 },
      { category: 'HOODIE', delta: 14 },
      { category: 'TOTE_BAG', delta: 14 },
      { category: 'MUG', delta: 12 },
      { category: 'CANVAS_BAG', delta: 10 },
    ],
    penalizes: [
      { category: 'MOUSE_PAD', delta: -6 },
    ],
    recommendedPlacements: ['center_chest', 'left_chest', 'back_large'],
    recommendedBaseColorFamilies: ['natural', 'olive', 'dusty_rose', 'cream', 'sage'],
    avoidPatterns: ['neon', 'high_contrast_graphic', 'tech_aesthetic'],
  },
];
```

### 7.6 Category Fit 评分公式

```typescript
function scoreCategoryFit(
  archetype: BrandArchetype,
  expression: VisualExtractionOutput,
  targetCategories?: ProductCategory[],
): ProductCategoryFit[] {
  const baseScores = getBaseScoresForAllCategories();  // 50 baseline

  // Apply archetype rules
  const rule = CATEGORY_FIT_RULES.find(r => r.archetype === archetype);
  rule.boosts.forEach(b => baseScores[b.category] += b.delta);
  rule.penalizes.forEach(p => baseScores[p.category] += p.delta);

  // Visual compatibility adjustment
  adjustForVisualCompatibility(baseScores, expression);

  // Print feasibility adjustment
  adjustForPrintFeasibility(baseScores, expression);

  // User intent alignment
  if (targetCategories) {
    targetCategories.forEach(c => baseScores[c] += 5);
  }

  // Normalize to 0-100
  return Object.entries(baseScores).map(([category, score]) => ({
    category: category as ProductCategory,
    fitScore: clamp(score, 0, 100),
    fitLevel: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
    reason: generateFitReason(category, archetype, score),
    ruleIds: [rule.ruleId],
  }));
}
```

### 7.7 Color × Garment Pairing

这是 v1 最关键的输出之一。Node5 Product Match 必须消费此字段。

```typescript
interface ColorGarmentPairing {
  pairingId: string;

  garmentBaseColor: {
    hex: string;
    label: string;
    catalogColorName: string;          // 映射到 Printful 实际可用色
  };

  printColors: Array<{
    hex: string;
    label: string;
    role: 'primary_print' | 'accent_print' | 'text_print' | 'outline';
  }>;

  contrastRatio: number;               // WCAG 计算
  perceivedContrast: 'low' | 'medium' | 'high';

  printMethodCompatibility: {
    DTG: 'good' | 'fair' | 'poor';
    DTF: 'good' | 'fair' | 'poor';
    screen_print: 'good' | 'fair' | 'poor';
    embroidery: 'good' | 'fair' | 'poor';
    sublimation: 'good' | 'fair' | 'poor';
  };

  visualRisk: 'none' | 'low_contrast' | 'thin_line_loss' | 'small_text_loss' | 'gradient_band_risk';
  brandFitScore: number;               // 0-100
  recommendedFor: ProductCategory[];
  reasoning: string;
  ruleIds: string[];
}
```

生成逻辑：

```typescript
function generateColorGarmentPairings(
  colorSystem: ColorSystem,
  categoryFit: ProductCategoryFit[],
  catalogColors: CatalogColor[],
  printRules: PrintRule[],
): ColorGarmentPairing[] {
  const brandColors = [
    ...colorSystem.primary,
    ...colorSystem.secondary,
    ...colorSystem.accent,
  ];
  const topCategories = categoryFit
    .filter(c => c.fitLevel !== 'low')
    .slice(0, 5);

  const pairings: ColorGarmentPairing[] = [];

  for (const garmentColor of findBestGarmentBaseColors(brandColors, catalogColors)) {
    for (const printColorSet of buildPrintColorSets(brandColors, garmentColor)) {
      const contrast = calculateContrastRatio(garmentColor.hex, printColorSet[0].hex);

      if (contrast < 3.0) continue;  // 硬性对比度底线

      const pairing = {
        pairingId: generateId(),
        garmentBaseColor: garmentColor,
        printColors: printColorSet,
        contrastRatio: contrast,
        perceivedContrast: contrast >= 7 ? 'high' : contrast >= 4.5 ? 'medium' : 'low',
        printMethodCompatibility: evaluatePrintMethods(garmentColor, printColorSet, printRules),
        visualRisk: detectVisualRisk(contrast, printColorSet),
        brandFitScore: scoreBrandFit(garmentColor, printColorSet, brandColors),
        recommendedFor: topCategories.map(c => c.category),
        reasoning: '',
        ruleIds: [],
      };

      pairings.push(pairing);
    }
  }

  // 返回 top 6 pairings，按 brandFitScore 排序
  return pairings.sort((a, b) => b.brandFitScore - a.brandFitScore).slice(0, 6);
}
```

### 7.8 Print Method 生产规则

```typescript
const PRINT_RULES: PrintRule[] = [
  // DTG
  {
    ruleId: 'PRINT_DTG_001',
    method: 'DTG',
    fabricRequirement: 'cotton_or_high_cotton_blend',
    darkGarmentNeedsWhiteUnderbase: true,
    minDpi: 150,
    recommendedDpi: 300,
    maxColors: 'unlimited',
    gradientSupport: true,
    thinLineMinWidth: '0.5mm',
    smallTextMinHeight: '6pt',
    notes: 'Best on 100% cotton. White underbase adds cost on darks.',
  },
  // DTF
  {
    ruleId: 'PRINT_DTF_001',
    method: 'DTF',
    fabricRequirement: 'any_heat_pressable',
    darkGarmentNeedsWhiteUnderbase: false,  // film carries its own white layer
    minDpi: 150,
    recommendedDpi: 300,
    maxColors: 'unlimited',
    gradientSupport: true,
    thinLineMinWidth: '0.3mm',
    smallTextMinHeight: '5pt',
    notes: 'Most versatile. Slight raised hand feel. Best for dark garments.',
  },
  // Screen Print
  {
    ruleId: 'PRINT_SCREEN_001',
    method: 'screen_print',
    fabricRequirement: 'most_fabrics',
    darkGarmentNeedsWhiteUnderbase: true,
    minDpi: 150,
    recommendedDpi: 300,
    maxColors: 8,
    gradientSupport: false,  // halftone simulation only
    thinLineMinWidth: '1mm',
    smallTextMinHeight: '8pt',
    notes: 'Economical at 1-3 colors. Each color = setup cost. >3 colors = cost-escalating.',
  },
  // Embroidery
  {
    ruleId: 'PRINT_EMBROIDERY_001',
    method: 'embroidery',
    fabricRequirement: 'most_fabrics',
    darkGarmentNeedsWhiteUnderbase: false,
    minDpi: null,  // not applicable
    recommendedDpi: null,
    maxColors: 14,
    gradientSupport: false,
    thinLineMinWidth: null,
    smallTextMinHeight: '6.35mm',  // 0.25 inch
    notes: 'No photos or gradients. 5K-10K stitches standard. >15K = high cost.',
  },
  // Sublimation
  {
    ruleId: 'PRINT_SUBLIMATION_001',
    method: 'sublimation',
    fabricRequirement: 'polyester_65_percent_min',
    darkGarmentNeedsWhiteUnderbase: false,
    lightBaseOnly: true,  // ink is translucent
    minDpi: 150,
    recommendedDpi: 300,
    maxColors: 'unlimited',
    gradientSupport: true,
    thinLineMinWidth: '0.3mm',
    smallTextMinHeight: '5pt',
    notes: 'Only on white/light pastels + polyester. Edge-to-edge all-over prints.',
  },
  // Sticker
  {
    ruleId: 'PRINT_STICKER_001',
    method: 'sticker_print',
    fabricRequirement: null,
    minDpi: 300,
    recommendedDpi: 300,
    maxColors: 'unlimited',
    gradientSupport: true,
    thinLineMinWidth: '0.25mm',
    smallTextMinHeight: '4pt',
    notes: 'Die-cut or kiss-cut. Vinyl 3-5 year outdoor life.',
  },
];
```

### 7.9 Placement Strategy

```typescript
interface PlacementStrategy {
  placement: 'left_chest' | 'center_chest' | 'back_large' | 'sleeve' | 'all_over' | 'corner' | 'front_center';
  fitScore: number;
  bestForCategories: ProductCategory[];
  maxPrintArea: string;              // e.g. "3.5 x 3.5 in"
  reason: string;
  risks: string[];
  ruleIds: string[];
}

const PLACEMENT_CONSTRAINTS = {
  left_chest:    { maxArea: '3.5x3.5in', minDetail: '0.25in', bestFor: ['T_SHIRT', 'HOODIE', 'SWEATSHIRT'] },
  center_chest:  { maxArea: '12x16in',   minDetail: '0.1in',  bestFor: ['T_SHIRT', 'HOODIE'] },
  back_large:    { maxArea: '12x14in',   minDetail: '0.1in',  bestFor: ['T_SHIRT', 'HOODIE', 'SWEATSHIRT'] },
  sleeve:        { maxArea: '3x3in',     minDetail: '0.3in',  bestFor: ['T_SHIRT', 'HOODIE'] },
  all_over:      { maxArea: 'full',      minDetail: '0.1in',  bestFor: ['T_SHIRT', 'PHONE_CASE'] },
  corner:        { maxArea: '4x4in',     minDetail: '0.2in',  bestFor: ['TOTE_BAG', 'NOTEBOOK'] },
  front_center:  { maxArea: '8x8in',     minDetail: '0.15in', bestFor: ['MUG', 'PHONE_CASE'] },
};
```

---

## 8. Concept Generation（Stage 5）

### 8.1 Concept Seed（来自 Rule Engine）

```typescript
interface ConceptSeed {
  seedId: string;
  category: ProductCategory;
  baseColor: string;                 // from ColorGarmentPairing
  placement: string;                 // from PlacementStrategy
  printMethod: string;               // from PrintMethodCompatibility
  artworkStyleHint: string;          // from archetype + expression
  copyDirectionHint?: string;        // from voice
  constraintsForCreateEngine: BrandConstraint[];
}
```

Rule Engine 输出 4 个 ConceptSeed，确保：
- 覆盖 ≥2 个不同 ProductCategory
- 覆盖 ≥2 个不同 placement
- 每个 seed 的 printMethod 都是 'good' compatibility
- 每个 seed 的 contrastRatio ≥ 4.5

### 8.2 Concept Narrative Writer（Gemini Flash-Lite）

```
Model: Gemini 2.5 Flash-Lite
Input: 4 concept seeds + brand essence summary
Output: 4 MerchConceptDirection with user-facing narratives
```

System prompt:

```text
You are Custyle Concept Narrative Writer.

Your job is to turn 4 concept seeds from Custyle's Merch Rule Engine into compelling,
user-facing merch concept cards.

You must NOT override the rule engine's decisions.
You may explain, name, and write concise creative narratives.

Rules:
1. Output valid JSON matching the provided schema.
2. Each concept must have: conceptName, subtitle, whyItFitsBrand, visualDirection.
3. conceptName should be catchy and short (2-4 words).
4. visualDirection should describe what the artwork looks like, not the product.
5. Do NOT include official logos, brand names, slogans, marks, or characters.
6. Every concept must be merch-ready, not just aesthetically interesting.
7. Keep language crisp and confident. No filler.

Return JSON only.
```

### 8.3 MerchConceptDirection

```typescript
interface MerchConceptDirection {
  conceptId: string;
  conceptName: string;               // e.g. "Digital Pulse"
  subtitle: string;                  // e.g. "Minimalist energy for the builder"
  category: ProductCategory;
  productBaseColor: string;          // hex
  artworkStyle: string;
  placement: string;
  printMethod: PrintMethod;
  copyDirection?: string;
  visualDirection: string;
  whyItFitsBrand: string;
  productionRisk: 'low' | 'medium' | 'high';
  rightsMode: OwnershipStateV1;
  forbiddenElements: string[];
  constraintsForCreateEngine: BrandConstraint[];
}
```

---

## 9. Print Safety Gate

### 9.1 Gate 是硬闸，不是加权项

```typescript
type GateStatus = 'pass' | 'warn' | 'fail' | 'blocked';

interface PrintGateResult {
  status: GateStatus;
  failedReasons: string[];
  warnings: string[];
  suggestedFixes: string[];
}
```

### 9.2 Gate 规则

```
rightsSafety = blocked → 不进入生成/下单
contrastRatio < 3.0 → fail
contrastRatio < 4.5 且含文字 → warn
thin lines (< 0.5mm) + DTG → warn
small text (< 6pt) on fabric → warn
complex gradient + screen_print → fail
sublimation + dark garment → fail
sublimation + cotton → fail
embroidery + photo/gradient → fail
embroidery text < 0.25" → fail
```

### 9.3 评分顺序

```
Rights Gate → Print Gate → Brand Fit Score
```

不能用高 Brand Fit 掩盖生产不可行或法律风险。

---

## 10. Brand Fit Score

### 10.1 v1 使用固定权重

原 spec 设计了 4 组 dynamic weights by designMode。v1 简化为固定权重，原因：
- 没有足够数据验证哪组权重正确
- dynamic weights 增加调试复杂度
- 等有数据后 v1.1 再引入 designMode conditional weights

```typescript
const BRAND_FIT_WEIGHTS = {
  colorFit: 0.25,
  motifFit: 0.20,
  moodFit: 0.20,
  typographyFit: 0.15,
  productFit: 0.10,
  compositionFit: 0.10,
};
```

### 10.2 评分维度

```
colorFit      = 设计配色与 Brand Style Kit 色彩系统的匹配度
motifFit      = 具体视觉元素是否匹配（rounded shapes, glow, gradient, line art）
moodFit       = 整体情绪气质是否匹配（playful, premium, calm, rebellious）
typographyFit = 字体风格与品牌字体系统的一致性
productFit    = 商品类别与品牌定位的匹配度
compositionFit = 构图与品牌布局语言的一致性
```

v1 的 Brand Fit Score 只在 Consistency Check 时使用（v1.1 引入）。v1 核心 flow 不依赖此评分。

---

## 11. BrandKitArtifact v1

### 11.1 为什么合并为 1 个 artifact

原 spec 输出 4 个 artifact（RawSignal, BrandKit, MerchTranslation, RiskReport）。v1 合并为 2 个：

- **BrandKitArtifact**：合并 RawSignal + BrandKit + MerchTranslation（v1 没有独立消费 RawSignal 的下游）
- **RiskReportArtifact**：独立保留（gate 逻辑需要单独消费）

### 11.2 BrandKitArtifact Schema

```typescript
interface BrandKitArtifactV1 {
  artifactType: 'BrandKitArtifact';
  brandKitId: string;
  brandKitVersion: '1.0';
  ownerId: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'active' | 'archived';
  ownershipState: OwnershipStateV1;

  // Sources
  sourceSummary: {
    sourceCount: number;
    sourceTypes: string[];
    primarySourceUrl?: string;
    primarySourceType: 'url' | 'image' | 'pdf' | 'text';
  };

  // Layer 1: Essence
  essence: {
    brandName?: string;
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
    matchedArchetype: BrandArchetype;
  };

  // Layer 2: Expression
  expression: {
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
      fontPersonality: string[];
      merchTextSuitability: { score: number; level: string; explanation: string; };
    };
    imageryStyle: {
      photographyStyle: string[];
      subjectTypes: string[];
      realismLevel: string;
    };
    visualMotifs: string[];
    layoutComposition: {
      whitespacePreference: string;
      symmetry: string;
      gridFeeling: string;
    };
    textureMaterialLanguage: {
      textureKeywords: string[];
      materialFeeling: string[];
      garmentImplications: string[];
    };
  };

  // Layer 3: Voice
  voice: {
    tone: string[];
    vocabularyPatterns: string[];
    sloganStyle: string;
    merchCopySuitability: { score: number; explanation: string; };
    recommendedCopyDirections: string[];
    mustAvoidPhrases: string[];
  };

  // Layer 4: Context
  context: {
    category: string;
    audienceProfile: string[];
    culturalReferences: string[];
    categoryConventions: string[];
  };

  // Layer 5: Merch Translation
  merchTranslation: {
    productCategoryFitMatrix: ProductCategoryFit[];
    garmentRecommendations: GarmentRecommendation[];
    colorGarmentPairings: ColorGarmentPairing[];
    printMethodCompatibility: PrintMethodCompatibility[];
    placementStrategies: PlacementStrategy[];
    conceptDirections: MerchConceptDirection[];
  };

  // Layer 6: Constraints
  constraints: {
    mustUse: BrandConstraint[];
    shouldUse: BrandConstraint[];
    mustAvoid: BrandConstraint[];
  };

  // Confidence
  confidenceReport: {
    overallConfidence: number;
    colorConfidence: number;
    typographyConfidence: number;
    essenceConfidence: number;
    signalCount: number;
    deterministicSignalCount: number;
    modelInferredSignalCount: number;
  };
}

interface ColorToken {
  hex: string;
  rgb: [number, number, number];
  role: 'primary' | 'secondary' | 'accent' | 'neutral' | 'background' | 'text' | 'cta';
  usage: string;
  dominance?: number;
  confidence: number;
  extractionFidelity: 'exact' | 'algorithmic_stable' | 'model_inferred';
}

interface BrandConstraint {
  constraintId: string;
  type: 'color' | 'typography' | 'logo' | 'motif' | 'composition' | 'voice' | 'placement' | 'print' | 'rights' | 'safety';
  instruction: string;
  strength: 'hard' | 'soft';
  confidence: number;
  appliesTo: 'concept' | 'artwork' | 'product_match' | 'scene_preview' | 'all';
}
```

### 11.3 Constraint 生成规则

```
mustUse:
  - 高置信度 exact/algorithmic 颜色 (confidence >= 0.8)
  - 高置信度字体类别
  - archetype-specific 风格方向

shouldUse:
  - 中高置信度视觉 motifs (confidence >= 0.6)
  - 推荐的构图方向
  - voice copy directions

mustAvoid:
  - 所有 detected protected elements (if style_reference/restricted)
  - print safety risks
  - archetype 对应的 avoidPatterns
  - 低对比度组合
```

固定硬约束（所有 run 都包含）：

```json
{
  "constraintId": "RIGHTS_DEFAULT_001",
  "type": "rights",
  "instruction": "Do not reproduce official logos, brand names, slogans, registered marks, or protected characters from the source.",
  "strength": "hard",
  "confidence": 1.0,
  "appliesTo": "all"
}
```

---

## 12. Pipeline 实现

### 12.1 Orchestrator

```typescript
export async function runBrandLensV1(input: BrandLensInput): Promise<BrandLensOutputV1> {
  const run = await createBrandLensRun(input);

  // ── Stage 0: Preflight ──
  const preflight = await preflightInput(input);
  if (preflight.status === 'blocked') {
    return buildBlockedResponse(run, preflight);
  }

  // ── Stage 1: Source Ingestion (3-tier) ──
  // Tier 1: HTTP fetch + CSS parse
  const tier1 = await tier1HttpFetch(input.primaryUrl);
  publishProgress(run.id, 'checking_source', { colors: tier1.cssVariables });

  // Tier 2: Firecrawl (only if Tier 1 insufficient)
  let tier2: Tier2Result | null = null;
  if (tier1.status === 'insufficient' && input.type === 'url') {
    tier2 = await firecrawlRender(input.primaryUrl);
  }
  publishProgress(run.id, 'reading_signals');

  // Tier 3: node-vibrant on screenshot
  let tier3: Tier3Result | null = null;
  const screenshot = tier2?.screenshotDesktop ?? input.images?.[0];
  if (screenshot) {
    tier3 = await nodeVibrantExtract(screenshot);
  }
  publishProgress(run.id, 'finding_colors', {
    colors: buildProvisionalPalette(tier1, tier3),
  });

  // Merge deterministic signals
  const deterministicSignals = mergeDeterministicSignals(tier1, tier2, tier3);

  // ── Stage 2: Brand Intelligence (2 parallel Gemini calls) ──
  const visualSummary = buildVisualSummaryForCall2(deterministicSignals);

  const [visualExtraction, brandSynthesis] = await Promise.all([
    geminiVisualExtraction(deterministicSignals, screenshot, input.images),
    geminiBrandSynthesis(tier1, tier2?.visibleText, visualSummary, input),
  ]);
  publishProgress(run.id, 'understanding_brand', {
    personality: brandSynthesis.essence.emotionalCore,
    motifs: visualExtraction.visualMotifs,
  });

  // ── Stage 3: Risk Assessment ──
  const brandfetchResult = input.primaryUrl
    ? await brandfetchLookup(extractDomain(input.primaryUrl))
    : null;

  const riskReport = finalizeRisk(brandfetchResult, brandSynthesis.riskAssessment);
  publishProgress(run.id, 'checking_safety');

  // ── Stage 4: Merch Rule Engine ──
  const merchOutput = runMerchRuleEngineV1({
    essence: brandSynthesis.essence,
    expression: visualExtraction,
    voice: brandSynthesis.voice,
    context: brandSynthesis.context,
    ownershipState: riskReport.ownershipState,
    targetCategories: input.targetCategories,
    catalogColors: await loadCatalogColors(),
    printRules: PRINT_RULES,
  });
  publishProgress(run.id, 'translating_to_merch');

  // ── Stage 5: Concept Generation ──
  const conceptDirections = await writeConceptNarratives(
    merchOutput.conceptSeeds,
    brandSynthesis.essence,
    riskReport,
  );
  publishProgress(run.id, 'building_concepts', {
    concepts: conceptDirections.map(c => ({ name: c.conceptName, category: c.category })),
  });

  // ── Stage 6: Build & Persist ──
  const constraints = compileBrandConstraints(
    visualExtraction, brandSynthesis, merchOutput, riskReport,
  );

  const brandKit = await persistBrandKit({
    run,
    input,
    essence: { ...brandSynthesis.essence, matchedArchetype: merchOutput.matchedArchetype },
    expression: visualExtraction,
    voice: brandSynthesis.voice,
    context: brandSynthesis.context,
    merchTranslation: {
      ...merchOutput,
      conceptDirections,
    },
    constraints,
    riskReport,
    deterministicSignals,
  });

  publishProgress(run.id, 'complete', { brandKitId: brandKit.brandKitId });

  return { run, brandKit, riskReport };
}
```

### 12.2 渐进式 Magic Moment

| 时间 | 推送事件 | UI 展示 |
|---|---|---|
| 0-1s | `checking_source` | "Checking the source..." + 初始动画 |
| 1-2s | `reading_signals` | "Reading visible brand signals..." |
| 2-4s | `finding_colors` | 临时色卡 + "Finding dominant colors..." |
| 4-8s | `understanding_brand` | personality keywords + visual motifs |
| 8-10s | `checking_safety` | "Separating style from protected assets..." |
| 10-15s | `translating_to_merch` | "Translating style into merch directions..." |
| 15-20s | `building_concepts` | 4 concept cards 渐次出现 |
| 20-25s | `complete` | Brand Portrait 完整呈现 + CTA |

Fast path（Tier 1 sufficient）：跳过 Firecrawl，总时间 ~8-12s。

### 12.3 进度推送实现

```typescript
function publishProgress(runId: string, stage: string, data?: any) {
  // 通过 Valkey pub/sub 推送
  valkey.publish(`brand-lens:${runId}`, JSON.stringify({
    event: stage,
    timestamp: Date.now(),
    payload: data,
  }));
}
```

前端通过 SSE 消费：

```
GET /api/brand-lens/runs/:runId/stream
```

---

## 13. Create Flow 集成

### 13.1 BrandContextInputV1

Brand Lens 输出注入 Create Flow 的接口：

```typescript
interface BrandContextInputV1 {
  brandKitId: string;
  ownershipState: OwnershipStateV1;
  essenceSummary: string;
  matchedArchetype: BrandArchetype;
  colorPalette: ColorToken[];
  typographyGuidance: string[];
  visualMotifs: string[];
  voiceGuidance: string[];
  selectedConcept?: MerchConceptDirection;
  colorGarmentPairings: ColorGarmentPairing[];
  constraints: {
    mustUse: BrandConstraint[];
    shouldUse: BrandConstraint[];
    mustAvoid: BrandConstraint[];
  };
  riskReport: {
    ownershipState: OwnershipStateV1;
    blockedElements: string[];
    allowedStyleSignals: string[];
  };
}
```

### 13.2 集成方式（不依赖 workflow-contracts）

workflow-contracts 尚未实现。v1 直接通过 JSON 参数传递：

```typescript
// 用户点击 concept card → 进入 Create Flow
async function createFromBrandConcept(
  brandKitId: string,
  conceptId: string,
  userInstruction?: string,
) {
  const brandKit = await loadBrandKit(brandKitId);
  const concept = brandKit.merchTranslation.conceptDirections
    .find(c => c.conceptId === conceptId);

  const brandContext: BrandContextInputV1 = {
    brandKitId,
    ownershipState: brandKit.ownershipState,
    essenceSummary: brandKit.essence.positioningSummary,
    matchedArchetype: brandKit.essence.matchedArchetype,
    colorPalette: brandKit.expression.colorSystem.primary
      .concat(brandKit.expression.colorSystem.accent),
    typographyGuidance: [brandKit.expression.typographySystem.headingStyle],
    visualMotifs: brandKit.expression.visualMotifs,
    voiceGuidance: brandKit.voice.recommendedCopyDirections,
    selectedConcept: concept,
    colorGarmentPairings: brandKit.merchTranslation.colorGarmentPairings,
    constraints: brandKit.constraints,
    riskReport: {
      ownershipState: brandKit.ownershipState,
      blockedElements: [],  // from RiskReportArtifact
      allowedStyleSignals: [],
    },
  };

  // 注入 design graph 的 externalContexts
  return startCreateFlow({
    externalContexts: { brand: brandContext },
    userInstruction: userInstruction ?? concept.visualDirection,
    productCategory: concept.category,
    productBaseColor: concept.productBaseColor,
    placement: concept.placement,
  });
}
```

### 13.3 Node Prompt Patches

#### Design Graph 入口（Node2 等效）

```text
When externalContexts.brand is provided:
- Use it as a first-class input. Do not re-analyze the brand.
- Priority: user instruction > hard constraints > selected concept > soft preferences > general inference.
- If ownershipState is style_reference or restricted: NEVER use official logo, brand name, slogan, mark, mascot, or character.
```

#### Artwork Generation（Node4 等效）

```text
When brand constraints are provided:
- Follow allowedStyleSignals for mood, color, motif.
- Respect forbiddenElements list strictly.
- Use only colors from provided colorPalette.
- Keep artwork print-ready for the specified printMethod.
- Never generate unauthorized logos, fake brand marks, or protected characters.
```

#### Product Match（Node5 等效）

```text
When colorGarmentPairings are provided:
- Use them as the primary source for product color selection.
- Match garmentBaseColor.catalogColorName to actual Printful catalog.
- Prefer pairings with contrastRatio >= 4.5 and printMethodCompatibility = 'good'.
```

---

## 14. API Design

### 14.1 创建 Brand Lens Run

```http
POST /api/brand-lens/runs
```

```json
{
  "workspaceId": "ws_123",
  "sources": [
    { "type": "url", "role": "base", "value": "https://example.com" },
    { "type": "text", "role": "modulation", "value": "Make it feel younger." }
  ],
  "targetCategories": ["T_SHIRT", "HOODIE", "STICKER"]
}
```

Response:

```json
{
  "brandLensRunId": "blr_123",
  "status": "running",
  "streamUrl": "/api/brand-lens/runs/blr_123/stream"
}
```

### 14.2 SSE 进度流

```http
GET /api/brand-lens/runs/:runId/stream
```

### 14.3 获取最终输出

```http
GET /api/brand-lens/runs/:runId/output
```

### 14.4 保存 Brand Style Kit

```http
POST /api/brand-kits/:brandKitId/save
```

v1 只支持：保存、重命名、手动复用、归档。

### 14.5 从 Concept 进入 Create Flow

```http
POST /api/create/from-brand-concept
```

```json
{
  "brandKitId": "bk_123",
  "conceptId": "concept_1",
  "userInstruction": "Make it more minimal."
}
```

---

## 15. Database Design

### 15.1 brand_lens_runs

```sql
CREATE TABLE brand_lens_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  stage TEXT,
  input_json JSONB NOT NULL,
  error_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 15.2 brand_kits

```sql
CREATE TABLE brand_kits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  brand_lens_run_id TEXT NOT NULL REFERENCES brand_lens_runs(id),
  name TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'draft',
  ownership_state TEXT NOT NULL DEFAULT 'style_reference',
  artifact_json JSONB NOT NULL,
  risk_report_json JSONB NOT NULL,
  confidence_report JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_brand_kits_user ON brand_kits(user_id);
CREATE INDEX idx_brand_kits_workspace ON brand_kits(user_id, workspace_id);
```

v1 不建：brand_kit_versions, brand_memory_graph, brand_evolution_events, consistency_reports。

---

## 16. Frontend

### 16.1 路由

```
/brand-lens                              — 输入页
/brand-lens/runs/:runId                  — 进度 + Brand Portrait
/brand-kits/:brandKitId                  — 已保存的 Kit 详情
/create/from-brand/:brandKitId/:conceptId — 直接进入 Create Flow
```

### 16.2 Brand Portrait 页面模块

```
1. Brand Style Snapshot         — 首屏一句话总结
2. Color Palette                — 色卡（标注 exact vs inferred）
3. Visual Motifs                — 关键词云
4. Brand Personality            — 6 轴雷达图
5. Typography Style             — 字体类别 + merch 适配度
6. Voice & Copy Direction       — tone 标签 + 推荐文案方向
7. Merch Fit Matrix             — 商品类别适配热力图
8. Color × Garment Pairing      — 最佳配色卡片
9. 4 × Concept Cards            — 可点击进入 Create Flow
10. Safety Notice                — 权限状态提示
11. CTA: "Create with this style" / "Save Style Kit"
```

### 16.3 首屏文案模板

```text
We found a [personality] style built around [colors/motifs].
It works best for [top categories] and should avoid [key risks].
```

### 16.4 安全提示文案

style_reference:

```text
We'll use the visual style as inspiration, not copy official logos, names, slogans, or protected marks.
```

restricted:

```text
This source includes protected brand elements. We'll create original designs inspired by the general style only.
```

### 16.5 Concept Card ViewModel

```typescript
interface BrandConceptCardViewModel {
  conceptId: string;
  title: string;                    // conceptName
  subtitle: string;
  categoryLabel: string;
  baseColorSwatch: string;          // hex
  placementLabel: string;
  printRiskBadge: 'Low risk' | 'Medium risk' | 'Needs review';
  rightsBadge: 'Style reference' | 'Restricted';
  whyItWorks: string;
  ctaLabel: 'Customize this';
}
```

---

## 17. Error Handling

### 17.1 URL 抓取失败

```
Tier 1 失败 → try Tier 2 (Firecrawl)
Tier 2 失败 → 提示用户上传 screenshot
所有失败 → provisional kit from metadata only + low confidence
```

用户文案:

```text
We couldn't fully read this site. Upload a screenshot or logo to improve results.
```

### 17.2 品牌信号不足

触发：`confidenceReport.overallConfidence < 0.5`

行为：
- 输出 provisional kit
- 减少 hard constraints（大部分转 soft）
- 只给低风险 concepts
- 提示用户增加输入

### 17.3 高风险品牌

行为：
- 强制 restricted
- 隐藏 exact logo/name/slogan
- 只输出 original inspired concepts
- 明确告知用户

---

## 18. Testing & Evaluation

### 18.1 Spike 数据集

15 个品牌（Phase 0 精简版）：

```
5 个 AI / SaaS 品牌（e.g. Linear, Vercel, Notion, Supabase, Raycast）
5 个 creator / personal brand
5 个 streetwear / lifestyle brand
```

Phase 1 扩展到 30 个。

### 18.2 评估维度

```
color accuracy          — CSS exact vs extracted，Δ < 5 in LAB = pass
font category accuracy  — serif/sans/display match rate
visual motif quality    — 人工评分 1-5
style abstraction       — "它懂我的品牌吗" 人工评分 1-5
rights safety           — restricted brand 识别率 ≥ 95%
print feasibility       — ColorGarmentPairing 可生产率
concept usability       — concept → Create Flow 转化率
latency                 — P50 < 15s, P95 < 25s
```

### 18.3 人工评分表

```typescript
interface BrandLensEvalScore {
  colorAccuracy: number;        // 1-5
  typographyAccuracy: number;   // 1-5
  motifAccuracy: number;        // 1-5
  moodAccuracy: number;         // 1-5
  rightsSafety: number;         // 1-5
  printFeasibility: number;     // 1-5
  merchRelevance: number;       // 1-5
  magicMoment: number;          // 1-5
  notes: string;
}
```

---

## 19. Roadmap

### Phase 0 — Technical Spike（3-5 天）

```
目标：验证提取质量，不做 UI

交付：
  ✓ Firecrawl 集成 POC
  ✓ node-vibrant 色彩聚类 POC
  ✓ HTTP fetch + CSS parse POC
  ✓ 单次 Gemini Flash-Lite 综合提取（合并 Call 1 + Call 2 为 1 次调用测试质量）
  ✓ 15 品牌 JSON 输出
  ✓ 人工评估报告

关键决策点：
  - 1 次 vs 2 次 Gemini 调用的质量差异
  - Firecrawl 的反检测成功率
  - node-vibrant vs CSS 的颜色一致性
```

### Phase 1 — Brand Style Kit Extractor（2 周）

```
交付：
  ✓ 3-tier ingestion pipeline
  ✓ 2 Gemini calls (visual extraction + brand synthesis)
  ✓ Brandfetch risk lookup
  ✓ RiskReportArtifact
  ✓ BrandKitArtifact (without merchTranslation)
  ✓ Brand Portrait progressive UI
  ✓ Save-lite
  ✓ DB schema + API

产出：用户可以输入 URL/image/PDF → 看到 Brand Portrait → 保存 Kit
```

### Phase 2 — Merch Translation（2 周）

```
交付：
  ✓ Merch Rule Engine (15-20 rules, 5 archetypes)
  ✓ ProductCategoryFit scoring
  ✓ ColorGarmentPairing generation
  ✓ PlacementStrategy
  ✓ PrintMethodCompatibility
  ✓ 4 concept directions + Gemini narrative
  ✓ Concept card UI
  ✓ Print Gate validation

产出：Brand Portrait 增加 Merch Fit Matrix + 4 Concept Cards
```

### Phase 3 — Create Flow 集成（1 周）

```
交付：
  ✓ BrandContextInputV1 注入 design graph
  ✓ Concept → Create Flow 入口
  ✓ Node prompt patches (design/artwork/product match)
  ✓ ColorGarmentPairing → Product Match 消费
  ✓ 端到端测试：Brand Lens → Create → Mockup

产出：完整闭环可用
```

### Phase 4 — v1.1 增强（2 周，可选）

```
交付：
  □ ConsistencyReportArtifact (Brand Fit Score)
  □ Brand Fit Score dynamic weights by designMode
  □ One-click refine loop
  □ Search grounding for context enrichment
  □ DESIGN.md 兼容输出
  □ 扩展到 30 品牌测试集
```

**总计 v1 核心：~5-6 周**

---

## 20. v1 Acceptance Criteria

1. 用户可输入 URL / 图片 / PDF / text modulation
2. URL 输入经过 3-tier 降级（HTTP → Firecrawl → node-vibrant）
3. 系统在 5 秒内返回 progressive update（色卡或进度文案）
4. hex 值只从确定性来源提取，不从 vision model 猜测
5. 系统输出 BrandKitArtifactV1（含 6 层信息）
6. 系统默认 style_reference，不公开 owned 模式
7. Brandfetch 命中或高置信度 IP 检测 → 自动升级 restricted
8. restricted 品牌不生成 logo/name/slogan/mark
9. Merch Rule Engine 使用纯 TypeScript 规则，不依赖模型
10. 系统输出 ≥4 个 merch-ready concepts
11. 每个 concept 包含 category/baseColor/placement/printMethod/constraints
12. ColorGarmentPairing 的对比度 ≥ 3.0，文字型 ≥ 4.5
13. Print Gate 是硬闸：fail = 阻断，不可被 Brand Fit 覆盖
14. 用户可点击 concept 进入 Create Flow
15. BrandContextInputV1 成功注入 design graph
16. Brand Style Kit 可 save-lite 并手动复用
17. P50 延迟 < 15s，P95 < 25s
18. 每次 run 成本 < $0.02
19. 全链路可埋点（每个 stage 有 event）
20. restricted brand 识别率 ≥ 95%

---

## 21. v2+ 展望（不在 v1 范围内）

```
v2:
  真实 owned verification (DNS / email domain match / manual B2B approval)
  BrandKit version history
  ConsistencyReportArtifact (Brand Fit Score)
  Collection Bundle strategy
  Search grounding for context
  Social handle input
  DESIGN.md output format

v3:
  BrandDNA API (third-party agent integration)
  Brand Marketplace
  Brand Evolution Coach
  Video/Reel input
  Agentic Commerce brand intelligence layer
```

---

## 22. 结论

v1 的核心不是能力多，而是：

```
确定性信号优先（CSS > cluster > vision model）
安全默认（style_reference > restricted > blocked）
规则引擎主导商品决策（TypeScript > Gemini）
硬闸保底（Rights Gate > Print Gate > Brand Fit）
渐进式输出（5s fast snapshot > 15-20s full kit）
只闭环一件事：把品牌风格安全地变成可生产商品方向
```

最终一句话：

> Brand Lens v1 不是在做品牌分析工具。它是在用 $0.013 和 15 秒，把任意品牌视觉安全地编译成可穿、可拿、可送、可生产的商品方向。

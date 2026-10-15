/**
 * free-llm-scout — Core Type Definitions
 * Single source of truth for all data shapes across discovery, validation, emission.
 */

export interface ModelInfo {
  /** Unique identifier: provider/id (e.g., "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free") */
  id: string;
  /** Provider namespace (openrouter, siliconflow, modelscope, bailian, zhipu, moonshot, huggingface, custom) */
  provider: string;
  /** Model ID as used in API calls (e.g., "nvidia/nemotron-3-ultra-550b-a55b:free") */
  modelId: string;
  /** Human-readable name */
  name: string;
  /** Context window in tokens (claimed by provider) */
  contextWindow: number;
  /** Max output tokens (claimed) */
  maxTokens?: number;
  /** Input modalities */
  inputModalities: string[];
  /** Output modalities */
  outputModalities: string[];
  /** Pricing per 1M tokens (input) — 0 for free */
  priceInput?: number;
  /** Pricing per 1M tokens (output) — 0 for free */
  priceOutput?: number;
  /** Whether provider claims tool calling support */
  supportsToolCalling?: boolean;
  /** Whether provider claims structured output support */
  supportsStructuredOutput?: boolean;
  /** Discovery source timestamp */
  discoveredAt: string;
  /** How the free quota renews — drives the "spend the perishable first" ordering */
  quota?: QuotaPolicy;
  /** Raw provider-specific metadata */
  raw?: Record<string, unknown>;
}

/** How a provider's free quota renews. */
export type QuotaKind =
  /** Resets every day — unused capacity is lost at midnight, so spend it first. */
  | 'daily-reset'
  /** A one-time grant that expires — spend before the deadline. */
  | 'trial-expiring'
  /** Free for the foreseeable future — nothing wasted by deferring. */
  | 'durable';

export interface QuotaPolicy {
  kind: QuotaKind;
  /** Estimated daily free request budget (daily-reset tiers only). */
  amount?: number;
  /** ISO date when the grant expires (trial-expiring tiers only). */
  expiresAt?: string;
}

export interface ValidationResult {
  modelId: string;
  provider: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Individual check results */
  checks: ValidationCheck[];
  /** Aggregate score 0-100 */
  score: number;
  /** Validation timestamp */
  validatedAt: string;
  /** Error message if overall failed */
  error?: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  score: number; // 0-100
  details?: string;
  latencyMs?: number;
  rawResponse?: unknown;
}

export interface DiscoverySource {
  name: string;
  fetchModels(): Promise<ModelInfo[]>;
  validateKey(): Promise<boolean>;
}

export interface Validator {
  name: string;
  validate(model: ModelInfo, apiKey: string, baseURL: string): Promise<ValidationCheck>;
}

export interface Emitter {
  name: string;
  emit(results: ValidationResult[], models: ModelInfo[], options: EmitOptions): Promise<string>;
}

export interface EmitOptions {
  /** Output directory */
  outDir: string;
  /** DSH fleet config path (for patching) */
  dshFleetPath?: string;
  /** Minimum score to include in fleet */
  minScore?: number;
  /** Maximum fleet size */
  maxFleetSize?: number;
  /** Preferred provider order for tie-breaking */
  providerPriority?: string[];
}

export interface ScoutConfig {
  sources: string[]; // enabled discovery sources
  validators: string[]; // enabled validators
  emitters: string[]; // enabled emitters
  concurrency: number;
  timeoutMs: number;
  minScore: number;
  maxFleetSize: number;
  /** Cap on how many models get validated per run (free-tier daily request budget). */
  maxModels?: number;
  providerPriority: string[];
  dshFleetPath?: string;
  outputDir: string;
}
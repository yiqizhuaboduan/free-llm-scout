/**
 * free-llm-scout — Registry JSON Emitter
 * Full machine-readable registry of all discovered and validated models
 */

import { Emitter, ValidationResult, ModelInfo, EmitOptions } from '../types.js';
import { writeJson } from '../utils.js';

export class RegistryJsonEmitter implements Emitter {
  name = 'registry-json';

  async emit(results: ValidationResult[], models: ModelInfo[], options: EmitOptions): Promise<string> {
    const modelMap = new Map(models.map(m => [m.id, m]));
    const resultMap = new Map(results.map(r => [`${r.provider}/${r.modelId}`, r]));

    const registry = {
      generatedAt: new Date().toISOString(),
      version: '1.0',
      models: models.map(m => {
        const result = resultMap.get(m.id);
        return {
          ...m,
          validation: result ? {
            passed: result.passed,
            score: result.score,
            checks: result.checks,
            validatedAt: result.validatedAt,
          } : null,
        };
      }),
      summary: {
        totalDiscovered: models.length,
        totalValidated: results.length,
        passed: results.filter(r => r.passed).length,
        byProvider: this.groupByProvider(models),
      },
    };

    const outFile = `${options.outDir}/registry.json`;
    writeJson(outFile, registry);

    return `Generated registry with ${models.length} models → ${outFile}`;
  }

  private groupByProvider(models: ModelInfo[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const m of models) {
      counts[m.provider] = (counts[m.provider] || 0) + 1;
    }
    return counts;
  }
}
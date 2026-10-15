/**
 * free-llm-scout — DSH Fleet Config Emitter
 * Generates the `chain` array for `model-fleet` plugin in `cordis.patch.yml`
 */

import { Emitter, ValidationResult, ModelInfo, EmitOptions } from '../types.js';
import { selectFleetModels, writeText } from '../utils.js';

export class DshFleetEmitter implements Emitter {
  name = 'dsh-fleet';

  async emit(results: ValidationResult[], models: ModelInfo[], options: EmitOptions): Promise<string> {
    const fleetModels = selectFleetModels(results, models, {
      minScore: options.minScore ?? 60,
      maxFleetSize: options.maxFleetSize ?? 15,
      providerPriority: options.providerPriority ?? [
        'openrouter',
        'siliconflow',
        'modelscope',
        'bailian',
        'zhipu',
        'deepseek-account', // paid fallback last
      ],
    });

    // Generate YAML chain entries
    const chainEntries = fleetModels.map(m => ({
      provider: m.provider,
      model: m.modelId,
    }));

    const yamlContent = chainEntries.map(e =>
      `          - provider: ${e.provider}\n            model: "${e.model}"`
    ).join('\n');

    // Also write a standalone fleet.chain.yaml for easy include
    const standaloneYaml = `# free-llm-scout generated fleet chain
# Generated at: ${new Date().toISOString()}
# Source models: ${fleetModels.length} models, minScore=${options.minScore ?? 60}
#
# To use: copy this into your cordis.patch.yml under model-fleet.config.chain
# Or include via YAML anchor/merge
chain:
${yamlContent}
`;

    const outFile = `${options.outDir}/fleet.chain.yaml`;
    writeText(outFile, standaloneYaml);

    // Also generate a patch snippet for direct insertion
    const patchSnippet = this.generatePatchSnippet(chainEntries);
    writeText(`${options.outDir}/fleet.patch.snippet.yaml`, patchSnippet);

    return `Generated DSH fleet chain with ${fleetModels.length} models → ${outFile}`;
  }

  private generatePatchSnippet(chainEntries: { provider: string; model: string }[]): string {
    const chainYaml = chainEntries.map(e =>
      `          - provider: ${e.provider}\n            model: "${e.model}"`
    ).join('\n');

    return `# free-llm-scout generated patch snippet for cordis.patch.yml
# Paste this into model-fleet config section (replace existing chain:)
# Generated at: ${new Date().toISOString()}
#
# Example:
# - id: model-fleet
#   name: "./plugins/model-fleet.mjs"
#   config:
#${chainYaml.replace(/^/gm, '        ')}
chain:
${chainYaml}
`;
  }
}
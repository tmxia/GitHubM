import yaml from 'js-yaml';

export interface WorkflowInput {
  name: string;
  description: string;
  required: boolean;
  default: string;
  type: 'string' | 'choice' | 'boolean' | 'environment' | 'number';
  options?: string[];
}

export function parseWorkflowInputs(yamlSource: string): WorkflowInput[] {
  try {
    const doc = yaml.load(yamlSource) as Record<string, unknown> | null;
    if (!doc || typeof doc !== 'object') return [];

    const on = doc.on;
    if (!on || typeof on !== 'object' || Array.isArray(on)) return [];

    const dispatch = (on as Record<string, unknown>).workflow_dispatch;
    if (!dispatch || typeof dispatch !== 'object') return [];

    const inputs = (dispatch as Record<string, unknown>).inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return [];

    const result: WorkflowInput[] = [];
    for (const [name, def] of Object.entries(inputs as Record<string, unknown>)) {
      if (!def || typeof def !== 'object') continue;
      const d = def as Record<string, unknown>;
      const rawType = typeof d.type === 'string' ? d.type : 'string';
      const type: WorkflowInput['type'] = ['string', 'choice', 'boolean', 'environment', 'number'].includes(rawType)
        ? (rawType as WorkflowInput['type'])
        : 'string';

      result.push({
        name,
        description: typeof d.description === 'string' ? d.description : '',
        required: d.required === true,
        default: d.default !== undefined && d.default !== null ? String(d.default) : '',
        type,
        options: Array.isArray(d.options) ? d.options.map((o) => String(o)) : undefined,
      });
    }
    return result;
  } catch (e) {
    console.warn('[workflowInputs] YAML parse failed:', e);
    return [];
  }
}

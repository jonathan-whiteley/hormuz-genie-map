export type CopyValue = string | number | null | undefined;

const isMissing = (v: CopyValue): v is null | undefined => v == null || (typeof v === 'number' && Number.isNaN(v));

/** Replace `{key}` with the caller-formatted value; missing, null, undefined or NaN becomes 'no data'. */
export function fill(template: string, values: Record<string, CopyValue>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = values[key];
    return isMissing(v) ? 'no data' : String(v);
  });
}

export const pick = (cond: boolean, whenTrue: string, whenFalse: string): string => (cond ? whenTrue : whenFalse);

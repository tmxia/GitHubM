declare module 'js-yaml' {
  export function load(source: string): unknown;
  export function dump(obj: unknown): string;
}

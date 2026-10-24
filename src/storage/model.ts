export type Scope = 'file' | 'global';
export interface Rule {
  id: string; source: string; replacement: string; scope: Scope; filePath?: string;
  createdAt: number; active: boolean; origin: 'automatic' | 'manual';
}
export interface Suggestion {
  id: string; word: string; abbreviation: string; filePath: string; count: number;
  createdAt: number; status: 'pending' | 'accepted' | 'rejected' | 'ignored';
}
export interface Settings {
  autoAnalyze: boolean; minFrequency: number; minLength: number; maxSuggestions: number;
  debounceMs: number; notificationMs: number; substitutions: boolean;
  onSpace: boolean; onTab: boolean; defaultScope: Scope; stopWords: string;
}
export interface Data { schemaVersion: 1; settings: Settings; rules: Rule[]; suggestions: Suggestion[] }
export const DEFAULTS: Settings = {
  autoAnalyze: true, minFrequency: 6, minLength: 9, maxSuggestions: 5,
  debounceMs: 1500, notificationMs: 60000, substitutions: true,
  onSpace: true, onTab: false, defaultScope: 'file',
  stopWords: 'alors après assez aussi aucun aujourd’hui autre avec avoir beaucoup cette comme comment dans depuis donc elle elles encore entre être faire leurs mais même nous parce pendant plus pour pourquoi quand quelque sans sont sous très tout tous toute toutes vous votre ainsi cependant notamment également seulement toujours plusieurs',
};
export const normalize = (s: string): string => s.normalize('NFC').toLocaleLowerCase('fr').replace(/’/g, "'");
export function migrate(raw: unknown): Data {
  if (raw == null) return { schemaVersion: 1, settings: { ...DEFAULTS }, rules: [], suggestions: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Données invalides');
  const value = raw as Partial<Data>;
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error('Version de données non prise en charge');
  const settings = { ...DEFAULTS, ...value.settings };
  for (const key of ['minFrequency', 'minLength', 'maxSuggestions', 'debounceMs', 'notificationMs'] as const) {
    const n = settings[key];
    settings[key] = Number.isFinite(n) ? Math.max(1, Math.min(3600000, Math.round(n))) : DEFAULTS[key];
  }
  for (const key of ['autoAnalyze', 'substitutions', 'onSpace', 'onTab'] as const) {
    if (typeof settings[key] !== 'boolean') settings[key] = DEFAULTS[key];
  }
  if (typeof settings.stopWords !== 'string') settings.stopWords = DEFAULTS.stopWords;
  if (settings.defaultScope !== 'global') settings.defaultScope = 'file';
  if (!Array.isArray(value.rules ?? []) || !Array.isArray(value.suggestions ?? [])) throw new Error('Collections invalides');
  const rules = (value.rules ?? []).filter(r => r && typeof r.id === 'string' && typeof r.source === 'string' && typeof r.replacement === 'string' && (r.scope === 'global' || (r.scope === 'file' && typeof r.filePath === 'string')));
  const suggestions = (value.suggestions ?? []).filter(s => s && typeof s.word === 'string' && typeof s.filePath === 'string' && ['pending', 'accepted', 'ignored', 'rejected'].includes(s.status));
  return { schemaVersion: 1, settings, rules, suggestions };
}
export function resolveRules(data: Data, path: string): Map<string, Rule> {
  const rules = new Map<string, Rule>();
  for (const scope of ['global', 'file']) for (const r of data.rules) {
    if (r.active && r.scope === scope && (scope === 'global' || r.filePath === path)) rules.set(normalize(r.source), r);
  }
  return rules;
}
export function renamePath(data: Data, oldPath: string, newPath: string): void {
  const rename = (path: string): string => path === oldPath ? newPath : path.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
  for (const r of data.rules) if (r.filePath) r.filePath = rename(r.filePath);
  for (const s of data.suggestions) s.filePath = rename(s.filePath);
}
export const uid = (): string => globalThis.crypto.randomUUID();

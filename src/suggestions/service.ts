import { countWords, eligibleWords } from '../analysis/markdown';
import { generateCandidates } from '../abbreviations/generate';
import { normalize, uid, type Data, type Rule, type Suggestion } from '../storage/model';
export function analyze(data: Data, path: string, text: string): Suggestion[] {
  const counts = countWords(text);
  const eligible = eligibleWords(counts, data.settings);
  const current = new Map(eligible);
  // Keep history, but remove pending entries whose evidence has disappeared.
  data.suggestions = data.suggestions.filter(s => s.status !== 'pending' || s.filePath !== path || current.has(s.word));
  for (const s of data.suggestions) if (s.filePath === path && s.status === 'pending') s.count = counts.get(s.word) ?? 0;
  const occupied = data.rules.filter(r => r.scope === 'global' || r.filePath === path).map(r => r.source);
  occupied.push(...data.suggestions.filter(s => s.filePath === path && s.status === 'pending').map(s => s.abbreviation));
  for (const [word, count] of eligible) {
    if (pending(data, path).length >= data.settings.maxSuggestions) break;
    if (data.suggestions.some(s => s.filePath === path && normalize(s.word) === word)) continue;
    if (data.rules.some(r => normalize(r.replacement) === word && (r.scope === 'global' || r.filePath === path))) continue;
    const candidate = generateCandidates(word, count, occupied, counts.keys())[0];
    if (!candidate) continue;
    data.suggestions.push({ id: uid(), word, abbreviation: candidate.text, filePath: path, count, createdAt: Date.now(), status: 'pending' });
    occupied.push(candidate.text);
  }
  return pending(data, path);
}
export const pending = (data: Data, path: string): Suggestion[] => data.suggestions.filter(s => s.filePath === path && s.status === 'pending').slice(0, data.settings.maxSuggestions);
export function validateRule(data: Data, input: Pick<Rule, 'source' | 'replacement' | 'scope' | 'filePath'>, id?: string): string | undefined {
  if (!/^[\p{L}\p{M}\p{N}]{2,20}$/u.test(input.source)) return 'Utilisez 2 à 20 lettres ou chiffres pour le raccourci.';
  if (!input.replacement.trim() || /[\r\n]/.test(input.replacement)) return 'Le remplacement doit tenir sur une ligne et ne pas être vide.';
  if (normalize(input.source) === normalize(input.replacement)) return 'Le raccourci et le remplacement doivent être différents.';
  if (input.scope === 'file' && !input.filePath) return 'Ouvrez un fichier Markdown pour une règle locale.';
  if (data.rules.some(r => r.id !== id && normalize(r.source) === normalize(input.source) && r.scope === input.scope && (r.scope === 'global' || r.filePath === input.filePath))) return 'Ce raccourci existe déjà dans cette portée.';
  return undefined;
}
export function accept(data: Data, suggestion: Suggestion, source = suggestion.abbreviation): Rule {
  const rule: Rule = { id: uid(), source: normalize(source.trim()), replacement: suggestion.word, scope: 'file', filePath: suggestion.filePath, createdAt: Date.now(), active: true, origin: 'automatic' };
  const error = validateRule(data, rule);
  if (error) throw new Error(error);
  data.rules.push(rule); suggestion.status = 'accepted'; return rule;
}

import { describe, expect, it } from 'vitest';
import { countWords, eligibleWords } from '../src/analysis/markdown';
import { generateCandidates } from '../src/abbreviations/generate';
import { accept, analyze, validateRule } from '../src/suggestions/service';
import { migrate, renamePath, resolveRules, type Rule } from '../src/storage/model';
const repeated = 'déplacement '.repeat(6);
describe('analyse Markdown', () => {
  it('compte accents, casse, Unicode et élisions françaises', () => {
    expect(countWords('Déplacement déplacement de\u0301placement l’industrialisation industrialisation').get('déplacement')).toBe(3);
    expect(countWords('l’industrialisation industrialisation').get('industrialisation')).toBe(2);
    expect(countWords("aujourd’hui aujourd'hui").get("aujourd'hui")).toBe(2);
  });
  it('exclut YAML, code, URL, liens, HTML et références', () => {
    const text = '---\ntitle: déplacement\n---\n```ts\ndéplacement\n```\n~~~\ndéplacement\n~~~\n`déplacement` https://site.test/déplacement [déplacement](x) [[déplacement]] ![déplacement](x) <b> <!-- déplacement -->\n    déplacement\n[x]: déplacement\ndéplacement';
    expect(countWords(text).get('déplacement')).toBe(1);
  });
  it('exclut les fences non fermées et les mots courts/vides/sous le seuil', () => {
    expect(countWords('```\ndéplacement').size).toBe(0);
    const d = migrate(null);
    d.settings.stopWords += ' déplacement';
    expect(eligibleWords(countWords(repeated + 'petit '.repeat(8) + 'industrialisation '.repeat(5)), d.settings)).toEqual([]);
  });
  it('traite un gros document sans explosion du coût', () => {
    const start = performance.now();
    expect(countWords('déplacement texte `exclusion`\n'.repeat(30000)).get('déplacement')).toBe(30000);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
describe('abréviations et historique', () => {
  it('génère plusieurs candidats déterministes et structurés', () => {
    const result = generateCandidates('déplacement', 6, [], []);
    expect(result.length).toBeGreaterThan(3);
    expect(result.some(c => c.text === 'dplc')).toBe(true);
    expect(result).toEqual(generateCandidates('déplacement', 6, [], []));
    expect(result.every(c => c.text.length >= 3 && c.text.length <= 6)).toBe(true);
  });
  it('écarte mots usuels, vocabulaire du document et sources existantes', () => {
    expect(generateCandidates('déplacement', 6, ['dplc'], ['depl']).some(c => ['dplc', 'depl', 'des'].includes(c.text))).toBe(false);
    const all = generateCandidates('déplacement', 6, [], []).map(c => c.text);
    expect(generateCandidates('déplacement', 6, all, [])).toEqual([]);
  });
  it('conserve règles acceptées et historique après sérialisation', () => {
    const data = migrate(null); const s = analyze(data, 'A.md', repeated)[0]!;
    accept(data, s);
    const loaded = migrate(JSON.parse(JSON.stringify(data)));
    expect(loaded.rules).toEqual(data.rules);
    expect(analyze(loaded, 'A.md', repeated)).toEqual([]);
  });
  it('ne recrée pas les propositions refusées ou ignorées', () => {
    for (const status of ['rejected', 'ignored'] as const) {
      const data = migrate(null); analyze(data, 'A.md', repeated)[0]!.status = status;
      expect(analyze(migrate(JSON.parse(JSON.stringify(data))), 'A.md', repeated)).toEqual([]);
    }
  });
  it('limite la file et retire les propositions devenues obsolètes', () => {
    const d = migrate(null); d.settings.maxSuggestions = 1;
    expect(analyze(d, 'A.md', repeated + 'industrialisation '.repeat(8))).toHaveLength(1);
    expect(analyze(d, 'A.md', '')).toHaveLength(0);
  });
  it('isole les règles et donne priorité au fichier', () => {
    const data = migrate(null); const s = analyze(data, 'A.md', repeated)[0]!;
    const local = accept(data, s);
    data.rules.push({ ...local, id: 'global', scope: 'global', replacement: 'global' });
    expect(resolveRules(data, 'A.md').get(local.source)?.replacement).toBe('déplacement');
    expect(resolveRules(data, 'B.md').get(local.source)?.replacement).toBe('global');
    data.rules.pop(); expect(resolveRules(data, 'B.md').size).toBe(0);
  });
  it('suit les renommages de fichiers et dossiers avec historique', () => {
    const d = migrate(null); accept(d, analyze(d, 'dossier/A.md', repeated)[0]!);
    renamePath(d, 'dossier', 'nouveau');
    expect(d.rules[0]?.filePath).toBe('nouveau/A.md');
    expect(d.suggestions[0]?.filePath).toBe('nouveau/A.md');
    renamePath(d, 'nouveau/A.md', 'B.md'); expect(resolveRules(d, 'B.md').size).toBe(1);
  });
  it('valide les collisions manuelles et refuse les schémas futurs', () => {
    const d = migrate(null); const rule = accept(d, analyze(d, 'A.md', repeated)[0]!);
    expect(validateRule(d, rule)).toBeDefined();
    expect(validateRule(d, { ...rule, source: 'avec espace' } as Rule)).toBeDefined();
    expect(() => migrate({ schemaVersion: 99 })).toThrow();
  });
});

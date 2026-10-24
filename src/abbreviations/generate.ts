import { normalize } from '../storage/model';
export interface Candidate { text: string; score: number }
const COMMON = new Set('avec dans pour sans sous sur les des une aux par pas qui que quoi donc mais car est sont son ses ces cet cette tout tous nous vous leur elle elles ainsi alors aussi bien comme plus moins trop très entre autre fait faire avoir être mon ton mes tes nos vos vie jour mois ans fois non oui ici bon mal fin cas mot art air eau feu mer sol pays auto bus net web tab esc'.split(' '));
export function generateCandidates(word: string, frequency: number, occupied: Iterable<string>, documentWords: Iterable<string>): Candidate[] {
  const w = normalize(word).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');
  if (w.length < 5) return [];
  const blocked = new Set([...occupied, ...documentWords, ...COMMON].map(normalize));
  const consonants = w[0]! + w.slice(1).replace(/[aeiouy]/g, '');
  const options = new Map<string, number>();
  const add = (s: string, bonus: number): void => { options.set(s, Math.max(options.get(s) ?? 0, bonus)); };
  for (let length = 3; length <= 6; length++) {
    add(w.slice(0, length), 8);
    add(consonants.slice(0, length), 11);
    add(w.slice(0, 2) + consonants.slice(1, length - 1), 12);
    add(consonants.slice(0, length - 1) + w[w.length - 1]!, 6);
  }
  return [...options].filter(([s]) => s.length >= 3 && s.length <= 6 && w.length - s.length >= 3 && !blocked.has(s))
    .map(([text, bonus]) => ({ text, score: bonus + (w.length - text.length) * Math.log2(frequency + 1) + (text.length === 4 ? 9 : 0) - (/[^aeiouy]{5}/.test(text) ? 10 : 0) }))
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
}

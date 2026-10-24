import { normalize, type Settings } from '../storage/model';
export interface Range { from: number; to: number }
// Conservative exclusions: link labels, HTML and indented code are deliberately ignored too.
export function excludedRanges(text: string): Range[] {
  const ranges: Range[] = [];
  const add = (from: number, to: number): void => { ranges.push({ from, to }); };
  const lines = text.matchAll(/.*(?:\n|$)/g);
  let fence: { char: string; length: number; from: number } | undefined;
  let yaml = false;
  let yamlStart = 0;
  for (const line of lines) {
    const s = line[0], start = line.index;
    const content = s.replace(/^(?:\s{0,3}>[ \t]?)+/, '');
    if (!s) continue;
    if (start === 0 && /^\uFEFF?---\s*\r?\n$/.test(s)) { yaml = true; yamlStart = start; continue; }
    if (yaml) {
      if (/^(---|\.\.\.)\s*(?:\r?\n)?$/.test(s)) { add(yamlStart, start + s.length); yaml = false; }
      continue;
    }
    const marker = /^\s*(`{3,}|~{3,})/.exec(content)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.length && /^\s*(`+|~+)\s*$/.test(content)) {
        add(fence.from, start + s.length); fence = undefined;
      }
    } else if (marker) fence = { char: marker[0]!, length: marker.length, from: start };
    else if (/^(?: {4}|\t)/.test(s)) add(start, start + s.length);
  }
  if (fence) add(fence.from, text.length);
  if (yaml) add(yamlStart, text.length);
  // In-progress inline code and links must already be protected before closing punctuation.
  for (const line of text.matchAll(/[^\n]+/g)) {
    const s = line[0];
    const ticks = /`+/g;
    let open: { from: number; length: number } | undefined;
    for (const tick of s.matchAll(ticks)) {
      if (!open) open = { from: tick.index, length: tick[0].length };
      else if (tick[0].length === open.length) { add(line.index + open.from, line.index + tick.index + tick[0].length); open = undefined; }
    }
    if (open) add(line.index + open.from, line.index + s.length);
    const bracket = s.lastIndexOf('[');
    if (bracket >= 0 && !s.slice(bracket).includes(']')) add(line.index + bracket, line.index + s.length);
    const destination = /\]\([^)]*$/.exec(s);
    if (destination) add(line.index + destination.index, line.index + s.length);
  }
  const patterns = [
    /(`+)[\s\S]*?\1/g,
    /!?\[\[[^\]]*(?:\]\]|$)/g,
    /!?\[(?:[^\]\\]|\\.)*\](?:\([^\n]*?\)|\[[^\]]*\])?/g,
    /^\s{0,3}\[[^\]]+\]:.*$/gm,
    /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)[^\s<>]*/gi,
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    /<!--[\s\S]*?(?:-->|$)/g,
    /<[^>]*(?:>|$)/g,
  ];
  for (const pattern of patterns) for (const m of text.matchAll(pattern)) add(m.index, m.index + m[0].length);
  ranges.sort((a, b) => a.from - b.from);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}
export const isExcluded = (ranges: Range[], from: number, to: number): boolean => ranges.some(r => from < r.to && to > r.from);
export function countWords(text: string): Map<string, number> {
  const ranges = excludedRanges(text);
  const counts = new Map<string, number>();
  let rangeIndex = 0;
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)) {
    while (ranges[rangeIndex] && ranges[rangeIndex]!.to <= match.index) rangeIndex++;
    const r = ranges[rangeIndex];
    if (r && r.from < match.index + match[0].length) continue;
    // French elisions do not turn l’industrialisation into a different word.
    const word = normalize(match[0]).replace(/^(?:l|d|j|t|m|s|n|c|qu)'/u, '');
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}
export function eligibleWords(counts: Map<string, number>, settings: Settings): [string, number][] {
  const stop = new Set(settings.stopWords.split(/[\s,;]+/).map(normalize));
  return [...counts].filter(([word, count]) => [...word].length >= settings.minLength && count >= settings.minFrequency && !stop.has(word))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
}

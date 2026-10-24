import { EditorState, Prec, Transaction, type Extension, type Text } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { completionStatus } from '@codemirror/autocomplete';
import { excludedRanges, isExcluded, type Range } from '../analysis/markdown';
import { normalize, resolveRules, type Data } from '../storage/model';
const cache = new WeakMap<Text, Range[]>();
function ranges(doc: Text): Range[] {
  let result = cache.get(doc);
  if (!result) { result = excludedRanges(doc.toString()); cache.set(doc, result); }
  return result;
}
export function expansion(state: EditorState, data: Data, path: string): { from: number; to: number; insert: string } | undefined {
  if (!path || !data.settings.substitutions || state.selection.ranges.length !== 1 || !state.selection.main.empty) return;
  const end = state.selection.main.head;
  if (/^[\p{L}\p{M}\p{N}_'’-]/u.test(state.doc.sliceString(end, end + 2))) return;
  const start = Math.max(0, end - 128);
  const before = state.doc.sliceString(start, end);
  const match = /[\p{L}\p{M}\p{N}_'’-]+$/u.exec(before);
  if (!match || match.index === 0 && start > 0) return;
  const from = start + match.index;
  const rule = resolveRules(data, path).get(normalize(match[0]));
  if (rule && !isExcluded(ranges(state.doc), from, end)) return { from, to: end, insert: rule.replacement };
}
export function substitutionExtension(getData: () => Data, getPath: (state: EditorState) => string, composing: () => boolean = () => false): Extension {
  return [
    EditorState.transactionFilter.of(tr => {
      const data = getData();
      if (!data.settings.onSpace || composing() || !tr.isUserEvent('input.type') || tr.isUserEvent('input.type.compose') || !tr.docChanged || completionStatus(tr.startState) !== null) return tr;
      const changes: { from: number; to: number; insert: string }[] = [];
      tr.changes.iterChanges((from, to, _a, _b, text) => { changes.push({ from, to, insert: text.toString() }); });
      const change = changes[0];
      if (changes.length !== 1 || !change || change.from !== change.to || change.insert !== ' ' || change.from !== tr.startState.selection.main.head) return tr;
      const replacement = expansion(tr.startState, data, getPath(tr.startState));
      if (!replacement) return tr;
      // Sequential spec changes the result of this one keystroke. No recursive dispatch.
      return [tr, { changes: replacement, sequential: true, annotations: isolateHistory.of('full') }];
    }),
    Prec.high(keymap.of([{ key: 'Tab', run: (view: EditorView): boolean => {
      const data = getData();
      if (!data.settings.onTab || view.composing || completionStatus(view.state) !== null) return false;
      const change = expansion(view.state, data, getPath(view.state));
      if (!change) return false;
      view.dispatch({ changes: change, selection: { anchor: change.from + change.insert.length }, annotations: [Transaction.userEvent.of('input.smart-substitution'), isolateHistory.of('full')] });
      return true;
    } }])),
  ];
}

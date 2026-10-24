import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { substitutionExtension } from '../src/editor/substitution';
import { migrate } from '../src/storage/model';
function setup(doc = 'Les dplc', path = 'A.md', composing = false) {
  const data = migrate(null);
  data.rules.push({ id: '1', source: 'dplc', replacement: 'déplacement', scope: 'file', filePath: 'A.md', createdAt: 0, active: true, origin: 'automatic' });
  const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [history(), substitutionExtension(() => data, () => path, () => composing)] });
  return { state, data };
}
const typeSpace = (state: EditorState, event = 'input.type') => state.update({ changes: { from: state.selection.main.head, insert: ' ' }, selection: { anchor: state.selection.main.head + 1 }, annotations: Transaction.userEvent.of(event) }).state;
describe('vraies transactions CodeMirror', () => {
  it('remplace seulement le mot terminé et conserve le curseur', () => {
    const { state } = setup('dplc Les dplc'); const next = typeSpace(state);
    expect(next.doc.toString()).toBe('dplc Les déplacement ');
    expect(next.selection.main.head).toBe(next.doc.length);
  });
  it('ne remplace pas dans un autre mot ou après un identifiant', () => {
    for (const word of ['xdplc', 'a_dplc', 'a-dplc', "l’dplc"]) expect(typeSpace(setup(word).state).doc.toString()).toBe(word + ' ');
  });
  it('respecte la portée, activation et réglages', () => {
    expect(typeSpace(setup('dplc', 'B.md').state).doc.toString()).toBe('dplc ');
    const s = setup('dplc'); s.data.rules[0]!.active = false;
    expect(typeSpace(s.state).doc.toString()).toBe('dplc ');
    s.data.rules[0]!.active = true; s.data.settings.substitutions = false;
    expect(typeSpace(s.state).doc.toString()).toBe('dplc ');
  });
  it('ignore collage, composition IME et autocomplétion validée', () => {
    for (const event of ['input.paste', 'input.type.compose', 'input.complete', 'input.drop']) expect(typeSpace(setup().state, event).doc.toString()).toBe('Les dplc ');
    expect(typeSpace(setup('dplc', 'A.md', true).state).doc.toString()).toBe('dplc ');
    const { state } = setup('');
    expect(state.update({ changes: { from: 0, insert: 'dplc ' }, userEvent: 'input.type' }).newDoc.toString()).toBe('dplc ');
  });
  it('ignore contextes Markdown exclus et URL en cours de frappe', () => {
    for (const doc of ['```\ndplc', '~~~\ndplc', '`dplc` dplc'.slice(0, 5), 'https://test/dplc', '---\nfoo: dplc', '[[dplc', '[dplc](url)', '    dplc']) {
      expect(typeSpace(setup(doc).state).doc.toString()).toBe(doc + ' ');
    }
  });
  it('gère les sources Unicode', () => {
    const s = setup('éçà'); s.data.rules[0]!.source = 'éçà';
    expect(typeSpace(s.state).doc.toString()).toBe('déplacement ');
  });
  it('refuse les sélections multiples et les remplacements de sélection', () => {
    const s = setup('dplc');
    const state = EditorState.create({ doc: 'dplc dplc', selection: EditorSelection.create([EditorSelection.cursor(4), EditorSelection.cursor(9)]), extensions: [EditorState.allowMultipleSelections.of(true), substitutionExtension(() => s.data, () => 'A.md')] });
    expect(typeSpace(state).doc.toString()).toBe('dplc  dplc');
    const tr = s.state.update({ changes: { from: 0, to: 4, insert: ' ' }, userEvent: 'input.type' }); expect(tr.newDoc.toString()).toBe(' ');
  });
  it('annule et rétablit une substitution réelle sans récursion', () => {
    const view = new EditorView({ state: setup().state, parent: document.body });
    view.dispatch({ changes: { from: 8, insert: ' ' }, selection: { anchor: 9 }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe('Les déplacement ');
    expect(undo(view)).toBe(true); expect(view.state.doc.toString()).toBe('Les dplc');
    expect(redo(view)).toBe(true); expect(view.state.doc.toString()).toBe('Les déplacement ');
    view.destroy();
  });
  it('le retrait de l’extension désactive effectivement les substitutions', () => {
    const s = setup();
    const disabled = EditorState.create({ doc: s.state.doc, selection: s.state.selection });
    expect(typeSpace(disabled).doc.toString()).toBe('Les dplc ');
  });
  it('respecte le texte après le curseur et la limite droite du mot', () => {
    const s = setup('dplc suivant');
    const state = s.state.update({ selection: { anchor: 4 } }).state;
    const next = typeSpace(state);
    expect(next.doc.toString()).toBe('déplacement  suivant');
    expect(next.selection.main.head).toBe('déplacement '.length);
    const word = setup('dplcxyz').state.update({ selection: { anchor: 4 } }).state;
    expect(typeSpace(word).doc.toString()).toBe('dplc xyz');
  });
  it('déclenche Tab uniquement sur une règle reconnue', () => {
    const s = setup('dplc'); s.data.settings.onTab = true;
    const view = new EditorView({ state: s.state, parent: document.body });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('déplacement');
    expect(view.state.selection.main.head).toBe('déplacement'.length);
    undo(view); expect(view.state.doc.toString()).toBe('dplc');
    s.data.settings.onTab = false;
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(view.state.doc.toString()).toBe('dplc'); view.destroy();
  });
  it('laisse une autocomplétion en cours prioritaire', () => {
    const s = setup('dplc'); s.data.settings.onTab = true;
    const state = EditorState.create({ doc: 'dplc', selection: { anchor: 4 }, extensions: [substitutionExtension(() => s.data, () => 'A.md'), autocompletion({ override: [() => new Promise(() => {})] })] });
    const view = new EditorView({ state, parent: document.body });
    startCompletion(view); expect(completionStatus(view.state)).toBe('pending');
    expect(typeSpace(view.state).doc.toString()).toBe('dplc ');
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(view.state.doc.toString()).toBe('dplc'); view.destroy();
  });
});

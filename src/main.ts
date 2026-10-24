import { MarkdownView, Notice, Plugin, editorInfoField, type TFile } from 'obsidian';
import { EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { substitutionExtension } from './editor/substitution';
import { migrate, renamePath, type Data, type Suggestion } from './storage/model';
import { accept, analyze, pending } from './suggestions/service';
import { RuleModal, SmartSettings, SuggestionsModal } from './settings/ui';

export default class SmartSubstitutions extends Plugin {
  data!: Data;
  private analysisTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private displayTimer?: ReturnType<typeof setTimeout>;
  private saveQueue: Promise<void> = Promise.resolve();
  private stopped = false;
  private banner?: HTMLElement;
  private visible?: Suggestion;
  private lastShown = 0;
  private shown = new Set<string>();
  async onload(): Promise<void> {
    try { this.data = migrate(await this.loadData()); }
    catch (e) { new Notice(`Smart Substitutions : chargement impossible. Données conservées. ${String(e)}`); throw e; }
    this.addSettingTab(new SmartSettings(this.app, this));
    const views = new Set<EditorView>();
    this.registerEditorExtension([
      ViewPlugin.define(view => { views.add(view); return { destroy: () => { views.delete(view); } }; }),
      substitutionExtension(() => this.data, state => state.field(editorInfoField, false)?.file?.path ?? '', () => [...views].some(v => v.hasFocus && v.composing)),
      Prec.high(keymap.of([{ key: 'Escape', run: view => { if (this.visible && view.hasFocus) { this.dismiss(); return true; } return false; } }])),
    ]);
    this.register(() => views.clear());
    this.addCommand({ id: 'suggestions', name: 'Ouvrir les suggestions', callback: () => new SuggestionsModal(this.app, this).open() });
    this.addCommand({ id: 'analyze', name: 'Analyser le fichier courant', callback: () => { this.runAnalysis(true); new SuggestionsModal(this.app, this).open(); } });
    this.addCommand({ id: 'create', name: 'Créer une règle', callback: () => new RuleModal(this.app, this).open() });
    this.addCommand({ id: 'accept', name: 'Accepter la suggestion affichée', hotkeys: [{ modifiers: ['Alt'], key: 'Enter' }], checkCallback: checking => {
      if (!this.visible) return false;
      if (!checking) this.acceptVisible(); return true;
    } });
    this.addCommand({ id: 'dismiss', name: 'Fermer la suggestion affichée', checkCallback: checking => { if (!this.visible) return false; if (!checking) this.dismiss(); return true; } });
    this.registerEvent(this.app.workspace.on('file-open', () => { this.dismiss(); this.scheduleAnalysis(); }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => { this.dismiss(); this.scheduleAnalysis(); }));
    this.registerEvent(this.app.workspace.on('editor-change', () => this.scheduleAnalysis()));
    this.registerEvent(this.app.vault.on('modify', file => { if (file.path === this.activePath()) this.scheduleAnalysis(); }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { renamePath(this.data, oldPath, file.path); this.changed(); this.dismiss(); this.scheduleAnalysis(); }));
    this.registerEvent(this.app.vault.on('delete', file => { if (file.path === this.visible?.filePath) this.dismiss(); }));
    this.app.workspace.onLayoutReady(() => { if (!this.stopped) this.scheduleAnalysis(); });
  }
  activePath(): string { return this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? ''; }
  changed(): void {
    if (this.stopped) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { void this.flush(); }, 500);
    if (this.visible && (this.visible.status !== 'pending' || !this.data.suggestions.includes(this.visible))) this.dismiss();
  }
  async flush(): Promise<void> {
    const snapshot: Data = JSON.parse(JSON.stringify(this.data)) as Data;
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.saveData(snapshot));
    try { await this.saveQueue; } catch (e) { new Notice(`Smart Substitutions : échec de sauvegarde. ${String(e)}`); }
  }
  scheduleAnalysis(): void {
    clearTimeout(this.analysisTimer);
    if (this.stopped || !this.data.settings.autoAnalyze) return;
    this.analysisTimer = setTimeout(() => this.runAnalysis(), this.data.settings.debounceMs);
  }
  runAnalysis(force = false): void {
    if (this.stopped || (!force && !this.data.settings.autoAnalyze)) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file: TFile | null | undefined = view?.file;
    if (!view || !file || file.extension !== 'md') return;
    analyze(this.data, file.path, view.editor.getValue()); this.changed(); this.showNext();
  }
  private showNext(): void {
    if (this.stopped || this.visible) return;
    const s = pending(this.data, this.activePath()).find(s => !this.shown.has(s.id));
    if (!s) return;
    const delay = this.data.settings.notificationMs - (Date.now() - this.lastShown);
    if (delay > 0) { clearTimeout(this.displayTimer); this.displayTimer = setTimeout(() => this.showNext(), delay); return; }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    this.visible = s; this.shown.add(s.id); this.lastShown = Date.now();
    const banner = view.containerEl.createDiv({ cls: 'smart-substitutions-banner', attr: { role: 'region', 'aria-label': 'Raccourci suggéré' } });
    this.banner = banner;
    banner.createEl('strong', { text: `${s.abbreviation} → ${s.word}` });
    banner.createSpan({ text: ` · ${s.count} occurrences ` });
    const button = (text: string, action: () => void): void => { const b = banner.createEl('button', { text }); b.addEventListener('click', action); };
    button('Accepter', () => this.acceptVisible());
    button('Modifier', () => new RuleModal(this.app, this, undefined, s, () => this.dismiss()).open());
    button('Ignorer', () => { s.status = 'ignored'; this.changed(); this.dismiss(); });
    button('Fermer', () => this.dismiss());
  }
  private acceptVisible(): void {
    if (!this.visible || this.visible.filePath !== this.activePath()) return;
    try { accept(this.data, this.visible); this.changed(); this.dismiss(); } catch (e) { new Notice(String(e)); }
  }
  private dismiss(): void { this.banner?.remove(); this.banner = undefined; this.visible = undefined; clearTimeout(this.displayTimer); }
  onunload(): void {
    this.stopped = true;
    clearTimeout(this.analysisTimer); clearTimeout(this.saveTimer); clearTimeout(this.displayTimer);
    this.dismiss(); if (this.data) void this.flush();
  }
}

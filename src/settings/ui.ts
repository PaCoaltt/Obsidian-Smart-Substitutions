import { Modal, Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import type SmartSubstitutions from '../main';
import { accept, pending, validateRule } from '../suggestions/service';
import { normalize, uid, type Rule, type Suggestion } from '../storage/model';

export class RuleModal extends Modal {
  constructor(app: App, private plugin: SmartSubstitutions, private rule?: Rule, private suggestion?: Suggestion, private done: () => void = () => {}) { super(app); }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.rule ? 'Modifier la règle' : 'Créer un raccourci' });
    let source = this.rule?.source ?? this.suggestion?.abbreviation ?? '';
    let replacement = this.rule?.replacement ?? this.suggestion?.word ?? '';
    let scope = this.rule?.scope ?? (this.suggestion ? 'file' : this.plugin.data.settings.defaultScope);
    const filePath = this.rule?.filePath ?? this.suggestion?.filePath ?? this.plugin.activePath();
    new Setting(contentEl).setName('Abréviation').addText(t => t.setValue(source).onChange(v => { source = v; }));
    new Setting(contentEl).setName('Remplacement').addText(t => t.setValue(replacement).onChange(v => { replacement = v; }));
    if (!this.suggestion) new Setting(contentEl).setName('Portée').addDropdown(d => d.addOptions({ file: 'Fichier courant', global: 'Tous les fichiers' }).setValue(scope).onChange(v => { scope = v === 'global' ? 'global' : 'file'; }));
    contentEl.createEl('p', { text: `Fichier : ${filePath || 'aucun'}` });
    const errorEl = contentEl.createDiv({ attr: { role: 'alert' } });
    new Setting(contentEl).addButton(b => b.setButtonText('Enregistrer').setCta().onClick(() => {
      const draft = { source: normalize(source.trim()), replacement: replacement.trim(), scope, filePath: scope === 'file' ? filePath : undefined };
      const error = validateRule(this.plugin.data, draft, this.rule?.id);
      if (error) { errorEl.setText(error); return; }
      if (this.rule) Object.assign(this.rule, draft);
      else this.plugin.data.rules.push({ ...draft, id: uid(), createdAt: Date.now(), active: true, origin: this.suggestion ? 'automatic' : 'manual' });
      if (this.suggestion) this.suggestion.status = 'accepted';
      this.plugin.changed(); this.close(); this.done();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
export class SuggestionsModal extends Modal {
  constructor(app: App, private plugin: SmartSubstitutions) { super(app); }
  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Suggestions en attente' });
    const items = pending(this.plugin.data, this.plugin.activePath());
    if (!items.length) this.contentEl.createEl('p', { text: 'Aucune suggestion pour ce fichier.' });
    for (const s of items) {
      const row = new Setting(this.contentEl).setName(`${s.abbreviation} → ${s.word}`).setDesc(`Utilisé ${s.count} fois dans ce fichier.`);
      row.addButton(b => b.setButtonText('Accepter').onClick(() => { try { accept(this.plugin.data, s); this.plugin.changed(); this.onOpen(); } catch (e) { new Notice(String(e)); } }));
      row.addButton(b => b.setButtonText('Modifier').onClick(() => new RuleModal(this.app, this.plugin, undefined, s, () => this.onOpen()).open()));
      row.addButton(b => b.setButtonText('Refuser').onClick(() => { s.status = 'rejected'; this.plugin.changed(); this.onOpen(); }));
      row.addButton(b => b.setButtonText('Ignorer définitivement').onClick(() => { s.status = 'ignored'; this.plugin.changed(); this.onOpen(); }));
    }
  }
  onClose(): void { this.contentEl.empty(); }
}
export class ConfirmModal extends Modal {
  constructor(app: App, private confirmed: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.createEl('h2', { text: 'Supprimer cette règle ?' });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Annuler').onClick(() => this.close())).addButton(b => b.setButtonText('Supprimer').setWarning().onClick(() => { this.confirmed(); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}
export class SmartSettings extends PluginSettingTab {
  constructor(app: App, private plugin: SmartSubstitutions) { super(app, plugin); }
  display(): void {
    const el = this.containerEl; el.empty();
    const settings = this.plugin.data.settings;
    el.createEl('h2', { text: 'Analyse du fichier courant' });
    new Setting(el).setName('Analyse automatique').addToggle(t => t.setValue(settings.autoAnalyze).onChange(v => { settings.autoAnalyze = v; this.plugin.changed(); this.plugin.scheduleAnalysis(); }));
    const numeric = (key: 'minFrequency' | 'minLength' | 'maxSuggestions' | 'debounceMs' | 'notificationMs', label: string, min: number, max: number): void => {
      new Setting(el).setName(label).addText(t => t.setValue(String(settings[key])).onChange(v => {
        const n = Number(v); if (Number.isInteger(n) && n >= min && n <= max) { settings[key] = n; this.plugin.changed(); this.plugin.scheduleAnalysis(); }
      })).setDesc(`Entre ${min} et ${max}.`);
    };
    numeric('minFrequency', 'Occurrences minimales', 2, 10000);
    numeric('minLength', 'Longueur minimale', 3, 100);
    numeric('maxSuggestions', 'Suggestions maximales par fichier', 1, 50);
    numeric('debounceMs', 'Délai après modification (ms)', 300, 60000);
    numeric('notificationMs', 'Délai entre suggestions (ms)', 5000, 3600000);
    new Setting(el).setName('Mots vides').setDesc('Séparés par des espaces, virgules ou points-virgules.').addTextArea(t => t.setValue(settings.stopWords).onChange(v => { settings.stopWords = v; this.plugin.changed(); this.plugin.scheduleAnalysis(); }));
    el.createEl('h2', { text: 'Substitutions' });
    for (const [key, label] of [['substitutions', 'Activer les substitutions'], ['onSpace', 'Déclencher sur espace'], ['onTab', 'Déclencher sur Tab (si aucune autocomplétion)']] as const) {
      new Setting(el).setName(label).addToggle(t => t.setValue(settings[key]).onChange(v => { settings[key] = v; this.plugin.changed(); }));
    }
    new Setting(el).setName('Portée des règles manuelles').addDropdown(d => d.addOptions({ file: 'Fichier courant', global: 'Globale' }).setValue(settings.defaultScope).onChange(v => { settings.defaultScope = v === 'global' ? 'global' : 'file'; this.plugin.changed(); }));
    el.createEl('p', { text: 'Les suggestions automatiques créent toujours des règles locales. Les raccourcis se configurent dans Raccourcis clavier → Smart Substitutions.' });
    el.createEl('h2', { text: 'Dictionnaire' });
    new Setting(el).setName('Nouvelle règle').addButton(b => b.setButtonText('Créer').onClick(() => new RuleModal(this.app, this.plugin, undefined, undefined, () => this.display()).open()));
    for (const r of this.plugin.data.rules) {
      new Setting(el).setName(`${r.source} → ${r.replacement}`).setDesc(r.scope === 'global' ? 'Globale' : r.filePath ?? '')
        .addToggle(t => t.setValue(r.active).onChange(v => { r.active = v; this.plugin.changed(); }))
        .addButton(b => b.setButtonText('Modifier').onClick(() => new RuleModal(this.app, this.plugin, r, undefined, () => this.display()).open()))
        .addButton(b => b.setButtonText('Supprimer').onClick(() => new ConfirmModal(this.app, () => { this.plugin.data.rules = this.plugin.data.rules.filter(x => x.id !== r.id); this.plugin.changed(); this.display(); }).open()));
    }
    el.createEl('h2', { text: 'Suggestions refusées ou ignorées' });
    for (const s of this.plugin.data.suggestions.filter(s => s.status === 'ignored' || s.status === 'rejected')) {
      new Setting(el).setName(s.word).setDesc(`${s.filePath} · ${s.status === 'ignored' ? 'ignorée' : 'refusée'}`).addButton(b => b.setButtonText('Restaurer').onClick(() => { this.plugin.data.suggestions = this.plugin.data.suggestions.filter(x => x.id !== s.id); this.plugin.changed(); this.plugin.scheduleAnalysis(); this.display(); }));
    }
    el.createEl('h2', { text: 'Confidentialité' });
    el.createEl('p', { text: 'Traitement entièrement local et hors ligne. Aucun texte transmis à un serveur. Aucune télémétrie. Seul le fichier Markdown actif est analysé.' });
  }
}

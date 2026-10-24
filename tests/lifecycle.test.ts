import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SmartSubstitutions from '../src/main';
import { harness, vault, workspace } from './mock-obsidian';
import type { App, PluginManifest } from 'obsidian';
import { migrate } from '../src/storage/model';
import { accept, analyze } from '../src/suggestions/service';
describe('cycle de vie du plugin avec API Obsidian simulée', () => {
  let plugin: SmartSubstitutions;
  beforeEach(async () => {
    vi.useFakeTimers(); harness.saved = null; harness.writes = [];
    plugin = new SmartSubstitutions({} as App, {} as PluginManifest);
    await plugin.onload();
  });
  afterEach(async () => {
    plugin.onunload();
    for (const fn of harness.cleanups.splice(0)) fn();
    await Promise.resolve(); await Promise.resolve();
    vi.useRealTimers(); vi.clearAllMocks();
  });
  it('debounce les événements et nettoie événements, extensions et timers au déchargement', async () => {
    expect(workspace.count() + vault.count()).toBe(6);
    expect(harness.extensions.length).toBe(1);
    workspace.emit('editor-change');
    await vi.advanceTimersByTimeAsync(1000);
    workspace.emit('editor-change');
    await vi.advanceTimersByTimeAsync(1000);
    expect(workspace.getActiveViewOfType).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(workspace.getActiveViewOfType).toHaveBeenCalledTimes(1);
    workspace.emit('editor-change'); plugin.changed();
    plugin.onunload(); for (const fn of harness.cleanups.splice(0)) fn();
    const calls = workspace.getActiveViewOfType.mock.calls.length;
    workspace.emit('editor-change'); await vi.advanceTimersByTimeAsync(10000);
    expect(workspace.count() + vault.count()).toBe(0);
    expect(harness.extensions.length).toBe(0);
    expect(workspace.getActiveViewOfType).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sauvegarde via saveData, fusionne les écritures et restaure via loadData', async () => {
    plugin.data.settings.minFrequency = 12;
    accept(plugin.data, analyze(plugin.data, 'A.md', 'déplacement '.repeat(12))[0]!);
    plugin.changed(); plugin.changed();
    await vi.advanceTimersByTimeAsync(500);
    expect(harness.writes).toHaveLength(1);
    expect(migrate(harness.saved).settings.minFrequency).toBe(12);
    plugin.data.settings.minFrequency = 13; plugin.changed(); plugin.onunload();
    await plugin.flush();
    expect(migrate(harness.saved).settings.minFrequency).toBe(13);
    for (const fn of harness.cleanups.splice(0)) fn();
    plugin = new SmartSubstitutions({} as App, {} as PluginManifest);
    await plugin.onload();
    expect(plugin.data.settings.minFrequency).toBe(13);
    expect(plugin.data.rules[0]?.replacement).toBe('déplacement');
    expect(plugin.data.suggestions[0]?.status).toBe('accepted');
  });
  it('les événements de renommage déplacent effectivement les règles', () => {
    plugin.data.rules.push({ id: 'x', source: 'dplc', replacement: 'déplacement', scope: 'file', filePath: 'A.md', createdAt: 0, active: true, origin: 'manual' });
    vault.emit('rename', { path: 'B.md' }, 'A.md');
    expect(plugin.data.rules[0]?.filePath).toBe('B.md');
  });
});

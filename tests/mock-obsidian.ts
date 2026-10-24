import { vi } from 'vitest';
class Events {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(name: string, fn: (...args: unknown[]) => void): () => void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(fn); this.listeners.set(name, listeners);
    return () => { listeners.delete(fn); };
  }
  emit(name: string, ...args: unknown[]): void { for (const fn of this.listeners.get(name) ?? []) fn(...args); }
  count(): number { return [...this.listeners.values()].reduce((n, s) => n + s.size, 0); }
}
export const workspace = Object.assign(new Events(), {
  getActiveViewOfType: vi.fn(() => null),
  onLayoutReady: (fn: () => void) => fn(),
});
export const vault = new Events();
export const harness = { saved: null as unknown, writes: [] as unknown[], extensions: [] as unknown[], cleanups: [] as (() => void)[] };
export class Plugin {
  app = { workspace, vault };
  addSettingTab(): void {}
  addCommand(): void {}
  registerEditorExtension(extension: unknown): void { harness.extensions.push(extension); this.register(() => { harness.extensions = []; }); }
  register(fn: () => void): void { harness.cleanups.push(fn); }
  registerEvent(dispose: () => void): void { this.register(dispose); }
  async loadData(): Promise<unknown> { return harness.saved; }
  async saveData(value: unknown): Promise<void> { harness.saved = value; harness.writes.push(value); }
}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownView {}
export class Notice {}
export { editorInfoField } from './mock-field';

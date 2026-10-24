import { StateField } from '@codemirror/state';
export const editorInfoField = StateField.define<unknown>({ create: () => undefined, update: v => v });

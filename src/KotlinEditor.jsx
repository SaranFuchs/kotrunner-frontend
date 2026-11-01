import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { kotlin } from '@codemirror/legacy-modes/mode/clike';

const extensions = [
  StreamLanguage.define(kotlin),
  EditorView.contentAttributes.of({ 'aria-label': 'Kotlin code editor', 'aria-describedby': 'editor-keyboard-help' }),
];

export default function KotlinEditor({ value, onChange, editable }) {
  return <><span id="editor-keyboard-help" className="sr-only">Edit the entire Kotlin function. Press Escape, then Tab to move focus out of the editor.</span><CodeMirror value={value} height="330px" extensions={extensions} onChange={onChange} editable={editable} basicSetup={{ foldGutter: false, autocompletion: true }} /></>;
}

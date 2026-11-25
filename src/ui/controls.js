/**
 * Control panel: DOM rendering and input plumbing.
 *
 * Layer: L5 (UI adapter). Owns the widgets inside `root` and nothing else. It
 * never mutates state: every interaction emits a patch, and `render()` is the
 * only way the panel learns about changes - so the panel can be re-rendered
 * from any source (user, preset, browser test) with the same result.
 */

import { buildPanel, presetOptions } from './schema.js';

const BUTTONS = Object.freeze([
  Object.freeze({ action: 'new-seed', label: 'New terrain' }),
  Object.freeze({ action: 'reset-view', label: 'Reset view' }),
  Object.freeze({ action: 'save-png', label: 'Save PNG' }),
  Object.freeze({ action: 'reset-all', label: 'Reset all' }),
]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatValue(field) {
  if (field.kind === 'toggle') return field.value ? 'on' : 'off';
  if (field.kind === 'select') return '';
  const step = field.step ?? 1;
  const digits = step >= 1 ? 0 : String(step).split('.')[1]?.length ?? 1;
  return `${Number(field.value).toFixed(digits)}${field.unit ? ` ${field.unit}` : ''}`;
}

/**
 * @param {{root:HTMLElement, getState:()=>object, onPatch:(patch:Record<string,unknown>)=>void,
 *   onAction:(action:{type:string, value?:unknown})=>void}} options
 * @returns {{render:()=>void, dispose:()=>void, fieldKeys:()=>string[]}}
 */
export function createControls(options) {
  const { root, getState, onPatch, onAction } = options;
  /** @type {Map<string, {field:object, input:HTMLElement, output?:HTMLElement}>} */
  const widgets = new Map();
  let structureSignature = '';
  let presetSelect = null;

  function buildRange(field, container) {
    const row = el('div', 'field');
    const head = el('div', 'field-head');
    head.appendChild(el('label', 'field-label', field.label));
    const output = el('span', 'field-value', formatValue(field));
    head.appendChild(output);
    row.appendChild(head);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step ?? 1);
    input.value = String(field.value);
    input.dataset.key = field.key;
    input.disabled = Boolean(field.disabled);
    if (field.hint) input.title = field.hint;
    input.addEventListener('input', () => {
      onPatch({ [field.key]: Number(input.value) });
    });
    row.appendChild(input);
    container.appendChild(row);
    widgets.set(field.key, { field, input, output });
  }

  function buildToggle(field, container) {
    const row = el('label', 'field field-toggle');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(field.value);
    input.dataset.key = field.key;
    input.addEventListener('change', () => onPatch({ [field.key]: input.checked }));
    row.appendChild(input);
    row.appendChild(el('span', 'field-label', field.label));
    if (field.hint) row.title = field.hint;
    container.appendChild(row);
    widgets.set(field.key, { field, input });
  }

  function buildSelect(field, container) {
    const row = el('div', 'field');
    const head = el('div', 'field-head');
    head.appendChild(el('label', 'field-label', field.label));
    row.appendChild(head);
    const input = document.createElement('select');
    input.dataset.key = field.key;
    for (const option of field.options ?? []) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      input.appendChild(node);
    }
    input.value = String(field.value);
    input.addEventListener('change', () => onPatch({ [field.key]: input.value }));
    row.appendChild(input);
    container.appendChild(row);
    widgets.set(field.key, { field, input });
  }

  function buildPresetRow(container) {
    const row = el('div', 'field');
    const head = el('div', 'field-head');
    head.appendChild(el('label', 'field-label', 'Scenario'));
    row.appendChild(head);
    const select = document.createElement('select');
    select.dataset.key = 'preset';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Load a scenario...';
    select.appendChild(placeholder);
    for (const option of presetOptions()) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.title = option.hint ?? '';
      select.appendChild(node);
    }
    select.addEventListener('change', () => {
      if (!select.value) return;
      onAction({ type: 'apply-preset', value: select.value });
      select.value = '';
    });
    row.appendChild(select);
    container.appendChild(row);
    presetSelect = select;
  }

  function buildButtons(container) {
    const row = el('div', 'button-row');
    for (const button of BUTTONS) {
      const node = el('button', 'btn', button.label);
      node.type = 'button';
      node.dataset.action = button.action;
      node.addEventListener('click', () => onAction({ type: button.action }));
      row.appendChild(node);
    }
    container.appendChild(row);
  }

  function renderGroup(group, container) {
    const section = el('section', 'group');
    section.dataset.group = group.id;
    section.appendChild(el('h2', 'group-title', group.title));
    if (group.note) section.appendChild(el('p', 'group-note', group.note));
    for (const field of group.fields) {
      if (field.kind === 'toggle') buildToggle(field, section);
      else if (field.kind === 'select') buildSelect(field, section);
      else buildRange(field, section);
    }
    container.appendChild(section);
  }

  /** Repaint (or rebuild when the set of controls changed). */
  function render() {
    const state = getState();
    const panel = buildPanel(state);
    const signature = panel.map((group) => `${group.id}:${group.fields.map((f) => f.key).join('|')}`).join(';');

    if (signature !== structureSignature) {
      structureSignature = signature;
      widgets.clear();
      root.replaceChildren();
      const presets = el('section', 'group');
      buildPresetRow(presets);
      root.appendChild(presets);
      for (const group of panel) renderGroup(group, root);
      const actions = el('section', 'group');
      buildButtons(actions);
      root.appendChild(actions);
      return;
    }

    for (const group of panel) {
      for (const field of group.fields) {
        const widget = widgets.get(field.key);
        if (!widget) continue;
        widget.field = field;
        if (field.kind === 'toggle') widget.input.checked = Boolean(field.value);
        else if (field.kind === 'select') widget.input.value = String(field.value);
        else {
          widget.input.value = String(field.value);
          widget.input.disabled = Boolean(field.disabled);
          if (widget.output) widget.output.textContent = formatValue(field);
        }
      }
    }
  }

  function fieldKeys() {
    return Array.from(widgets.keys());
  }

  function dispose() {
    widgets.clear();
    root.replaceChildren();
    presetSelect = null;
  }

  render();

  return { render, dispose, fieldKeys };
}

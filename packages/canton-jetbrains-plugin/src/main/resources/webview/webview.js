// Adapted from https://github.com/digital-asset/daml/blob/main/sdk/compiler/daml-extension/src/webview.js
// Copyright (c) 2025 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// JCEF host bridges window.jbBridge to the JetBrains plugin. This file replaces
// VSCode's acquireVsCodeApi() with a thin shim that posts to jbBridge.

const vscode = {
  postMessage: function (msg) {
    if (typeof window.jbBridge !== 'undefined' && typeof window.jbBridge.postMessage === 'function') {
      try {
        window.jbBridge.postMessage(JSON.stringify(msg));
        return;
      } catch (e) {
        console.error('jbBridge.postMessage failed', e);
      }
    }
    console.log('msg (no bridge):', msg);
  }
};

// Strips <script> tags, on* event handlers, and javascript:/data: URIs from server-pushed
// HTML before insertion. Defense in depth alongside the page-level CSP — both must agree
// to allow execution.
function sanitizeAndAssign(target, html) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = String(html == null ? '' : html);
  const source = tmpl.content.querySelector('body') || tmpl.content;
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT);
  const drop = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'meta' || tag === 'link') {
      drop.push(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const v = attr.value;
      if (n.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^(javascript|data|vbscript):/i.test(v.trim())) {
        el.removeAttribute(attr.name);
      }
    }
  }
  drop.forEach(el => el.remove());
  target.replaceChildren();
  removeEmbeddedToolbar(source);
  // Move children into target (no further parsing).
  while (source.firstChild) target.appendChild(source.firstChild);
  pruneEmptyText(target);
}

function removeEmbeddedToolbar(root) {
  const embeddedControlSelector = [
    '#show_archived',
    '#show_detailed_disclosure',
    'button'
  ].join(',');
  for (const el of Array.from(root.querySelectorAll(embeddedControlSelector))) {
    const text = (el.textContent || '').trim();
    const isKnownButton = el.tagName.toLowerCase() === 'button' &&
      /^(show table view|show transaction view|toggle table\/transaction view)$/i.test(text);
    const isKnownInput = el.id === 'show_archived' || el.id === 'show_detailed_disclosure';
    if (!isKnownButton && !isKnownInput) continue;
    const label = el.closest('label');
    if (isKnownInput && !label) {
      removeAdjacentText(el, el.id === 'show_archived' ? /show archived/i : /show detailed disclosure/i);
    }
    const candidate = label || el;
    candidate.remove();
  }
  for (const el of Array.from(root.querySelectorAll('br'))) {
    const previous = el.previousSibling && String(el.previousSibling.textContent || '').trim();
    const next = el.nextSibling && String(el.nextSibling.textContent || '').trim();
    if (!previous && !next) el.remove();
  }
}

function removeAdjacentText(element, pattern) {
  for (const siblingKey of ['previousSibling', 'nextSibling']) {
    const sibling = element[siblingKey];
    if (sibling && sibling.nodeType === Node.TEXT_NODE && pattern.test(sibling.textContent || '')) {
      sibling.remove();
    }
  }
}

function pruneEmptyText(root) {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
  }
}

function toggleCheckbox(checkboxId, classId, cmdId) {
  const isChecked = document.getElementById(checkboxId).checked;
  document.body.classList.toggle(classId, !isChecked);
  vscode.postMessage({ command: cmdId, value: isChecked });
}

function show_archived_changed() {
  toggleCheckbox('show_archived', 'hide_archived', 'set_show_archived');
}

function toggle_detailed_disclosure() {
  toggleCheckbox('show_detailed_disclosure', 'hidden_disclosure', 'set_show_detailed_disclosure');
}

function toggle_view() {
  document.body.classList.toggle('hide_transaction');
  document.body.classList.toggle('hide_table');
  updateToggleLabel();
  vscode.postMessage({
    command: 'set_selected_view',
    value: document.body.classList.contains('hide_transaction') ? 'table' : 'transaction'
  });
}

function setHtmlContent(html) {
  document.body.classList.remove('empty');
  sanitizeAndAssign(document.getElementById('content'), html);
  updateToggleLabel();
}

function updateToggleLabel() {
  const button = document.getElementById('toggle_view');
  if (!button) return;
  button.textContent = document.body.classList.contains('hide_transaction')
    ? 'Show transaction view'
    : 'Show table view';
}

window.addEventListener('message', function (event) {
  const message = event.data;

  function showOrHideClassWithName(show, showClass, hideClass, checkBoxId) {
    document.body.classList.remove(show ? hideClass : showClass);
    document.body.classList.add(show ? showClass : hideClass);
    const cb = document.getElementById(checkBoxId);
    if (cb) cb.checked = show;
  }

  switch (message.command) {
    case 'set_html':
      setHtmlContent(message.value);
      break;
    case 'add_note':
      document.body.classList.remove('hide_note');
      sanitizeAndAssign(document.getElementById('note'), message.value);
      break;
    case 'set_view':
      switch (message.value.selected) {
        case 'transaction':
          document.body.classList.remove('hide_transaction');
          document.body.classList.add('hide_table');
          break;
        case 'table':
          document.body.classList.add('hide_transaction');
          document.body.classList.remove('hide_table');
          break;
        default:
          console.log('Unexpected value for select_view: ' + message.value.selected);
          break;
      }
      showOrHideClassWithName(message.value.showArchived, 'show_archived', 'hide_archived', 'show_archived');
      showOrHideClassWithName(message.value.showDetailedDisclosure, 'show_disclosure', 'hidden_disclosure', 'show_detailed_disclosure');
      updateToggleLabel();
      break;
  }
});

document.addEventListener('click', function (event) {
  const target = event.target && event.target.closest ? event.target.closest('a[href]') : null;
  if (!target) return;
  const href = target.getAttribute('href') || '';
  if (!href.startsWith('command:daml.revealLocation')) return;
  event.preventDefault();
  vscode.postMessage({ command: 'reveal_location', value: href });
});

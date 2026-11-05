(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const content = document.getElementById('content');
  const fontValue = document.getElementById('fontValue');
  let fontSize = 17;

  const post = (type, value) => vscode.postMessage({ type, value });

  function markActive(attribute, value) {
    document.querySelectorAll(`button[${attribute}]`).forEach((button) => {
      const active = button.getAttribute(attribute) === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  window.addEventListener('message', ({ data }) => {
    if (data.type !== 'render') return;
    content.innerHTML = data.html;
    content.setAttribute('dir', data.dir);
    document.body.style.setProperty('--fs', `${data.fontSize}px`);
    fontSize = data.fontSize;
    fontValue.textContent = String(data.fontSize);
    markActive('data-mode', data.mode);
  });

  document.querySelectorAll('button[data-mode]').forEach((button) => {
    button.addEventListener('click', () => post('setMode', button.dataset.mode));
  });
  document.getElementById('fontDown').addEventListener('click', () => post('setFontSize', fontSize - 1));
  document.getElementById('fontUp').addEventListener('click', () => post('setFontSize', fontSize + 1));
  document.getElementById('print').addEventListener('click', () => post('print'));
  document.getElementById('edit').addEventListener('click', () => post('editSource'));

  // Copy: the selection if there is one, otherwise the whole page, as rich HTML plus plain text.
  const COPY_STYLE =
    "font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#080808;";
  document.getElementById('copy').addEventListener('click', () => {
    const selection = window.getSelection();
    let html = content.innerHTML;
    let plain = content.innerText;
    if (selection && selection.rangeCount && selection.toString().trim()) {
      const holder = document.createElement('div');
      holder.appendChild(selection.getRangeAt(0).cloneContents());
      html = holder.innerHTML;
      plain = selection.toString();
    }
    const dir = content.getAttribute('dir');
    const onCopy = (event) => {
      event.clipboardData.setData('text/html', `<div dir="${dir}" style="${COPY_STYLE}">${html}</div>`);
      event.clipboardData.setData('text/plain', plain);
      event.preventDefault();
    };
    document.addEventListener('copy', onCopy, { once: true });
    if (document.execCommand('copy')) post('copied');
    else document.removeEventListener('copy', onCopy);
  });

  content.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id) || document.getElementById(id.toLowerCase());
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    vscode.postMessage({ type: 'link', href });
  });

  post('ready');
})();

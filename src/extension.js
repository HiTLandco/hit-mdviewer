'use strict';
const vscode = require('vscode');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { render } = require('./render');

const VIEW_TYPE = 'hitland.mdViewer';
const MIN_FONT = 12;
const MAX_FONT = 28;
const DEFAULT_FONT = 17;
const RENDER_DELAY_MS = 150;
const EXTERNAL_LINK = /^[a-z][a-z0-9+.-]*:/i;

const sourceUris = new Set(); // files the user chose to see as text; they stay text until that tab closes

const nonce = () => crypto.randomBytes(16).toString('base64url');

function splitLink(href) {
  const hash = href.indexOf('#');
  return hash < 0 ? { file: href, fragment: '' } : { file: href.slice(0, hash), fragment: href.slice(hash + 1) };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

class Provider {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.mediaUri = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.lastRender = null; // read by the integration test through the activate() return value
  }

  settings(document) {
    return {
      mode: this.context.workspaceState.get(`mode:${document.uri.toString()}`, 'auto'),
      fontSize: this.context.globalState.get('fontSize', DEFAULT_FONT),
    };
  }

  resolveImage(document, toUrl) {
    return (src) => {
      if (EXTERNAL_LINK.test(src) || src.startsWith('//') || document.uri.scheme !== 'file') return src;
      const target = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(document.uri.fsPath)), safeDecode(splitLink(src).file));
      return toUrl(target);
    };
  }

  /** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
  resolveCustomTextEditor(document, panel) {
    const webview = panel.webview;
    const roots = [this.mediaUri, ...(vscode.workspace.workspaceFolders || []).map((f) => f.uri)];
    if (document.uri.scheme === 'file') {
      const dir = path.dirname(document.uri.fsPath);
      roots.push(vscode.Uri.file(dir), vscode.Uri.file(path.dirname(dir)));
    }
    webview.options = { enableScripts: true, localResourceRoots: roots };
    webview.html = this.shell(webview);

    const update = () => {
      const settings = this.settings(document);
      const { html, dir } = render(document.getText(), {
        mode: settings.mode,
        resolveImage: this.resolveImage(document, (uri) => webview.asWebviewUri(uri).toString()),
      });
      this.lastRender = { uri: document.uri.toString(), dir, html, settings };
      webview.postMessage({ type: 'render', html, dir, ...settings });
    };

    let timer;
    const changes = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      clearTimeout(timer);
      timer = setTimeout(update, RENDER_DELAY_MS);
    });
    panel.onDidDispose(() => {
      clearTimeout(timer);
      changes.dispose();
    });

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          update();
          break;
        case 'setMode':
          await this.context.workspaceState.update(`mode:${document.uri.toString()}`, message.value);
          update();
          break;
        case 'setFontSize':
          await this.context.globalState.update('fontSize', Math.min(MAX_FONT, Math.max(MIN_FONT, message.value)));
          update();
          break;
        case 'link':
          await this.openLink(document, message.href);
          break;
        case 'editSource':
          await editSource(document.uri);
          break;
        case 'print':
          await this.print(document);
          break;
        case 'copied':
          vscode.window.setStatusBarMessage('MD Reader +RTL: copied with formatting', 3000);
          break;
      }
    });
  }

  async openLink(document, href) {
    if (EXTERNAL_LINK.test(href) && !/^file:/i.test(href)) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }
    const { file, fragment } = splitLink(href);
    const target = /^file:/i.test(file)
      ? vscode.Uri.parse(file)
      : vscode.Uri.joinPath(vscode.Uri.file(path.dirname(document.uri.fsPath)), safeDecode(file));
    const line = /^L(\d+)/.exec(fragment);
    const options = line ? { selection: new vscode.Range(+line[1] - 1, 0, +line[1] - 1, 0) } : undefined;
    try {
      await vscode.workspace.fs.stat(target);
      if (line) sourceUris.add(target.toString()); // a line link needs the text editor
      await vscode.commands.executeCommand('vscode.open', target, options);
    } catch {
      vscode.window.showWarningMessage(`MD Reader +RTL: file not found: ${safeDecode(file)}`);
    }
  }

  // Webviews cannot print, so the page opens in the default browser, like the desktop app.
  async print(document) {
    const css = fs
      .readFileSync(path.join(this.mediaUri.fsPath, 'viewer.css'), 'utf8')
      .replace(/url\(fonts\//g, `url(${vscode.Uri.joinPath(this.mediaUri, 'fonts')}/`);
    const settings = this.settings(document);
    const { html, dir } = render(document.getText(), {
      mode: settings.mode,
      resolveImage: this.resolveImage(document, (uri) => uri.toString()),
    });
    const scriptNonce = nonce();
    const page = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: https: data:; font-src file:; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'">
<title>${path.basename(document.uri.fsPath).replace(/[<>&]/g, '')}</title><style>${css}</style></head>
<body style="--fs:${settings.fontSize}px"><main id="content" dir="${dir}">${html}</main>
<script nonce="${scriptNonce}">addEventListener('load',()=>print())</script></body></html>`;
    const id = crypto.createHash('sha1').update(document.uri.toString()).digest('hex').slice(0, 10);
    const file = path.join(os.tmpdir(), `hit-md-print-${id}.html`);
    fs.writeFileSync(file, page, 'utf8');
    await vscode.env.openExternal(vscode.Uri.file(file));
  }

  shell(webview) {
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaUri, 'viewer.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.mediaUri, 'viewer.js'));
    const scriptNonce = nonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${scriptNonce}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}">
</head>
<body>
<header id="toolbar" dir="ltr">
  <div class="group" role="group" aria-label="Text direction">
    <button data-mode="auto">Auto</button>
    <button data-mode="rtl">RTL</button>
    <button data-mode="ltr">LTR</button>
  </div>
  <div class="group" role="group" aria-label="Text size">
    <button id="fontDown" aria-label="Smaller text">A−</button>
    <span id="fontValue"></span>
    <button id="fontUp" aria-label="Larger text">A+</button>
  </div>
  <div class="spacer"></div>
  <div class="group">
    <button id="copy">Copy</button>
    <button id="print">Print</button>
    <button id="edit">Edit Source</button>
  </div>
</header>
<main id="content"></main>
<script nonce="${scriptNonce}" src="${js}"></script>
</body>
</html>`;
  }
}

function editSource(uri) {
  sourceUris.add(uri.toString());
  return vscode.commands.executeCommand('vscode.openWith', uri, 'default', vscode.ViewColumn.Beside);
}

// ── Open Markdown in the viewer ───────────────────────────────────────────────
// The custom editor stays at priority "option" and plain text tabs are switched here, because a
// "default" custom editor also takes over diff views: git diffs and agent edit approvals would break.
// Diff tabs have a different input type, so this code never sees them.

const MARKDOWN_FILE = /\.(md|markdown)$/i;
const SWITCH_DELAY_MS = 60;
const REOPEN_WINDOW_MS = 250;
const switching = new Set();
const viewerClosedAt = new Map();

function isMarkdownTextTab(tab) {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputText &&
    (input.uri.scheme === 'file' || input.uri.scheme === 'vscode-remote') &&
    MARKDOWN_FILE.test(input.uri.path)
  );
}

function findTextTab(group, uri) {
  return group.tabs.find((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri);
}

async function switchToViewer(uri, viewColumn) {
  const key = uri.toString();
  const group = vscode.window.tabGroups.all.find((g) => g.viewColumn === viewColumn);
  const tab = group && findTextTab(group, key);
  if (!tab || !tab.isActive || sourceUris.has(key) || switching.has(key)) return;
  // A viewer closed a moment ago means "Reopen Editor With > Text Editor": the user asked for the text.
  if (tab.isDirty || Date.now() - (viewerClosedAt.get(key) || 0) < REOPEN_WINDOW_MS) {
    sourceUris.add(key);
    return;
  }
  if (!vscode.workspace.getConfiguration('hitMdViewer').get('openByDefault', true)) return;

  switching.add(key);
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, {
      viewColumn,
      preview: tab.isPreview,
      preserveFocus: !group.isActive,
    });
    const leftover = findTextTab(group, key);
    if (leftover) await vscode.window.tabGroups.close(leftover, true);
  } finally {
    switching.delete(key);
  }
}

function onTabsChanged(event) {
  for (const tab of event.closed) {
    const input = tab.input;
    if (input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE) {
      viewerClosedAt.set(input.uri.toString(), Date.now());
    } else if (input instanceof vscode.TabInputText) {
      const key = input.uri.toString();
      if (!vscode.window.tabGroups.all.some((group) => findTextTab(group, key))) sourceUris.delete(key);
    }
  }
  for (const tab of [...event.opened, ...event.changed]) {
    if (tab.isActive && isMarkdownTextTab(tab)) {
      const { uri } = tab.input;
      const { viewColumn } = tab.group;
      setTimeout(() => switchToViewer(uri, viewColumn), SWITCH_DELAY_MS);
    }
  }
}

function activeTabUri() {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input && input.uri instanceof vscode.Uri ? input.uri : undefined;
}

function activate(context) {
  const provider = new Provider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('hitMdViewer.editSource', (uri) => {
      const target = uri || activeTabUri();
      if (target) return editSource(target);
    }),
    vscode.commands.registerCommand('hitMdViewer.openViewer', (uri) => {
      const target = uri || activeTabUri();
      if (target) return vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
    }),
    vscode.window.tabGroups.onDidChangeTabs(onTabsChanged)
  );
  // Tabs already open when the extension starts.
  for (const group of vscode.window.tabGroups.all) {
    const tab = group.activeTab;
    if (tab && isMarkdownTextTab(tab)) switchToViewer(tab.input.uri, group.viewColumn);
  }
  return { getLastRender: () => provider.lastRender };
}

function deactivate() {}

module.exports = { activate, deactivate };

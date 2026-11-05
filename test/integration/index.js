'use strict';
// Runs inside the editor: scripts/run-integration.ps1 starts it with a throwaway profile. Writes results to HIT_TEST_OUT.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VIEW_TYPE = 'hitland.mdViewer';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`timeout: ${label}`);
}

function describeTab() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = tab && tab.input;
  if (!input) return 'none';
  if (input instanceof vscode.TabInputCustom) return `custom:${input.viewType}`;
  if (input instanceof vscode.TabInputTextDiff) return 'text-diff';
  if (input instanceof vscode.TabInputText) return 'text';
  return `other:${tab.label}`;
}

async function run() {
  const results = {};
  const record = (name, value) => {
    results[name] = value;
    fs.writeFileSync(process.env.HIT_TEST_OUT, JSON.stringify(results, null, 2));
  };

  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-reader-test-'));
    const file = path.join(dir, 'نمونه.md');
    fs.writeFileSync(file, '# سلام\n\nاین یک متن فارسی است.\n\nThis line is English.\n\n[بعدی](other.md)\n');
    fs.writeFileSync(path.join(dir, 'other.md'), '# Other\n');
    const uri = vscode.Uri.file(file);

    const extension = vscode.extensions.getExtension('hitland.md-reader-rtl');
    record('extensionFound', !!extension);
    const api = await extension.activate();

    await vscode.commands.executeCommand('vscode.open', uri);
    await until(() => describeTab() === `custom:${VIEW_TYPE}`, 'viewer tab');
    record('openMd', describeTab());
    record('editorRestore', vscode.window.tabGroups.activeTabGroup.tabs.length);

    const first = await until(() => api.getLastRender(), 'first render');
    record('firstRenderDir', first.dir);
    record('firstRenderHtmlHasRtlHeading', /<h1[^>]*dir="rtl"/.test(first.html));
    record('firstRenderHtmlHasLtrLine', /<p dir="ltr">This line/.test(first.html));

    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), '## زنده\n\n');
    await vscode.workspace.applyEdit(edit);
    await until(() => api.getLastRender().html.includes('زنده'), 'live update');
    record('liveUpdate', true);
    await vscode.commands.executeCommand('workbench.action.files.revert');

    await vscode.commands.executeCommand('hitMdViewer.editSource', uri);
    await until(() => describeTab() === 'text', 'source tab');
    await sleep(800); // the source tab must not be switched back to the viewer
    record('editSource', describeTab());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(800);

    // Opening again after the source tab closed goes back to the viewer.
    await vscode.commands.executeCommand('vscode.open', uri);
    await until(() => describeTab() === `custom:${VIEW_TYPE}`, 'viewer after source closed');
    record('reopenAfterSource', describeTab());
    record('textTabLeftBehind', vscode.window.tabGroups.activeTabGroup.tabs.filter((t) => t.input instanceof vscode.TabInputText).length);

    // Reopen Editor With > Text Editor stays text.
    await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
    await sleep(1000);
    record('reopenAsText', describeTab());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(600);

    // Reader turned off: Markdown opens as plain text.
    const config = vscode.workspace.getConfiguration('hitMdViewer');
    await config.update('openByDefault', false, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('vscode.open', uri);
    await sleep(800);
    record('settingOff', describeTab());
    await config.update('openByDefault', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(300);

    // Git-style diff: virtual left side, real file on the right.
    const old = vscode.Uri.parse('hitold:/نمونه.md');
    const sub = vscode.workspace.registerTextDocumentContentProvider('hitold', {
      provideTextDocumentContent: () => '# قدیمی\n',
    });
    await vscode.commands.executeCommand('vscode.diff', old, uri, 'git style diff');
    await sleep(1500);
    record('diffVirtualToFile', describeTab());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // Agent-style diff: both sides virtual.
    const proposed = vscode.Uri.parse('hitold:/proposed/نمونه.md');
    await vscode.commands.executeCommand('vscode.diff', old, proposed, 'agent style diff');
    await sleep(1500);
    record('diffVirtualToVirtual', describeTab());
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    sub.dispose();

    // Other editors and normal text editing of a non-Markdown file stay untouched.
    const other = path.join(dir, 'a.txt');
    fs.writeFileSync(other, 'x');
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(other));
    await sleep(500);
    record('openTxt', describeTab());
    record('done', true);
  } catch (error) {
    record('error', String(error && error.stack));
  }
}

module.exports = { run };

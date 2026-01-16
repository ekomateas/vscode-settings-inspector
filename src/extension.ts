import * as vscode from 'vscode';

type InspectResult = NonNullable<ReturnType<vscode.WorkspaceConfiguration['inspect']>>;

// ------------------------------------------------------------
// Collect extension-defined settings
// ------------------------------------------------------------
function getExtensionSettingKeys(): Set<string> {
    const keys = new Set<string>();

    for (const ext of vscode.extensions.all) {
        const contributes = ext.packageJSON?.contributes;
        if (!contributes) continue;

        const configs = contributes.configuration;
        if (!configs) continue;

        const configArray = Array.isArray(configs) ? configs : [configs];

        for (const config of configArray) {
            const properties = config.properties;
            if (!properties) continue;

            for (const key of Object.keys(properties)) {
                keys.add(key);
            }
        }
    }

    return keys;
}

// ------------------------------------------------------------
// Collect ALL known settings (built-in + overrides)
// ------------------------------------------------------------
function getAllKnownSettingKeys(): string[] {
    const config = vscode.workspace.getConfiguration();
    const inspected = config.inspect('');

    const defaults = inspected?.defaultValue;

    if (!defaults || typeof defaults !== 'object') {
        return [];
    }

    return Object.keys(defaults).sort();
}

// ------------------------------------------------------------
// Categorize settings
// ------------------------------------------------------------
function getCategorizedSettings() {
    const extensionKeys = getExtensionSettingKeys();
    const allKeys = getAllKnownSettingKeys();

    const overrides: string[] = [];
    const builtIn: string[] = [];
    const extension: string[] = [];

    for (const key of allKeys) {
        if (key.startsWith('[') && key.endsWith(']')) {
            overrides.push(key);
        } else if (extensionKeys.has(key)) {
            extension.push(key);
        } else {
            builtIn.push(key);
        }
    }

    return {
        overrides: overrides.sort(),
        builtIn: builtIn.sort(),
        extension: extension.sort()
    };
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ------------------------------------------------------------
// Pretty JSON helper
// ------------------------------------------------------------
function pretty(value: any): string {
    return value === undefined
        ? '<div style="color:#888;font-style:italic;">undefined</div>'
        : `<div style="
            background: #1e1e1e;
            color: #d4d4d4;
            border: 1px solid #3c3c3c;
            padding: 12px;
            font-family: monospace;
            font-size: 13px;
            white-space: pre;
            overflow-x: auto;
            overflow-y: auto;
            max-height: 400px;
            border-radius: 4px;
        ">${escapeHtml(JSON.stringify(value, null, 4))}</div>`;
}

// ------------------------------------------------------------
// Webview HTML
// ------------------------------------------------------------
function getHtml(
    setting: string,
    inspected: InspectResult,
    finalValue: any
): string {
    return `
        <html>
        <body style="font-family: sans-serif; padding: 20px;">
            <h2>Setting: <code>${setting}</code></h2>

            <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
                <tr>
                    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ccc;">Source</th>
                    <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ccc;">Value</th>
                </tr>

                <tr>
                    <td style="padding: 8px;">Default</td>
                    <td style="padding: 8px;">${pretty(inspected.defaultValue)}</td>
                </tr>

                <tr>
                    <td style="padding: 8px;">User</td>
                    <td style="padding: 8px;">${pretty(inspected.globalValue)}</td>
                </tr>

                <tr>
                    <td style="padding: 8px;">Workspace</td>
                    <td style="padding: 8px;">${pretty(inspected.workspaceValue)}</td>
                </tr>

                <tr>
                    <td style="padding: 8px;">Folder</td>
                    <td style="padding: 8px;">${pretty(inspected.workspaceFolderValue)}</td>
                </tr>

                <tr>
                    <td style="padding: 8px; font-weight: bold; vertical-align: top;">Final Resolved</td>
                    <td style="padding: 8px; font-weight: bold;">${pretty(finalValue)}</td>
                </tr>
            </table>
        </body>
        </html>
    `;
}

// ------------------------------------------------------------
// Activate
// ------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'settingsInspector.inspect',
        async () => {
            const { overrides, builtIn, extension } = getCategorizedSettings();

            const items: vscode.QuickPickItem[] = [
                { label: 'Type a setting key…', description: 'Enter any setting manually' },

                { label: 'Language Overrides', kind: vscode.QuickPickItemKind.Separator },
                ...overrides.map(k => ({ label: k })),

                { label: 'Built‑in Settings', kind: vscode.QuickPickItemKind.Separator },
                ...builtIn.map(k => ({ label: k })),

                { label: 'Extension Settings', kind: vscode.QuickPickItemKind.Separator },
                ...extension.map(k => ({ label: k }))
            ];

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a setting to inspect'
            });

            if (!picked) return;

            let setting: string | undefined;

            if (picked.label === 'Type a setting key…') {
                setting = await vscode.window.showInputBox({
                    prompt: 'Enter a setting key (e.g. editor.fontSize)',
                    placeHolder: 'editor.fontSize'
                });
            } else {
                setting = picked.label;
            }

            if (!setting) return;

            const config = vscode.workspace.getConfiguration();
            const inspected = config.inspect(setting);

            if (!inspected) {
                vscode.window.showErrorMessage(`Setting "${setting}" not found.`);
                return;
            }

            const finalValue = config.get(setting);

            const panel = vscode.window.createWebviewPanel(
                'settingsInspector',
                `Settings Inspector: ${setting}`,
                vscode.ViewColumn.One,
                { enableScripts: false }
            );

            panel.webview.html = getHtml(setting, inspected as InspectResult, finalValue);
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
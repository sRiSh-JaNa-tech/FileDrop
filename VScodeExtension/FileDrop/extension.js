const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const API_BASE = 'https://filedropserver-96q5.onrender.com';
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

let panel = null;
let idleInterval = null;
let lastActivity = Date.now();

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('FileDrop extension activated');

    // Command: Open FileDrop panel
    const openCmd = vscode.commands.registerCommand('filedrop.open', () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        createPanel(context);
    });

    // Command: Quick send file
    const sendCmd = vscode.commands.registerCommand('filedrop.sendFile', async () => {
        if (!panel) {
            createPanel(context);
        }
        // Tell webview to trigger file picker
        setTimeout(() => {
            panel.webview.postMessage({ type: 'TRIGGER_FILE_PICK' });
        }, 500);
    });

    context.subscriptions.push(openCmd, sendCmd);

    // Start idle checker
    idleInterval = setInterval(() => checkIdleStatus(context), 60 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(idleInterval) });
}

function createPanel(context) {
    panel = vscode.window.createWebviewPanel(
        'filedrop',
        'FileDrop',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'assets')),
                vscode.Uri.file(path.join(context.extensionPath, 'js')),
                vscode.Uri.file(path.join(context.extensionPath, 'webview'))
            ]
        }
    );

    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'assets', 'icon32.png'));

    // Build URIs for webview resources
    const assetUri = (file) => panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'assets', file))
    );
    const jsUri = (file) => panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'js', file))
    );
    const webviewJsUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'webview', 'main.js'))
    );

    panel.webview.html = getWebviewHTML(panel.webview, assetUri, jsUri, webviewJsUri);

    // Send initial state to webview
    const state = {
        userName: context.globalState.get('userName'),
        userId: context.globalState.get('userId'),
        peerId: context.globalState.get('peerId'),
        isActive: context.globalState.get('isActive', false),
        recentPeers: context.globalState.get('recentPeers', [])
    };
    setTimeout(() => {
        panel.webview.postMessage({ type: 'INIT_STATE', state });
    }, 300);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
            case 'SET_STATE': {
                for (const [key, value] of Object.entries(msg.data)) {
                    await context.globalState.update(key, value);
                }
                break;
            }
            case 'GET_STATE': {
                const result = {};
                for (const key of msg.keys) {
                    result[key] = context.globalState.get(key);
                }
                panel.webview.postMessage({ type: 'STATE_RESPONSE', requestId: msg.requestId, data: result });
                break;
            }
            case 'HEARTBEAT': {
                lastActivity = Date.now();
                break;
            }
            case 'SAVE_FILE': {
                await handleFileSave(msg);
                break;
            }
            case 'LOG': {
                console.log('[FileDrop Webview]', msg.message);
                break;
            }
        }
    }, undefined, context.subscriptions);

    // Reset activity when panel becomes visible
    panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.visible) {
            lastActivity = Date.now();
        }
    });

    panel.onDidDispose(() => {
        panel = null;
        // Start grace period — lastActivity stays as-is, idle checker will handle
    }, null, context.subscriptions);
}

async function handleFileSave(msg) {
    try {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || require('os').homedir(),
                msg.fileName
            )),
            filters: { 'All Files': ['*'] }
        });

        if (uri) {
            const buffer = Buffer.from(msg.data);
            await vscode.workspace.fs.writeFile(uri, buffer);
            vscode.window.showInformationMessage(`FileDrop: Saved "${msg.fileName}" successfully!`);
        }
    } catch (err) {
        console.error('[FileDrop] Save error:', err);
        vscode.window.showErrorMessage(`FileDrop: Failed to save file — ${err.message}`);
    }
}

async function checkIdleStatus(context) {
    const isActive = context.globalState.get('isActive', false);
    const userId = context.globalState.get('userId');

    if (isActive && userId) {
        const idleTime = Date.now() - lastActivity;
        if (idleTime > IDLE_THRESHOLD_MS) {
            console.log('[FileDrop] User idle for 3 minutes, deactivating...');
            await performDeactivation(context, userId);
        }
    }
}

async function performDeactivation(context, userId) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${API_BASE}/user/${userId}`, { method: 'DELETE' });

        if (response.ok) {
            console.log(`[FileDrop] Auto-deactivated user: ${userId}`);
            await context.globalState.update('isActive', false);

            if (panel) {
                panel.webview.postMessage({ type: 'DEACTIVATED' });
            }
        }
    } catch (err) {
        console.error('[FileDrop] Auto-deactivation error:', err);
    }
}

function getWebviewHTML(webview, assetUri, jsUri, webviewJsUri) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}' https://unpkg.com; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://filedropserver-96q5.onrender.com https://*.peerjs.com wss://*.peerjs.com wss://0.peerjs.com;">
    <title>FileDrop</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-deep: #0a0118;
            --purple: #7c3aed;
            --cyan: #22d3ee;
            --cyan-glow: rgba(34, 211, 238, 0.4);
            --white: #f8f9fa;
            --gray: #94a3b8;
            --black: #000000;
            --radius-pill: 999px;
            --radius-sm: 12px;
            --radius-md: 24px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        *::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; }

        body {
            width: 100%;
            min-height: 100vh;
            font-family: 'Inter', system-ui, sans-serif;
            background: radial-gradient(circle at top right, #1e0a45, var(--bg-deep));
            color: var(--white);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 0;
        }
        .screen {
            flex: 1; display: flex; flex-direction: column;
            padding: 24px 24px 16px 24px; gap: 20px;
            transition: opacity 0.3s ease;
        }
        #onboarding-ui { justify-content: center; align-items: center; text-align: center; }
        .onboarding-content { display: flex; flex-direction: column; gap: 20px; max-width: 320px; }
        .onboarding-logo img { width: 80px; height: 80px; filter: drop-shadow(0 0 20px var(--cyan-glow)); }
        .onboarding-content h2 { font-size: 1.5rem; color: var(--white); }
        .onboarding-content p { color: var(--gray); font-size: 0.9rem; }
        .onboarding-input-group { display: flex; flex-direction: column; gap: 12px; }
        .onboarding-input-group input {
            padding: 14px; border-radius: var(--radius-sm);
            border: 1px solid rgba(34, 211, 238, 0.3);
            background: rgba(0, 0, 0, 0.4); color: var(--white);
            text-align: center; font-size: 1.1rem; outline: none;
        }
        .onboarding-input-group input:focus { border-color: var(--cyan); box-shadow: 0 0 15px var(--cyan-glow); }

        .header { display: flex; justify-content: space-between; align-items: flex-start; }
        .welcome { flex: 1; min-width: 0; margin-right: 12px; }
        .name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; min-width: 0; }
        .icon-btn {
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            color: var(--gray); width: 28px; height: 28px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: all 0.2s ease; flex-shrink: 0;
        }
        .icon-btn:hover { background: rgba(34,211,238,0.1); color: var(--cyan); border-color: var(--cyan); transform: translateY(-1px); }
        .icon-btn:active { transform: translateY(0); }

        .welcome h1 {
            font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin: 0;
            background: linear-gradient(to right, #fff, var(--cyan));
            -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
            word-break: break-word; white-space: normal;
        }

        .btn { border: none; font-weight: 600; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); user-select: none; }
        .btn-secondary-outline {
            background: transparent; color: var(--cyan); padding: 10px 20px;
            border-radius: var(--radius-pill); font-size: 0.85rem;
            border: 1px solid var(--cyan); font-weight: 600;
        }
        .btn-secondary-outline:hover { background: rgba(34,211,238,0.1); box-shadow: 0 0 15px var(--cyan-glow); }

        .status-btn {
            padding: 6px 16px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
            color: var(--white); text-transform: uppercase; letter-spacing: 0.5px;
        }
        .status-btn.active { background: var(--cyan-glow); color: #000; border-color: var(--cyan); box-shadow: 0 0 15px var(--cyan-glow); }
        .status-btn.inactive { background: rgba(0,0,0,0.3); color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.1); }
        .status-btn:hover { transform: translateY(-1px); }
        .status-btn.active:hover { box-shadow: 0 0 25px var(--cyan-glow); }
        .status-btn.inactive:hover { background: rgba(255,255,255,0.1); color: var(--white); }

        .connection-section {
            display: flex; gap: 12px; align-items: flex-start;
            background: rgba(255,255,255,0.05); backdrop-filter: blur(12px);
            padding: 16px; border-radius: var(--radius-md);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .input-wrapper { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .peer-input {
            width: 100%; padding: 12px 16px; font-size: 1.1rem;
            background: rgba(0,0,0,0.3); border: 1px solid rgba(34,211,238,0.3);
            border-radius: var(--radius-sm); color: var(--white); outline: none; transition: all 0.3s;
        }
        .peer-input::placeholder { color: rgba(248,249,250,0.3); }
        .peer-input:focus { border-color: var(--cyan); box-shadow: 0 0 20px rgba(34,211,238,0.15); }
        .connection-status { font-size: 0.75rem; color: var(--gray); padding-left: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }

        .btn-primary {
            background: var(--purple); color: white; padding: 0 24px;
            font-size: 1rem; font-weight: 700; border-radius: var(--radius-sm);
            height: 48px; white-space: nowrap; box-shadow: 0 4px 15px rgba(124,58,237,0.3);
            display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-primary:hover { background: #8b5cf6; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(124,58,237,0.5); }
        .btn-primary:active { transform: translateY(0); }

        .connection-help { display: flex; align-items: center; gap: 6px; padding: 2px 8px; margin-top: -10px; color: var(--gray); font-size: 0.7rem; font-weight: 500; opacity: 0.8; }
        .connection-help svg { color: var(--cyan); min-width: 12px; }

        .recent-peers-container { display: flex; flex-direction: column; gap: 8px; padding: 0 4px; margin-top: 4px; }
        .recent-label { font-size: 0.65rem; font-weight: 800; color: var(--gray); letter-spacing: 0.1em; }
        .recent-peers-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .recent-peer-chip {
            background: rgba(34,211,238,0.05); border: 1px solid rgba(34,211,238,0.1);
            color: var(--cyan); padding: 6px 14px; border-radius: var(--radius-pill);
            font-size: 0.8rem; font-weight: 500; cursor: pointer;
            transition: all 0.2s ease; white-space: nowrap;
        }
        .recent-peer-chip:hover { background: rgba(34,211,238,0.15); border-color: var(--cyan); transform: scale(1.05); }
        .recent-peer-chip:active { transform: scale(0.95); }

        .transfer-box {
            background: rgba(255,255,255,0.03); border: 1px dashed rgba(34,211,238,0.2);
            border-radius: var(--radius-md); padding: 20px;
            display: flex; flex-direction: column; gap: 16px; transition: all 0.3s ease;
        }
        .transfer-box:hover { background: rgba(255,255,255,0.05); border-color: var(--cyan); }
        .transfer-content { display: flex; flex-direction: column; gap: 10px; }
        .transfer-info { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }
        #file-name-label { color: var(--white); font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #transfer-status { color: var(--gray); font-size: 0.75rem; }
        .progress-container { height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden; }
        .progress-bar { height: 100%; width: 0%; background: linear-gradient(to right, var(--purple), var(--cyan)); box-shadow: 0 0 10px var(--cyan-glow); transition: width 0.3s ease; }

        .action-center { display: flex; justify-content: center; margin-top: 5px; margin-bottom: 0; }
        .avatar-button { background: none; border: none; padding: 0; margin: 0 auto; cursor: pointer; transition: all 0.3s; position: relative; border-radius: 50%; }
        .avatar-button:hover { transform: scale(1.05); }
        .avatar-button:active { transform: scale(0.97); }
        .avatar-button:hover::before {
            content: ''; position: absolute; top: 50%; left: 50%; width: 100%; height: 100%;
            background: transparent; border-radius: 50%; border: 2px solid var(--cyan);
            transform: translate(-50%, -50%) scale(1); animation: ripple 1.5s infinite;
            z-index: -1; pointer-events: none;
        }
        .avatar-circle {
            width: 110px; height: 110px; border-radius: 50%;
            background: rgba(124,58,237,0.1); display: flex; align-items: center; justify-content: center;
            border: 4px solid rgba(34,211,238,0.2); box-shadow: 0 0 30px rgba(34,211,238,0.1);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: relative; z-index: 1;
        }
        .connected-glow .avatar-circle { border-color: var(--cyan); animation: glow 2s infinite ease-in-out; background: rgba(34,211,238,0.1); }
        .connected-glow::after {
            content: ''; position: absolute; top: 50%; left: 50%; width: 100%; height: 100%;
            background: transparent; border-radius: 50%; border: 4px solid var(--cyan);
            opacity: 0.3; transform: translate(-50%, -50%) scale(1); animation: ripple 2s infinite ease-out;
            z-index: 0; pointer-events: none;
        }
        .avatar-image { width: 70px; height: 70px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(34,211,238,0.3)); transition: all 0.3s ease; }

        .my-id-container {
            display: flex; align-items: center; gap: 8px; margin-top: 4px;
            background: rgba(34,211,238,0.05); padding: 4px 12px;
            border-radius: var(--radius-sm); border: 1px solid rgba(34,211,238,0.1);
        }
        .id-label { font-size: 0.7rem; color: var(--gray); font-weight: 700; }
        .id-value { font-size: 0.75rem; color: var(--cyan); font-family: monospace; letter-spacing: 0.5px; }

        @keyframes ripple { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; } 100% { transform: translate(-50%,-50%) scale(1.2); opacity: 0; } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 30px rgba(34,211,238,0.3), inset 0 0 15px rgba(34,211,238,0.2); } 50% { box-shadow: 0 0 50px rgba(34,211,238,0.6), inset 0 0 25px rgba(34,211,238,0.3); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
    </style>
</head>
<body>
    <div id="onboarding-ui" class="screen" style="display: none;">
        <div class="onboarding-content">
            <div class="onboarding-logo">
                <img src="${assetUri('airdrop.png')}" alt="FileDrop Logo">
            </div>
            <h2>Welcome to FileDrop</h2>
            <p>Your random identity is ready</p>
            <div class="onboarding-input-group">
                <input type="text" id="initial-name-input" placeholder="Generating name..." readonly>
                <button id="get-started-btn" class="btn-primary">Connect with this Name</button>
            </div>
        </div>
    </div>

    <div id="main-ui" class="screen" style="display: none;">
        <header class="header">
            <div class="welcome">
                <div class="name-row">
                    <h1 id="user-name">Loading...</h1>
                    <button id="copy-name-btn" class="icon-btn" title="Copy Name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                        </svg>
                    </button>
                </div>
                <div class="my-id-container">
                    <span class="id-label">MY ID:</span>
                    <span id="my-peer-id" class="id-value">Activate to get ID</span>
                </div>
            </div>
            <button id="status-toggle-btn" class="status-btn inactive" aria-label="Toggle active status">
                Inactive
            </button>
        </header>

        <section class="connection-section">
            <div class="input-wrapper">
                <input type="text" id="peer-id" class="peer-input" placeholder="Enter target name" autocomplete="off">
                <div class="connection-status" id="connection-status">Not connected</div>
            </div>
            <button class="btn btn-primary" id="connect-btn">Connect</button>
        </section>

        <div class="connection-help">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Ensure both devices are on the same Wi-Fi network.</span>
        </div>

        <div id="recent-peers-container" class="recent-peers-container" style="display: none;">
            <span class="recent-label">RECENT:</span>
            <div id="recent-peers-list" class="recent-peers-list"></div>
        </div>

        <div class="transfer-box" id="transfer-box">
            <div class="transfer-content">
                <div class="transfer-info">
                    <span id="file-name-label">No file selected</span>
                    <span id="transfer-status">Ready</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" id="progress-bar"></div>
                </div>
            </div>
            <button class="btn btn-secondary-outline" id="files-btn">Select File</button>
        </div>

        <div class="action-center">
            <button class="avatar-button" id="avatar-btn" aria-label="Send File" title="Click to send file">
                <div class="avatar-circle" id="avatar">
                    <img src="${assetUri('airdrop.png')}" alt="FileDrop Icon" class="avatar-image">
                </div>
            </button>
        </div>

        <input type="file" id="file-input" style="display: none;">
    </div>

    <script nonce="${nonce}" src="${jsUri('peerjs.min.js')}"></script>
    <script nonce="${nonce}" src="${webviewJsUri}"></script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function deactivate() {
    // Cleanup handled by subscriptions
}

module.exports = { activate, deactivate };

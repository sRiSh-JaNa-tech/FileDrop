// FileDrop VS Code Webview — main.js
// Combined port of popup.js + transfer.js from Chrome Extension
// Uses vscode.postMessage instead of chrome.storage/runtime

(function () {
    const vscode = acquireVsCodeApi();

    // ─── State ───
    let userName = null;
    let userId = null;
    let peerId = null;
    let isActive = false;
    let isConnected = false;
    let recentPeers = [];

    // ─── PeerJS ───
    let peer = null;
    let conn = null;
    let remotePeerName = null;

    const API_BASE = 'https://filedropserver-96q5.onrender.com';

    // ─── State Bridge ───
    const pendingRequests = {};
    let reqIdCounter = 0;

    function setState(data) {
        // Update local cache
        for (const [k, v] of Object.entries(data)) {
            if (k === 'userName') userName = v;
            if (k === 'userId') userId = v;
            if (k === 'peerId') peerId = v;
            if (k === 'isActive') isActive = v;
            if (k === 'recentPeers') recentPeers = v;
        }
        vscode.postMessage({ type: 'SET_STATE', data });
    }

    function getState(keys) {
        return new Promise((resolve) => {
            const requestId = ++reqIdCounter;
            pendingRequests[requestId] = resolve;
            vscode.postMessage({ type: 'GET_STATE', keys, requestId });
        });
    }

    // ─── Elements ───
    const onboardingUI = document.getElementById('onboarding-ui');
    const mainUI = document.getElementById('main-ui');
    const initialNameInput = document.getElementById('initial-name-input');
    const getStartedBtn = document.getElementById('get-started-btn');
    const connectBtn = document.getElementById('connect-btn');
    const peerInput = document.getElementById('peer-id');
    const statusText = document.getElementById('connection-status');
    const filesBtn = document.getElementById('files-btn');
    const fileInput = document.getElementById('file-input');
    const nameDisplay = document.getElementById('user-name');
    const myPeerIdDisplay = document.getElementById('my-peer-id');
    const statusToggleBtn = document.getElementById('status-toggle-btn');
    const copyNameBtn = document.getElementById('copy-name-btn');
    const recentPeersContainer = document.getElementById('recent-peers-container');
    const recentPeersList = document.getElementById('recent-peers-list');
    const transferBox = document.getElementById('transfer-box');
    const fileNameLabel = document.getElementById('file-name-label');
    const transferStatus = document.getElementById('transfer-status');
    const progressBar = document.getElementById('progress-bar');
    const avatarBtn = document.getElementById('avatar-btn');

    let selectedFile = null;

    // ─── Heartbeat ───
    let lastHeartbeat = 0;
    function sendHeartbeat() {
        const now = Date.now();
        if (now - lastHeartbeat > 2000) {
            vscode.postMessage({ type: 'HEARTBEAT' });
            lastHeartbeat = now;
        }
    }

    window.addEventListener('mousedown', sendHeartbeat);
    window.addEventListener('keydown', sendHeartbeat);
    window.addEventListener('mousemove', sendHeartbeat);

    // ─── Connection UI Sync ───
    function syncConnectionUI() {
        const connected = !!(conn && conn.open);
        isConnected = connected;

        if (isConnected) {
            connectBtn.innerText = 'Disconnect';
            connectBtn.style.background = '#ef4444';
            connectBtn.style.color = 'white';
            statusText.innerText = 'Connected to: ' + (remotePeerName || 'Peer');
            statusText.style.color = 'var(--cyan)';
            peerInput.disabled = true;
            if (avatarBtn) avatarBtn.classList.add('connected-glow');
        } else {
            connectBtn.innerText = 'Connect';
            connectBtn.style.background = '';
            connectBtn.style.color = '';
            statusText.innerText = 'Not connected';
            statusText.style.color = '';
            peerInput.disabled = false;
            if (avatarBtn) avatarBtn.classList.remove('connected-glow');
        }
    }

    // ─── Status UI ───
    function updateStatusUI(active) {
        if (active) {
            statusToggleBtn.innerText = 'Active';
            statusToggleBtn.classList.remove('inactive');
            statusToggleBtn.classList.add('active');
        } else {
            statusToggleBtn.innerText = 'Inactive';
            statusToggleBtn.classList.remove('active');
            statusToggleBtn.classList.add('inactive');
        }
    }

    // ─── Recent Peers ───
    function renderRecentPeers() {
        if (!recentPeers || recentPeers.length === 0) {
            recentPeersContainer.style.display = 'none';
            return;
        }
        recentPeersContainer.style.display = 'flex';
        recentPeersList.innerHTML = '';
        recentPeers.forEach(name => {
            const chip = document.createElement('div');
            chip.className = 'recent-peer-chip';
            chip.innerText = name;
            chip.addEventListener('click', () => {
                peerInput.value = name;
                connectBtn.click();
            });
            recentPeersList.appendChild(chip);
        });
    }

    function saveRecentPeer(peerName) {
        if (!peerName || peerName.trim() === '') return;
        let list = [...(recentPeers || [])];
        list = list.filter(p => p !== peerName);
        list.unshift(peerName);
        list = list.slice(0, 4);
        recentPeers = list;
        setState({ recentPeers: list });
        renderRecentPeers();
    }

    // ─── API Helpers ───
    async function getRandomName() {
        try {
            const res = await fetch(`${API_BASE}/random-name`);
            const data = await res.json();
            return data.name;
        } catch {
            return 'u-' + Math.random().toString(36).substring(2, 6);
        }
    }

    async function setUser(name, uid) {
        const pid = 'p-' + Math.random().toString(36).substring(2, 8);
        try {
            const res = await fetch(`${API_BASE}/set-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, userId: uid, peerId: pid })
            });
            if (res.ok) {
                peerId = pid;
                setState({ userId: uid, peerId: pid });
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    // ─── PeerJS Init ───
    async function initPeer() {
        if (!peerId) return;
        if (peer && peer.open) return peer;
        if (peer) destroyPeer();

        return new Promise((resolve, reject) => {
            peer = new Peer(peerId);

            peer.on('open', (id) => {
                console.log('Peer opened:', id);
                resolve(peer);
            });

            peer.on('connection', (connection) => {
                if (conn) conn.close();
                conn = connection;

                conn.on('open', () => {
                    syncConnectionUI(); // Update UI when incoming connection is ready
                });

                conn.on('close', () => {
                    conn = null;
                    remotePeerName = null;
                    syncConnectionUI();
                });

                receiveFile(conn);

                // Connection might already be open by the time we attach listeners
                if (conn.open) {
                    syncConnectionUI();
                }
            });

            peer.on('error', (err) => {
                console.error('Peer error:', err);
                if (!peer.open) reject(err);
            });

            peer.on('disconnected', () => { peer.reconnect(); });
        });
    }

    function destroyPeer() {
        if (conn) { conn.close(); conn = null; }
        if (peer) { peer.destroy(); peer = null; }
        remotePeerName = null;
    }

    // ─── Connect to Peer ───
    async function connectToPeer(targetName) {
        if (!peer) await initPeer();
        if (!peer) throw new Error('Your peer could not initialize. Try toggling Active off and on.');

        let res;
        try {
            res = await fetch(`${API_BASE}/connect/${targetName}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (networkErr) {
            throw new Error('Cannot reach server. Check your internet connection.');
        }

        if (res.status === 404) throw new Error(`"${targetName}" is not active. Ask them to activate first.`);
        if (!res.ok) throw new Error('Server error. Please try again later.');

        const result = await res.json();
        if (!result.data || !result.data.peerId) throw new Error(`"${targetName}" has invalid peer data. Ask them to re-activate.`);

        const targetPeerId = result.data.peerId;
        const remoteRealName = result.data.name;

        if (conn) { conn.close(); conn = null; }

        conn = peer.connect(targetPeerId);

        return new Promise((resolve, reject) => {
            conn.on('open', () => {
                remotePeerName = remoteRealName;
                conn.send({ type: 'identity', name: userName || 'Unknown User' });
                receiveFile(conn);
                resolve({ name: remoteRealName, peerId: targetPeerId });
            });

            conn.on('error', (err) => {
                conn = null;
                const msg = err.type === 'peer-unavailable'
                    ? `"${targetName}" is unreachable. They may have gone offline.`
                    : `Connection error: ${err.message || 'Unknown error'}`;
                reject(new Error(msg));
            });
            conn.on('close', () => { conn = null; syncConnectionUI(); });

            setTimeout(() => {
                if (conn && !conn.open) {
                    conn.close(); conn = null;
                    reject(new Error('Connection timed out. Ensure both devices are on the same network.'));
                }
            }, 15000);
        });
    }

    // ─── File Transfer ───
    async function transferFiles(file) {
        if (!conn) return;
        const chunkSize = 24 * 1024;
        const arrayBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

        conn.send({ type: 'meta', fileName: file.name, size: file.size, totalChunks });

        for (let i = 0; i < totalChunks; i++) {
            const chunk = arrayBuffer.slice(i * chunkSize, (i + 1) * chunkSize);
            conn.send({ type: 'chunk', data: chunk });
            if (i % 20 === 0) {
                sendHeartbeat();
                await new Promise(r => setTimeout(r, 1));
            }
        }

        conn.send({ type: 'end' });
        sendHeartbeat();
    }

    function receiveFile(connection) {
        let chunks = [];
        let fileName = '';
        let expectedChunks = 0;
        let receivedChunks = 0;

        connection.on('data', (data) => {
            if (data.type === 'identity') {
                remotePeerName = data.name;
                syncConnectionUI();
            } else if (data.type === 'meta') {
                sendHeartbeat();
                fileName = data.fileName;
                expectedChunks = data.totalChunks;
                chunks = [];
                receivedChunks = 0;
                fileNameLabel.innerText = fileName;
                transferStatus.innerText = 'Receiving...';
                transferStatus.style.color = 'var(--cyan)';
                progressBar.style.width = '0%';
                transferBox.style.borderColor = 'var(--cyan)';
            } else if (data.type === 'chunk') {
                chunks.push(data.data);
                receivedChunks++;
                if (receivedChunks % 50 === 0) sendHeartbeat();
                const percent = Math.round((receivedChunks / expectedChunks) * 100);
                progressBar.style.width = percent + '%';
            } else if (data.type === 'end') {
                if (receivedChunks < expectedChunks) {
                    console.error('File transfer incomplete!');
                    transferStatus.innerText = 'Transfer incomplete!';
                    transferStatus.style.color = '#ef4444';
                    return;
                }

                transferStatus.innerText = 'Received!';
                progressBar.style.width = '100%';
                sendHeartbeat();

                // Combine chunks into a Uint8Array and send to extension host for saving
                const blob = new Blob(chunks);
                const reader = new FileReader();
                reader.onload = () => {
                    const arrayBuffer = reader.result;
                    const uint8Array = Array.from(new Uint8Array(arrayBuffer));
                    vscode.postMessage({
                        type: 'SAVE_FILE',
                        fileName: fileName,
                        data: uint8Array
                    });
                };
                reader.readAsArrayBuffer(blob);

                setTimeout(() => {
                    transferStatus.innerText = 'Ready';
                    transferStatus.style.color = '';
                    progressBar.style.width = '0%';
                    transferBox.style.borderColor = '';
                }, 3000);
            }
        });
    }

    // ─── Toggle Status ───
    async function toggleStatus() {
        if (!userId) {
            userId = crypto.randomUUID();
            setState({ userId });
        }

        if (!isActive) {
            const success = await setUser(userName, userId);
            if (success) {
                isActive = true;
                setState({ isActive: true });
                updateStatusUI(true);
                if (myPeerIdDisplay) myPeerIdDisplay.innerText = peerId;
                initPeer().catch(console.error);
            }
        } else {
            if (!userId) {
                isActive = false;
                setState({ isActive: false });
                updateStatusUI(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/user/${userId}`, { method: 'DELETE' });
                if (res.ok) {
                    isActive = false;
                    setState({ isActive: false });
                    updateStatusUI(false);
                    if (isConnected) { conn.close(); conn = null; }
                    destroyPeer();
                    syncConnectionUI();
                }
            } catch (err) {
                console.error('Deactivation error:', err);
            }
        }
    }

    // ─── Show Main UI ───
    function showMainUI(name, pid) {
        nameDisplay.innerText = name;
        if (pid && myPeerIdDisplay) myPeerIdDisplay.innerText = pid;
        onboardingUI.style.display = 'none';
        mainUI.style.display = 'flex';
    }

    // ─── Event Listeners ───

    // Status toggle
    if (statusToggleBtn) {
        statusToggleBtn.addEventListener('click', async () => {
            statusToggleBtn.disabled = true;
            try { await toggleStatus(); } catch (e) { console.error(e); }
            finally { statusToggleBtn.disabled = false; }
        });
    }

    // Connect button
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            // Check live connection state for receiver support
            const currentlyConnected = !!(conn && conn.open);

            if (!peerInput.value.trim() && !currentlyConnected) {
                peerInput.classList.add('shake');
                setTimeout(() => peerInput.classList.remove('shake'), 400);
                return;
            }

            if (!currentlyConnected) {
                connectBtn.disabled = true;
                connectBtn.innerText = 'Connecting...';
                statusText.innerText = 'Connecting...';

                try {
                    const targetName = peerInput.value.trim();
                    if (targetName === userName) {
                        statusText.innerText = 'Cannot connect to yourself';
                        statusText.style.color = '#ef4444';
                        connectBtn.disabled = false;
                        connectBtn.innerText = 'Connect';
                        return;
                    }

                    const targetInfo = await connectToPeer(targetName);
                    saveRecentPeer(targetName);
                    isConnected = true;
                    connectBtn.disabled = false;
                    syncConnectionUI();
                } catch (err) {
                    console.error(err);
                    connectBtn.disabled = false;
                    connectBtn.innerText = 'Connect';
                    statusText.innerText = err.message || 'Connection failed';
                    statusText.style.color = '#ef4444';
                }
            } else {
                // Disconnect — works for both initiator AND receiver
                if (conn) { conn.close(); conn = null; }
                remotePeerName = null;
                isConnected = false;
                syncConnectionUI();
            }
        });
    }

    // Send file
    if (avatarBtn) {
        avatarBtn.addEventListener('click', async () => {
            if (!isConnected) {
                statusText.innerText = 'Connect to a peer first!';
                statusText.style.color = '#ef4444';
                setTimeout(() => {
                    statusText.innerText = isConnected ? 'Connected' : 'Not connected';
                    statusText.style.color = '';
                }, 2000);
                return;
            }
            if (!selectedFile) {
                transferStatus.innerText = 'Select a file first';
                transferStatus.style.color = '#ef4444';
                if (filesBtn) { filesBtn.classList.add('shake'); setTimeout(() => filesBtn.classList.remove('shake'), 400); }
                setTimeout(() => { transferStatus.innerText = 'Ready'; transferStatus.style.color = ''; }, 2000);
                return;
            }

            transferStatus.innerText = 'Sending...';
            progressBar.style.width = '0%';

            try {
                await transferFiles(selectedFile);
                transferStatus.innerText = 'Sent!';
                progressBar.style.width = '100%';
                setTimeout(() => { transferStatus.innerText = 'Ready'; progressBar.style.width = '0%'; }, 3000);
            } catch (err) {
                console.error('Transfer failed:', err);
                transferStatus.innerText = 'Failed';
            }
        });
    }

    // File picker
    if (filesBtn && fileInput) {
        filesBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                fileNameLabel.innerText = selectedFile.name;
                transferStatus.innerText = 'Ready to send';
                progressBar.style.width = '0%';
                transferBox.style.borderColor = 'var(--cyan)';
            }
        });
    }

    // Onboarding
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            const name = initialNameInput.value.trim();
            if (name) {
                userName = name;
                setState({ userName: name });
                showMainUI(name, peerId);
            }
        });
    }

    // Copy name
    if (copyNameBtn) {
        copyNameBtn.addEventListener('click', () => {
            const name = nameDisplay.innerText;
            navigator.clipboard.writeText(name).then(() => {
                const orig = copyNameBtn.innerHTML;
                copyNameBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                copyNameBtn.style.color = 'var(--cyan)';
                setTimeout(() => { copyNameBtn.innerHTML = orig; copyNameBtn.style.color = ''; }, 2000);
            });
        });
    }

    // ─── Messages from Extension Host ───
    window.addEventListener('message', (event) => {
        const msg = event.data;

        switch (msg.type) {
            case 'INIT_STATE': {
                const s = msg.state;
                userName = s.userName;
                userId = s.userId;
                peerId = s.peerId;
                isActive = s.isActive || false;
                recentPeers = s.recentPeers || [];

                const isGenericName = !userName ||
                    ['myname', 'user', 'welcome, user', 'loading...'].includes(userName.toLowerCase());

                if (!isGenericName) {
                    showMainUI(userName, peerId);
                    if (isActive) {
                        updateStatusUI(true);
                        initPeer().catch(console.error);
                    }
                    renderRecentPeers();
                    syncConnectionUI();
                } else {
                    onboardingUI.style.display = 'flex';
                    getRandomName().then(name => {
                        if (initialNameInput) initialNameInput.value = name;
                    });
                }
                break;
            }
            case 'STATE_RESPONSE': {
                const resolve = pendingRequests[msg.requestId];
                if (resolve) {
                    resolve(msg.data);
                    delete pendingRequests[msg.requestId];
                }
                break;
            }
            case 'DEACTIVATED': {
                isActive = false;
                updateStatusUI(false);
                if (isConnected && conn) { conn.close(); conn = null; }
                destroyPeer();
                syncConnectionUI();
                break;
            }
            case 'TRIGGER_FILE_PICK': {
                if (fileInput) fileInput.click();
                break;
            }
        }
    });
})();

function updateName(newName) {
    chrome.storage.local.set({ userName: newName }, () => {
        console.log('Name updated in local storage:', newName);
    });
}

function getStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

async function getRandomName() {
    try {
        const response = await fetch("https://filedropserver-96q5.onrender.com/random-name");
        const data = await response.json();
        return data.name;
    } catch (err) {
        console.error("Failed to fetch random name:", err);
        return "user-" + Math.random().toString(36).substring(2, 7);
    }
}

async function setUser(name, userId) {
    const peerId = "user-" + Math.random().toString(36).substring(2, 10);
    try {
        const response = await fetch("https://filedropserver-96q5.onrender.com/set-user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: name, userId: userId, peerId: peerId })
        });
        if (response.ok) {
            console.log(`[Presence] Successfully registered user: ${name} (ID: ${userId})`);
            chrome.storage.local.set({ userId: userId, peerId: peerId });
            return true;
        } else {
            console.error(`[Presence error] Registration failed for ${name}`);
            return false;
        }
    } catch (err) {
        console.error(`[Presence error] Unexpected error registering ${name}:`, err);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Elements
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

    // Transfer Elements
    const transferBox = document.getElementById('transfer-box');
    const fileNameLabel = document.getElementById('file-name-label');
    const transferStatus = document.getElementById('transfer-status');
    const progressBar = document.getElementById('progress-bar');
    const avatarBtn = document.getElementById('avatar-btn');

    let selectedFile = null;

    const syncConnectionUI = () => {
        const info = getConnectionInfo();
        isConnected = info.isConnected;

        if (isConnected) {
            connectBtn.innerText = 'Disconnect';
            connectBtn.style.background = '#ef4444';
            connectBtn.style.color = 'white';
            statusText.innerText = 'Connected to: ' + (info.remoteName || "Peer");
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
    };

    // Set Peer Identity Callback (for when we ARE the receiver)
    setPeerIdentityCallback((remoteName) => {
        syncConnectionUI();
    });

    // Handle remote disconnection
    setDisconnectCallback(() => {
        console.log("Remote peer disconnected, resetting UI...");
        disconnectPeer();
    });

    // Set Receive Progress Callback (for when we ARE the receiver)
    setReceiveProgressCallback((data) => {
        if (data.type === 'start') {
            fileNameLabel.innerText = data.fileName;
            transferStatus.innerText = 'Receiving...';
            transferStatus.style.color = 'var(--cyan)';
            progressBar.style.width = '0%';
            transferBox.style.borderColor = 'var(--cyan)';
        } else if (data.type === 'progress') {
            progressBar.style.width = data.progress + '%';
        } else if (data.type === 'end') {
            transferStatus.innerText = 'Received!';
            progressBar.style.width = '100%';
            setTimeout(() => {
                transferStatus.innerText = 'Ready';
                transferStatus.style.color = '';
                progressBar.style.width = '0%';
                transferBox.style.borderColor = '';
            }, 3000);
        }
    });

    // 0. Connect to background script for auto-deactivation on close
    chrome.runtime.connect({ name: 'popup' });

    // Initialize Peer on start if active
    chrome.storage.local.get(['isActive', 'peerId'], (result) => {
        if (result.isActive) {
            initPeer().catch(console.error);
        }
        if (result.peerId && myPeerIdDisplay) {
            myPeerIdDisplay.innerText = result.peerId;
        }
    });

    // Send heartbeat on interaction
    const sendHeartbeat = () => {
        chrome.runtime.sendMessage({ type: 'HEARTBEAT' });
    };

    window.addEventListener('mousedown', sendHeartbeat);
    window.addEventListener('keydown', sendHeartbeat);

    // Listen for deactivation from background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'DEACTIVATED') {
            isActive = false;
            chrome.storage.local.set({ isActive: false });
            updateStatusUI(false);
            if (isConnected) disconnectPeer();
        }
    });

    // State
    let isConnected = false;
    let isActive = false;

    // 1. Initial Check for Name and Status
    chrome.storage.local.get(['userName', 'isActive', 'peerId'], (result) => {
        const isGenericName = !result.userName ||
            ['myname', 'user', 'welcome, user', 'loading...'].includes(result.userName.toLowerCase());

        if (!isGenericName) {
            // Already have a valid name — go straight to main UI
            showMainUI(result.userName, result.peerId);
            if (result.isActive) {
                isActive = true;
                updateStatusUI(true);
            }
            // Check if we are already connected to someone
            syncConnectionUI();
        } else {
            // First time or generic name — fetch a fresh random name from the server
            onboardingUI.style.display = 'flex';
            getRandomName().then(randomName => {
                if (initialNameInput) {
                    initialNameInput.value = randomName;
                }
            });
        }
    });

    const updateStatusUI = (active) => {
        if (active) {
            statusToggleBtn.innerText = 'Active';
            statusToggleBtn.classList.remove('inactive');
            statusToggleBtn.classList.add('active');
        } else {
            statusToggleBtn.innerText = 'Inactive';
            statusToggleBtn.classList.remove('active');
            statusToggleBtn.classList.add('inactive');
        }
    };

    const toggleStatus = async () => {
        const { userName, userId: storedUserId } = await getStorage(['userName', 'userId']);
        const name = userName;
        let userId = storedUserId;

        if (!userId) {
            userId = crypto.randomUUID();
            chrome.storage.local.set({ userId });
        }

        if (!isActive) {
            // Activate: Register user
            console.log(`[Status Toggle] Activating presence for: ${name}`);
            const success = await setUser(name, userId);
            if (success) {
                isActive = true;
                chrome.storage.local.set({ isActive: true });
                updateStatusUI(true);

                // Update PeerID display after activation (since setUser generates it)
                const { peerId } = await getStorage(['peerId']);
                if (peerId && myPeerIdDisplay) myPeerIdDisplay.innerText = peerId;

                initPeer().catch(console.error);
            }
        } else {
            // Inactivate: Delete user
            console.log(`[Status Toggle] Deactivating presence for user ID: ${userId}`);
            try {
                const response = await fetch(`https://filedropserver-96q5.onrender.com/user/${userId}`, {
                    method: "DELETE"
                });
                if (response.ok) {
                    console.log(`[Status Toggle] Deactivation confirmed by server for ID: ${userId}`);
                    isActive = false;
                    chrome.storage.local.set({ isActive: false });
                    updateStatusUI(false);

                    // Fully destroy peer and connections on deactivation
                    if (isConnected) disconnectPeer();
                    destroyPeer();
                } else {
                    console.error(`[Status Toggle Error] Deactivation failed for ID: ${userId}, Status: ${response.status}`);
                }
            } catch (err) {
                console.error(`[Status Toggle Error] Network error deactivating ID: ${userId}:`, err);
            }
        }
    };


    if (statusToggleBtn) {
        statusToggleBtn.addEventListener('click', async () => {
            statusToggleBtn.disabled = true;
            try {
                await toggleStatus();
            } catch (err) {
                console.error("Error toggling status:", err);
            } finally {
                statusToggleBtn.disabled = false;
            }
        });
    }

    const showMainUI = (name, peerId) => {
        nameDisplay.innerText = name;
        if (peerId && myPeerIdDisplay) myPeerIdDisplay.innerText = peerId;
        onboardingUI.style.display = 'none';
        mainUI.style.display = 'flex';
    };

    syncConnectionUI();

    // Connection Handler
    const disconnectPeer = () => {
        console.log("Disconnecting peer...");
        // Ensure connection is closed in transfer.js
        if (typeof conn !== 'undefined' && conn) {
            conn.close();
        }
        syncConnectionUI();
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (!peerInput.value.trim()) {
                peerInput.classList.add('shake');
                setTimeout(() => peerInput.classList.remove('shake'), 400);
                return;
            }

            if (!isConnected) {
                // Connection flow
                connectBtn.disabled = true;
                connectBtn.innerHTML = '<img src="assets/loading.gif" alt="loading" style="height: 24px; vertical-align: middle;">';
                statusText.innerText = 'Connecting...';

                try {
                    const targetName = peerInput.value.trim();
                    const { userName } = await new Promise(r => chrome.storage.local.get(['userName'], r));

                    if (targetName === userName) {
                        statusText.innerText = "Cannot connect to yourself";
                        statusText.style.color = '#ef4444';
                        connectBtn.disabled = false;
                        connectBtn.innerText = 'Connect';
                        return;
                    }

                    // connectToPeer now uses userName (which is entered in the peerInput)
                    const targetInfo = await connectToPeer(targetName);
                    isConnected = true;
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = 'Disconnect';
                    connectBtn.style.background = '#ef4444';
                    connectBtn.style.color = 'white';

                    statusText.innerText = 'Connected to: ' + targetInfo.name;
                    statusText.style.color = 'var(--cyan)';
                    peerInput.disabled = true;

                    // Start glowing
                    if (avatarBtn) avatarBtn.classList.add('connected-glow');
                } catch (err) {
                    console.error(err);
                    connectBtn.disabled = false;
                    connectBtn.innerText = 'Connect';
                    statusText.innerText = "Connection failed";
                }
            } else {
                disconnectPeer();
            }
        });
    }

    // Avatar Send Trigger
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

                // Visual shake on the select button to guide user
                if (filesBtn) {
                    filesBtn.classList.add('shake');
                    setTimeout(() => filesBtn.classList.remove('shake'), 400);
                }

                setTimeout(() => {
                    transferStatus.innerText = 'Ready';
                    transferStatus.style.color = '';
                }, 2000);
                return;
            }

            transferStatus.innerText = 'Sending...';
            progressBar.style.width = '0%';

            try {
                await transferFiles(selectedFile);
                transferStatus.innerText = 'Sent!';
                progressBar.style.width = '100%';
                setTimeout(() => {
                    transferStatus.innerText = 'Ready';
                    progressBar.style.width = '0%';
                }, 3000);
            } catch (err) {
                console.error("Transfer failed:", err);
                transferStatus.innerText = 'Failed';
            }
        });
    }

    // File Selection Handler
    if (filesBtn && fileInput) {
        filesBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                selectedFile = files[0];
                fileNameLabel.innerText = selectedFile.name;
                transferStatus.innerText = 'Ready to send';
                progressBar.style.width = '0%';

                // Visual feedback on the box
                transferBox.style.borderColor = 'var(--cyan)';
            }
        });
    }

    // Onboarding Logic — "Connect with this Name"
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            const name = initialNameInput.value.trim();
            if (name) {
                // Save the server-assigned random name to storage
                chrome.storage.local.set({ userName: name }, () => {
                    console.log('[Onboarding] Random name saved:', name);
                    // Fetch peerId if it exists to update UI
                    chrome.storage.local.get(['peerId'], (innerRes) => {
                        showMainUI(name, innerRes.peerId);
                    });
                });
            }
        });
    }
});

async function updateName(newName) {
    try {
        const { userId, UserName } = JSON.parse(localStorage.getItem('userName'));
        const response = await fetch('http://localhost:3000/update/name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName, userId: userId })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Name updated successfully:', data);
            })
            .catch(error => {
                console.error('Error updating name:', error);
            });
    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

function setConnection(peerId) {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await fetch("http://localhost:3000/connect", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ peerId: peerId })
            });

            const data = await response.json();

            if (response.ok) {
                resolve(data);   // success
            } else {
                reject(data);    // server error
            }
        } catch (error) {
            reject(error);       // network error
        }
    });
}

function setUser(name){
    let userId = crypto.randomUUID();
    try{
        const response = fetch("http://localhost:3000/set-user", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: name, userId: userId })
        })
        const data = response.json();
        if(response.ok){
            console.log("User set successfully:", data);
        }else{
            console.error("Error setting user:", data);
        }
    } catch (err) {
        console.error("Unexpected error:", err);
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
    const statusDot = document.querySelector('.status-dot');
    const changeNameBtn = document.getElementById('change-name');
    const filesBtn = document.getElementById('files-btn');
    const fileInput = document.getElementById('file-input');
    const nameDisplay = document.getElementById('user-name');
    const nameEditInput = document.getElementById('name-edit-input');

    // State
    let isConnected = false;

    // 1. Initial Check for Name
    chrome.storage.local.get(['userName'], (result) => {
        if (result.userName) {
            showMainUI(result.userName);
        } else {
            onboardingUI.style.display = 'flex';
        }
    });

    const showMainUI = (name) => {
        nameDisplay.innerText = `Welcome, ${name}`;
        onboardingUI.style.display = 'none';
        mainUI.style.display = 'flex';
    };

    // 2. Onboarding Logic
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            const name = initialNameInput.value.trim();
            if (name) {
                chrome.storage.local.set({ userName: name }, () => {
                    showMainUI(name);
                    updateName(name);
                });
            } else {
                initialNameInput.classList.add('shake');
                setTimeout(() => initialNameInput.classList.remove('shake'), 400);
            }
        });

        initialNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') getStartedBtn.click();
        });
    }

    // Connection Handler
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (!peerInput.value.trim()) {
                peerInput.classList.add('shake');
                setTimeout(() => peerInput.classList.remove('shake'), 400);
                return;
            }

            if (!isConnected) {
                // Mock connection flow
                connectBtn.disabled = true;
                connectBtn.innerText = '...';
                statusText.innerText = 'Connecting...';

                setConnection(peerInput.value.trim())
                    .then(() => {
                        isConnected = true;
                        connectBtn.disabled = false;
                        connectBtn.innerText = 'Disconnect';
                        connectBtn.style.background = '#ef4444';
                        connectBtn.style.color = 'white';

                        statusText.innerText = 'Connected to: ' + peerInput.value.trim();
                        statusText.style.color = 'var(--cyan)';
                        if (statusDot) statusDot.style.background = 'var(--cyan)';
                    })
                    .catch(err => {
                        console.error(err);
                        connectBtn.disabled = false;
                        connectBtn.innerText = 'Connect';
                        statusText.innerText = "Connection failed";
                    });

            } else {
                isConnected = false;
                connectBtn.innerText = 'Connect';
                connectBtn.style.background = '';
                connectBtn.style.color = '';
                statusText.innerText = 'Not connected';
                statusText.style.color = '';
                if (statusDot) statusDot.style.background = '#000';
                peerInput.value = '';
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
                const fileName = files[0].name;
                filesBtn.innerText = `Selected: ${fileName}`;
                filesBtn.style.background = 'var(--cyan)';
                filesBtn.style.color = '#000';
            }
        });
    }

    // Name Editing Flow
    if (changeNameBtn && nameEditInput && nameDisplay) {
        changeNameBtn.addEventListener('click', () => {
            changeNameBtn.style.display = 'none';
            nameEditInput.style.display = 'block';
            nameEditInput.value = nameDisplay.innerText.replace('Welcome, ', '');
            nameEditInput.focus();
        });

        const saveName = () => {
            const newName = nameEditInput.value.trim();
            if (newName) {
                nameDisplay.innerText = `Welcome, ${newName}`;
                chrome.storage.local.set({ userName: newName });
                updateName(newName);
            }
            nameEditInput.style.display = 'none';
            changeNameBtn.style.display = 'block';
        };

        nameEditInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveName();
            if (e.key === 'Escape') {
                nameEditInput.style.display = 'none';
                changeNameBtn.style.display = 'block';
            }
        });

        nameEditInput.addEventListener('blur', saveName);
    }

    // Peer Input focus interaction
    if (peerInput && statusText) {
        peerInput.addEventListener('focus', () => {
            if (!isConnected) statusText.innerText = 'Press Enter to connect';
        });

        peerInput.addEventListener('blur', () => {
            if (!isConnected) statusText.innerText = 'Not connected';
        });
    }
});

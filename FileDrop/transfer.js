function getStorage(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, resolve);
    });
}

let peer = null;
let conn = null;
let remotePeerName = null;

function getConnectionInfo() {
    return {
        isConnected: !!(conn && conn.open),
        remoteName: remotePeerName
    };
}

async function initPeer() {
    const { peerId } = await getStorage(["peerId"]);
    if (!peerId) {
        console.error("No Peer ID found in storage");
        return;
    }

    if (peer && peer.open) return peer;

    if (peer) {
        destroyPeer();
    }

    return new Promise((resolve, reject) => {
        peer = new Peer(peerId);

        peer.on("open", (id) => {
            console.log("Peer connection established with ID:", id);
            resolve(peer);
        });

        peer.on("connection", (connection) => {
            console.log("Incoming connection from peer:", connection.peer);
            if (conn) conn.close();
            conn = connection;

            conn.on('close', () => {
                console.log("Connection closed/failed");
                conn = null;
                if (onDisconnect) onDisconnect();
            });

            receiveFile(conn);
        });

        peer.on("error", (err) => {
            console.error("Peer error:", err);
            // Fatal errors during initialization should reject
            if (!peer.open) {
                reject(err);
            }
        });

        peer.on('disconnected', () => {
            console.log("Peer disconnected from signaling. Reconnecting...");
            peer.reconnect();
        });
    });
}

function destroyPeer() {
    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        console.log("Destroying peer object...");
        peer.destroy();
        peer = null;
    }
    remotePeerName = null;
}

let onPeerIdentityReceived = null;
function setPeerIdentityCallback(callback) {
    onPeerIdentityReceived = callback;
}

let onReceiveProgress = null;
function setReceiveProgressCallback(callback) {
    onReceiveProgress = callback;
}

let onDisconnect = null;
function setDisconnectCallback(callback) {
    onDisconnect = callback;
}

// Alias for setConnection to resolve compatibility issues
const setConnection = (targetName) => connectToPeer(targetName);

async function connectToPeer(targetName) {
    if (!peer) {
        await initPeer();
    }

    if (!peer) {
        console.error("Could not initialize peer");
        return;
    }

    console.log(`Searching for peer info for name: ${targetName}`);
    const response = await fetch(`https://filedropserver-96q5.onrender.com/connect/${targetName}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        console.error("Failed to get peer info for name:", targetName);
        throw new Error("Target peer not found");
    }

    const result = await response.json();

    if (!result.data || !result.data.peerId) {
        throw new Error("Invalid peer data received from server");
    }

    const targetPeerId = result.data.peerId;
    const remoteRealName = result.data.name;

    if (conn) {
        console.log("Closing existing connection before connecting to new peer");
        conn.close();
        conn = null;
    }

    console.log(`Connecting to ${remoteRealName} (${targetPeerId})...`);
    conn = peer.connect(targetPeerId);

    const { userName } = await getStorage(["userName"]);

    return new Promise((resolve, reject) => {
        conn.on("open", () => {
            console.log("Connected to:", remoteRealName);
            remotePeerName = remoteRealName;

            conn.send({
                type: "identity",
                name: userName || "Unknown User"
            });

            receiveFile(conn);
            resolve({ name: remoteRealName, peerId: targetPeerId });
        });

        conn.on("error", (err) => {
            console.error("Connection error:", err);
            conn = null;
            reject(err);
        });

        conn.on('close', () => {
            console.log("Connection closed/failed");
            conn = null;
            if (onDisconnect) onDisconnect();
        });

        // Timeout for connection
        setTimeout(() => {
            if (conn && !conn.open) {
                conn.close();
                conn = null;
                reject(new Error("Connection timeout"));
            }
        }, 15000);
    });
}

async function transferFiles(file) {
    if (!conn) {
        console.error("No active connection to transfer files");
        return;
    }

    const chunkSize = 24 * 1024; // 24KB
    const fileReader = new FileReader();

    fileReader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);

        console.log(`Starting transfer: ${file.name} (${totalChunks} chunks)`);

        conn.send({
            type: "meta",
            fileName: file.name,
            size: file.size,
            totalChunks
        });

        for (let i = 0; i < totalChunks; i++) {
            const chunk = arrayBuffer.slice(i * chunkSize, (i + 1) * chunkSize);

            conn.send({
                type: "chunk",
                data: chunk
            });

            // Prevent flooding
            if (i % 20 === 0) await new Promise((r) => setTimeout(r, 1));
        }

        conn.send({ type: "end" });
        console.log("File sent successfully!");
    };

    fileReader.readAsArrayBuffer(file);
}

function receiveFile(connection) {
    let chunks = [];
    let fileName = "";
    let expectedChunks = 0;
    let receivedChunks = 0;

    connection.on("data", (data) => {
        if (data.type === "identity") {
            console.log("Peer identity received:", data.name);
            remotePeerName = data.name;
            if (onPeerIdentityReceived) onPeerIdentityReceived(data.name);
        } else if (data.type === "meta") {
            fileName = data.fileName;
            expectedChunks = data.totalChunks;
            chunks = [];
            receivedChunks = 0;
            console.log("Receiving:", fileName, `(${expectedChunks} chunks)`);
            if (onReceiveProgress) onReceiveProgress({ type: 'start', fileName: fileName });
        } else if (data.type === "chunk") {
            chunks.push(data.data);
            receivedChunks++;
            if (onReceiveProgress) {
                const percent = Math.round((receivedChunks / expectedChunks) * 100);
                onReceiveProgress({ type: 'progress', progress: percent });
            }
        } else if (data.type === "end") {
            console.log("File received completely!");
            if (onReceiveProgress) onReceiveProgress({ type: 'end' });

            const blob = new Blob(chunks);
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up
            URL.revokeObjectURL(url);
        }
    });
}

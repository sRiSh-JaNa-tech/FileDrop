import express from 'express';
import { Request, Response } from 'express';
import app from './app';
import http from 'http';
import { getPeerForConnection, createUser, deleteUser } from './models/User';
import { client, connectToRedis } from './utils/redisClient';
import rndName from './utils/rndNames';

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// Get peer info by userName
app.get("/connect/:userName", async (req: Request, res: Response) => {
  try {
    const { userName } = req.params;
    const result = await getPeerForConnection(client, userName as string);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error(`[Connection Error] Failed to get peer for ${req.params.userName}:`, err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Set user name and ID
app.post("/set-user", async (req: Request, res: Response) => {
  const { name, userId, peerId } = req.body;
  if (!name || !userId || !peerId) {
    return res.status(400).json({ success: false, error: "Name, userId, and peerId are required" });
  }
  try {
    console.log(`[Registration] Registering user: ${name} (ID: ${userId}, PeerID: ${peerId})`);
    const result = await createUser(client, userId, name, peerId);
    console.log(`[Registration] Successfully registered: ${name}`);
    res.json(result);
  } catch (err) {
    console.error(`[Registration Error] Failed to register ${name}:`, err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.get("/get-peer-info", async (req: Request, res: Response) => {
  try {
    const { userName } = req.query;
    if (!userName || typeof userName !== "string") {
      return res.status(400).json({ success: false, error: "userName query parameter is required" });
    }
    const result = await getPeerForConnection(client, userName as string);
    if (!result.success) {
      return res.status(404).json(result)
    }
    res.json(result);
  } catch (err) {
    console.error(`[Peer Info Error] Failed to get peer info for ${req.query.userName}:`, err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.get("/random-name", (req: Request, res: Response) => {
  res.json({ success: true, name: rndName() });
});

// De-register user
app.delete("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    console.log(`[Deactivation] De-registering user ID: ${userId}`);
    await deleteUser(client, userId as string);
    console.log(`[Deactivation] Successfully de-registered user ID: ${userId}`);
    res.json({ success: true, message: "User deactivated" });
  } catch (err) {
    console.error(`[Deactivation Error] Failed to de-register ${userId}:`, err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

const server = http.createServer(app);

const startServer = async () => {
  try {
    await connectToRedis();
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
};

startServer();
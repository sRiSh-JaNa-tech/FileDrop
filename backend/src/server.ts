import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { getPeerForConnection, createUser, deleteUser } from './models/User';
import { client, connectToRedis } from './utils/redisClient';

const PORT = 3000;
const app = express();
app.use(cors({
  origin: "*",   // allow all (for development)
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// Get peer info by peerId
app.get("/connect/:peerId", async (req: Request, res: Response) => {
  const { peerId } = req.params;
  const result = await getPeerForConnection(client, peerId as string);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
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
    const { peerId } = req.query;
    if (!peerId || typeof peerId !== "string") {
        return res.status(400).json({ success: false, error: "peerId query parameter is required" });
    }
    const result = await getPeerForConnection(client, peerId as string);
    if (!result.success) {
        return res.status(404).json(result);
    }
    res.json(result);
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
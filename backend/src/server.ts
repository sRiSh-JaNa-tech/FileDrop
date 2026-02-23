import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';



const PORT = 3000;
const app = express();
app.use(cors());
app.use(express.json());

app.post('/register', (req : Request, res : Response) => {
  const { userId, UserName } = req.body;
  if(!userId){
    return res.status(400).json({ message: 'User ID is required' });
  }

  res.status(200).json({ message: 'Registration successful' });
});

const server = http.createServer(app);
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
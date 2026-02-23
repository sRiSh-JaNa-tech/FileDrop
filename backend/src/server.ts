import express from 'express';
import http from 'http';
import path from 'path';

import updateRouter from './routers/UpdateRouter';

const PORT = 3000;
const app = express();
app.use('/update', updateRouter);
const server = http.createServer(app);
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
import './polyfill.js';
import 'dotenv/config';
import { WebSocketServer } from 'ws';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { logger } from './common/logger.js';
import { config } from './config/deepgramConfig.js';
import { setupClientHub } from './ws/clientHub.js';


const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', component: 'bridge' });
});

setupClientHub(wss);

server.listen(config.port, () => {
  logger.info(`Bridge server active on port ${config.port}`);
});

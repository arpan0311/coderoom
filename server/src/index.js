import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import questionRoutes from './routes/questions.js';
import roomRoutes from './routes/rooms.js';
import { setupSocket } from './realtime/socket.js';
import { initQueue } from './runner/queue.js';
import { languageList } from './runner/languages.js';
import Question from './models/Question.js';
import { seedDatabase } from './seed.js';

const app = express();
app.set('trust proxy', 1); // we sit behind Nginx / a load balancer in production
app.use(helmet());
app.use(cors({ origin: config.clientUrls }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1, sandbox: config.sandbox.driver }),
);

app.get('/api/languages', (_req, res) => res.json({ languages: languageList() }));

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 50, message: { error: 'Too many attempts, try later' } });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/rooms', roomRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (!err.expose) console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.clientUrls }, maxHttpBufferSize: 1e6 });
app.set('io', io);
setupSocket(io);

await mongoose.connect(config.mongoUri);
console.log('MongoDB connected');
// Hosts like Render's free plan have no terminal to run "npm run seed", so seed on first start.
if (process.env.SEED_ON_START === 'true' && (await Question.estimatedDocumentCount()) === 0) {
  await seedDatabase();
}
await initQueue();
server.listen(config.port, () => console.log(`API running on http://localhost:${config.port}`));

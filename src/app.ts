import express from 'express';
import cors from 'cors';
import apiRouter from './routes';

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// API v1
app.use('/api/v1', apiRouter);

app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'RIDE API v1 (관리대장)',
      version: '0.1.0',
      endpoints: ['/dashboard', '/customers', '/drivers', '/rides', '/attendance', '/invoices', '/settings'],
    },
  });
});

export default app;

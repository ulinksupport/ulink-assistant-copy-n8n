const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Router
const userRouter = require('./routes/user/user.router.js');
const assistantRouter = require('./routes/assistant/assistant.router.js');
const sessionRouter = require('./routes/session/session.router.js');
const chatRouter = require('./routes/chat/chat.router.js');

const { CORS_ALLOW_ORIGIN } = require('./config.js');


const app = express();
app.use(express.json());
app.use(morgan('dev'));

// -------- CORS: allow your Vite origins ----------
// Always include the deployed frontend URL; supplement with comma-separated CORS_ALLOW_ORIGIN env var
const ALWAYS_ALLOWED = [
  'https://ulink-assistant-copy-n8n.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
];
const envAllowed = (CORS_ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const allowed = [...new Set([...ALWAYS_ALLOWED, ...envAllowed])];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman) or matching origins
    if (!origin || allowed.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors({
  origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// Define API Routes in here
// -------- Start API routes ----------
app.use('/api/users', userRouter);
app.use('/api/assistants', assistantRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/chats', chatRouter);


// -------- End API routes ----------



// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler (prevents “connection closed on receive”)
app.use((err, req, res, _next) => {
  console.error('ERROR:', err);
  const code = err.status || 500;
  res.status(code).json({ error: err.message || 'Server error' });
});

module.exports = app;
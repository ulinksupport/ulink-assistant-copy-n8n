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
const allowed = (CORS_ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    cb(null, !origin || allowed.includes(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());


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
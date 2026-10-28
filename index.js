require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const jobRoutes = require('./routes/jobsRoutes');
const { fetchJobs } = require('./services/jobFetcher');

const authRoutes   = require('./routes/authRoutes');
const userRoutes   = require('./routes/userRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const linkedinRoutes = require('./routes/linkedin.routes');
const knowledgeRoutes = require('./routes/knowledgeRoutes');
const blogRoutes = require('./routes/blogRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  "https://apply4works.com",
  "https://www.apply4works.com",
  "http://localhost:5173"
];

app.use((req, res, next) => {
  // console.log('[Backend] Request:', req.method, req.url); // reduced noise
  next();
});

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.options("*", cors());
app.use(express.json());

app.use('/uploads', require('express').static(require('path').join(__dirname, 'uploads')));

// Routes
app.use('/api', jobRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/blogs', blogRoutes);


// Connect to DB and Start Server
connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    const Job = require('./models/Job');
    const mongoose = require('mongoose');
    console.log(`Connected DB (index.js): ${mongoose.connection.name}`);

    // LinkedIn Configuration Validation
    if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET || !process.env.LINKEDIN_REDIRECT_URI) {
      console.warn('⚠️  [Warning] LinkedIn OAuth configuration is missing (Client ID, Secret, or Redirect URI). Connection features will fail.');
    } else {
      console.log('✅ [LinkedIn] OAuth configuration verified');
    }
    // Initialize Email Schedulers
    const { runEmailScheduler } = require('./scheduler/emailCron');
    runEmailScheduler();
    
    // Initialize LinkedIn Scheduler
    const { runLinkedinScheduler } = require('./scheduler/linkedinCron');
    runLinkedinScheduler();
    
    if (process.env.LINKEDIN_TASK_ID) {
      console.log('[Apify] LinkedIn Task Loaded');
    }
    if (process.env.INDEED_TASK_ID) {
      console.log('[Apify] Indeed Disabled');
    }
    console.log('[Jobs] Collection ready');
    
    const { initializeJobsCache } = require('./controllers/jobsController');
    
    // Non-blocking background sync
    setImmediate(async () => {
      try {
        initializeJobsCache().catch(err => console.error('Cache init failed:', err));
        console.log('[Jobs] Initial Sync Started');
        await fetchJobs();
        console.log('[Jobs] Initial Sync Complete');
      } catch (err) {
        console.error('Initial sync failed', err);
      }
    });
    
    const cron = require('node-cron');
    const intervalHours = parseInt(process.env.JOB_FETCH_INTERVAL_HOURS) || 6;
    console.log('[Scheduler] Started');
    console.log(`[Scheduler] Interval: ${intervalHours} hours`);
    const firstSync = new Date(Date.now() + intervalHours * 60 * 60 * 1000);
    console.log(`[Scheduler] Next Run: ~${firstSync.toLocaleString()}`);
    cron.schedule(`0 */${intervalHours} * * *`, () => {
      console.log(`Running cron job to fetch jobs (every ${intervalHours} hours)...`);
      fetchJobs();
    });
    
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${PORT} already in use`);
      process.exit(1);
    } else {
      console.error(err);
    }
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
});

// Global 404 JSON Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Server Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

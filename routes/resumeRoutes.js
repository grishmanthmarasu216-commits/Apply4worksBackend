const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { protect } = require('../middleware/authMiddleware');
const {
  uploadResume,
  getMyResume,
  saveResume,
  editUserResume,
  analyzeJob,
  optimizeResume,
  optimizeSection,
  aiSuggest,
  generateCoverLetterHandler,
  restoreVersion,
  listVersions,
  deleteVersion,
  saveVersion,
  testParse,
} = require('../controllers/resumeController');

const router = express.Router();

// ── Multer disk storage ────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|doc|docx)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed.'));
    }
  },
});

// ── Routes ─────────────────────────────────────────────────────────────────────

// Core resume CRUD
router.post('/upload',         protect, upload.single('resume'), uploadResume);
router.get('/me',              protect, getMyResume);
router.put('/save',            protect, saveResume);           // V2 autosave
router.put('/edit',            protect, editUserResume);       // Legacy compat

// Job analysis
router.post('/analyze-job',    protect, analyzeJob);

// AI optimization
router.post('/optimize',               protect, optimizeResume);
router.post('/optimize-section',       protect, optimizeSection);
router.post('/ai-suggest',             protect, aiSuggest);
router.post('/generate-cover-letter',  protect, generateCoverLetterHandler);

// Version control
router.post('/restore-version', protect, restoreVersion);
router.post('/versions/save',   protect, saveVersion);     // Explicit named version save
router.get('/versions',         protect, listVersions);
router.delete('/versions/:id',  protect, deleteVersion);

// Dev diagnostics (disabled in production inside controller)
router.post('/test-parse', protect, testParse);

module.exports = router;

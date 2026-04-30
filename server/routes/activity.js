import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getLog } from '../services/ActivityLog.js';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  res.json(getLog());
});

export default router;

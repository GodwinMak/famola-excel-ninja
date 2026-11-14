import { Router } from 'express';
import { sequelize } from '../config/db';

const router = Router();

router.get('/', async (_req, res) => {
  let dbConnected = false;
  try {
    await sequelize.authenticate();
    dbConnected = true;
  } catch {
    dbConnected = false;
  }
  res.json({ status: 'ok', dbConnected, timestamp: new Date().toISOString() });
});

export default router;

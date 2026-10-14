import { Router } from 'express';
import { Invitation } from '../models/Invitation';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const invitations = await Invitation.findAll({ order: [['createdAt', 'DESC']] });
  res.json({ success: true, data: invitations });
});

router.post('/:id/revoke', async (req, res) => {
  const invitation = await Invitation.findByPk(req.params.id);
  if (!invitation) return res.status(404).json({ success: false, error: 'Invitation not found' });

  invitation.status = 'Revoked';
  await invitation.save();
  res.json({ success: true });
});

export default router;

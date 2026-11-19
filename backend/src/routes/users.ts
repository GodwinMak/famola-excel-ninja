import { Router } from 'express';
import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { generateInvitationToken, hashSecret, publicUser } from '../services/authService';
import { getDefaultScreenPermissionsForRole } from '../services/rbacDefaults';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', async (_req, res) => {
  const users = await User.findAll({ order: [['createdAt', 'ASC']] });
  res.json({ success: true, data: users.map(publicUser) });
});

router.post('/', async (req, res) => {
  const { email, name, role, department, screenPermissions, invitedBy } = req.body || {};
  if (!email || !name || !role) {
    return res.status(400).json({ success: false, error: 'email, name and role are required' });
  }

  const token = generateInvitationToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 90);

  const invitation = await Invitation.create({
    id: `inv-${Date.now()}`,
    email,
    name,
    role,
    department,
    token,
    tokenExpiresAt: expires,
    status: 'Pending',
    invitedBy,
    screenPermissions: screenPermissions || getDefaultScreenPermissionsForRole(role),
  });

  res.status(201).json({ success: true, invitation });
});

router.put('/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const { role, department, status, screenPermissions, name } = req.body || {};
  if (role !== undefined) user.role = role;
  if (department !== undefined) user.department = department;
  if (status !== undefined) user.status = status;
  if (screenPermissions !== undefined) user.screenPermissions = screenPermissions;
  if (name !== undefined) user.name = name;
  await user.save();

  res.json({ success: true, user: publicUser(user) });
});

router.post('/:id/reset-password', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ success: false, error: 'password is required' });

  // The app's UX treats one shared secret as usable for both password and PIN login.
  const hash = await hashSecret(password);
  user.passwordHash = hash;
  user.pinHash = hash;
  await user.save();
  res.json({ success: true });
});

// Transitional: upserts the admin's full local user roster (see routes/database.ts'
// /bulk-sync for the same rationale) so credential/permission edits made in the
// Settings UI's user-management screen actually take effect against the real,
// backend-enforced login instead of only a browser-local cache.
router.post('/sync', async (req, res) => {
  const users = Array.isArray(req.body?.users) ? req.body.users : [];

  for (const u of users) {
    if (!u?.id || !u?.email) continue;
    const secret = (u.password || u.pinCode || '').trim();
    const existing = await User.findByPk(u.id);
    const patch: any = {
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      status: u.status,
      screenPermissions: u.screenPermissions,
    };
    if (secret) {
      const hash = await hashSecret(secret);
      patch.passwordHash = hash;
      patch.pinHash = hash;
    }
    if (existing) {
      await existing.update(patch);
    } else {
      await User.create({ id: u.id, ...patch, role: u.role || 'Auditor', status: u.status || 'Active' });
    }
  }

  res.json({ success: true });
});

router.post('/:id/toggle-hold', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  user.status = user.status === 'On Hold' ? 'Active' : 'On Hold';
  await user.save();
  res.json({ success: true, user: publicUser(user) });
});

router.delete('/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  user.status = 'Inactive';
  await user.save();
  res.json({ success: true });
});

export default router;

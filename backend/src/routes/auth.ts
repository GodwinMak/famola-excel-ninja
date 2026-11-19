import { Router } from 'express';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import { requireAuth } from '../middleware/auth';
import { compareSecret, hashSecret, publicUser, signToken } from '../services/authService';
import { getDefaultScreenPermissionsForRole } from '../services/rbacDefaults';

const router = Router();

async function findUserByLooseId(userIdInput: string): Promise<User | null> {
  const clean = (userIdInput || '').trim();
  if (!clean) return null;
  return User.findOne({
    where: {
      [Op.or]: [
        { id: clean },
        { username: clean },
        { name: clean },
        { email: clean },
        { email: { [Op.like]: `${clean}@%` } },
      ],
    },
  });
}

router.post('/login', async (req, res) => {
  const { userId, password } = req.body || {};
  if (!userId || !password) {
    return res.status(400).json({ success: false, error: 'userId and password are required' });
  }

  const user = await findUserByLooseId(userId);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Account not found' });
  }
  if (user.status === 'On Hold' || user.status === 'Inactive') {
    return res.status(403).json({ success: false, error: `Account is ${user.status}` });
  }
  if (!user.passwordHash) {
    return res.status(401).json({ success: false, error: 'No password set for this account. Ask an admin to set one.' });
  }

  const ok = await compareSecret(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user);
  res.json({ success: true, token, user: publicUser(user) });
});

router.post('/pin-login', async (req, res) => {
  const { userId, pin } = req.body || {};
  if (!pin) {
    return res.status(400).json({ success: false, error: 'pin is required' });
  }

  let candidates: User[];
  if (userId) {
    const user = await findUserByLooseId(userId);
    candidates = user ? [user] : [];
  } else {
    candidates = await User.findAll({ where: { status: 'Active' } });
  }

  for (const user of candidates) {
    if (user.status === 'On Hold' || user.status === 'Inactive') continue;
    if (!user.pinHash) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await compareSecret(pin, user.pinHash);
    if (ok) {
      user.lastLoginAt = new Date();
      await user.save();
      const token = signToken(user);
      return res.json({ success: true, token, user: publicUser(user) });
    }
  }

  res.status(401).json({ success: false, error: 'Invalid PIN' });
});

router.post('/accept-invitation', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'token and password are required' });
  }

  const invitation = await Invitation.findOne({ where: { token } });
  if (!invitation) {
    return res.status(404).json({ success: false, error: 'Invalid invitation token' });
  }
  if (invitation.status === 'Revoked') {
    return res.status(410).json({ success: false, error: 'This invitation has been revoked' });
  }
  if (invitation.tokenExpiresAt.getTime() < Date.now()) {
    return res.status(410).json({ success: false, error: 'This invitation has expired' });
  }

  let user = await User.findOne({ where: { email: invitation.email } });
  const passwordHash = await hashSecret(password);
  const screenPermissions = invitation.screenPermissions || getDefaultScreenPermissionsForRole(invitation.role);

  if (user) {
    user.status = 'Active';
    user.passwordHash = passwordHash;
    user.pinHash = passwordHash;
    user.screenPermissions = screenPermissions;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      id: `usr-${Date.now()}`,
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      department: invitation.department,
      status: 'Active',
      passwordHash,
      pinHash: passwordHash,
      screenPermissions,
      lastLoginAt: new Date(),
    });
  }

  invitation.status = 'Active';
  invitation.lastUsedAt = new Date();
  await invitation.save();

  const jwtToken = signToken(user);
  res.json({ success: true, token: jwtToken, user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: publicUser(req.user!) });
});

router.post('/logout', requireAuth, async (_req, res) => {
  res.json({ success: true });
});

export default router;

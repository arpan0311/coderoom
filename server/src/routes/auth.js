import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (typeof email !== 'string' || !EMAIL.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email' });
  if (typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['interviewer', 'candidate'].includes(role)) return res.status(400).json({ error: 'Pick a role' });

  const cleanEmail = email.trim().toLowerCase();
  if (await User.exists({ email: cleanEmail })) return res.status(409).json({ error: 'This email is already registered' });

  const user = await User.create({
    name: name.trim(),
    email: cleanEmail,
    passwordHash: await bcrypt.hash(password, 10),
    role,
  });
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password' });

  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;

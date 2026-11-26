import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import User from '../models/User.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

/** Returns the user for a token, or null if the token is missing/invalid. */
export async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return await User.findById(payload.sub);
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = await userFromToken(token);
  if (!user) return res.status(401).json({ error: 'Please log in again' });
  req.user = user;
  next();
}

export const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: `Only a ${role} can do this` });

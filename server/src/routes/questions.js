import { Router } from 'express';
import Question from '../models/Question.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { fullQuestion } from './views.js';

const router = Router();
router.use(requireAuth, requireRole('interviewer'));

router.get('/', async (_req, res) => {
  const questions = await Question.find().sort({ createdAt: -1 });
  res.json({ questions: questions.map(fullQuestion) });
});

router.post('/', async (req, res) => {
  const { title, difficulty, description, testCases } = req.body ?? {};
  if (!Array.isArray(testCases) || testCases.some((t) => !t || typeof t.input !== 'string' || typeof t.expected !== 'string'))
    return res.status(400).json({ error: 'Each test needs "input" and "expected" as text' });

  const question = await Question.create({
    title,
    difficulty,
    description,
    testCases: testCases.map((t) => ({ input: t.input, expected: t.expected, hidden: Boolean(t.hidden) })),
    createdBy: req.user._id,
  });
  res.status(201).json({ question: fullQuestion(question) });
});

export default router;

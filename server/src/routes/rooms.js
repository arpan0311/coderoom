import { Router } from 'express';
import { randomInt } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Room from '../models/Room.js';
import Question from '../models/Question.js';
import Submission from '../models/Submission.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildJob, parseOutput, hideHiddenDetails } from '../runner/harness.js';
import { runCode } from '../runner/queue.js';
import { LANGUAGE_IDS, isAvailable } from '../runner/languages.js';
import { getLiveCodes, updateRoomState } from '../realtime/socket.js';
import { roomView, fullQuestion } from './views.js';

const router = Router();
router.use(requireAuth);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const idOf = (v) => String(v?._id ?? v);

function roleIn(room, user) {
  if (idOf(room.interviewer) === String(user._id)) return 'interviewer';
  if (room.candidate && idOf(room.candidate) === String(user._id)) return 'candidate';
  return null;
}

async function loadRoom(code) {
  return Room.findOne({ code: String(code).toUpperCase() })
    .populate('questions')
    .populate('interviewer', 'name email')
    .populate('candidate', 'name email');
}

/** If the timer ran out, mark the room as ended. */
async function syncExpiry(room) {
  if (room.status === 'live' && room.isExpired()) {
    room.status = 'ended';
    room.endedAt = room.deadline();
    await room.save();
    updateRoomState(room.code, { ended: true });
  }
}

const notifyRoom = (req, code) => req.app.get('io').to(code).emit('room-updated');

// Middleware: load the room and check the user belongs to it.
async function withRoom(req, res, next) {
  const room = await loadRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const role = roleIn(room, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this room' });
  await syncExpiry(room);
  req.room = room;
  req.roomRole = role;
  next();
}

const interviewerOnly = (req, res, next) =>
  req.roomRole === 'interviewer' ? next() : res.status(403).json({ error: 'Only the interviewer can do this' });

// ---------------- create & list ----------------

router.post('/', requireRole('interviewer'), async (req, res) => {
  const { title, questionIds, durationMinutes = 0 } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 10)
    return res.status(400).json({ error: 'Pick 1 to 10 questions' });
  if (!questionIds.every((id) => mongoose.isValidObjectId(id)))
    return res.status(400).json({ error: 'Invalid question id' });
  const found = await Question.countDocuments({ _id: { $in: questionIds } });
  if (found !== new Set(questionIds).size) return res.status(400).json({ error: 'Some questions do not exist' });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const room = await Room.create({
        code: newCode(),
        title: title.trim(),
        interviewer: req.user._id,
        questions: questionIds,
        durationMinutes: Number(durationMinutes) || 0,
      });
      return res.status(201).json({ code: room.code });
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 = duplicate code, try another one
    }
  }
  res.status(500).json({ error: 'Could not create a room code, please try again' });
});

router.get('/', async (req, res) => {
  const field = req.user.role === 'interviewer' ? 'interviewer' : 'candidate';
  const rooms = await Room.find({ [field]: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('code title status durationMinutes startedAt createdAt candidate interviewer feedback.decision questions')
    .populate('candidate', 'name')
    .populate('interviewer', 'name');
  res.json({ rooms });
});

// ---------------- one room ----------------

router.get('/:code', async (req, res) => {
  let room = await loadRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found. Check the code.' });

  // The first candidate who opens the link becomes this room's candidate.
  if (!roleIn(room, req.user) && req.user.role === 'candidate' && !room.candidate && room.status !== 'ended') {
    await Room.updateOne({ _id: room._id, candidate: null }, { candidate: req.user._id });
    room = await loadRoom(req.params.code);
    notifyRoom(req, room.code);
  }
  const role = roleIn(room, req.user);
  if (!role) return res.status(403).json({ error: 'This room belongs to another candidate' });

  await syncExpiry(room);
  res.json({ room: roomView(room, role) });
});

router.post('/:code/start', withRoom, interviewerOnly, async (req, res) => {
  const { room } = req;
  if (room.status === 'ended') return res.status(400).json({ error: 'This interview has already ended' });
  room.status = 'live';
  room.startedAt ??= new Date();
  await room.save();
  updateRoomState(room.code, { deadline: room.deadline() });
  notifyRoom(req, room.code);
  res.json({ ok: true });
});

router.post('/:code/end', withRoom, interviewerOnly, async (req, res) => {
  const { room } = req;
  if (room.status !== 'ended') {
    room.status = 'ended';
    room.endedAt = new Date();
    await room.save();
  }
  updateRoomState(room.code, { ended: true });
  notifyRoom(req, room.code);
  res.json({ ok: true });
});

router.patch('/:code/current-question', withRoom, interviewerOnly, async (req, res) => {
  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0 || index >= req.room.questions.length)
    return res.status(400).json({ error: 'Invalid question' });
  req.room.currentQuestion = index;
  await req.room.save();
  notifyRoom(req, req.room.code);
  res.json({ ok: true });
});

// ---------------- run code ----------------

const runLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  message: { error: 'Too many runs. Please wait a minute.' },
});

router.post('/:code/run', withRoom, runLimiter, async (req, res) => {
  const { room, user } = req;
  const { code, questionIndex, language, mode = 'run' } = req.body ?? {};
  if (room.status === 'ended') return res.status(400).json({ error: 'This interview has ended' });
  if (typeof code !== 'string' || code.length > 50_000) return res.status(400).json({ error: 'Code is missing or too long' });
  if (!['run', 'submit'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  if (!LANGUAGE_IDS.has(language)) return res.status(400).json({ error: 'Unknown language' });
  if (!isAvailable(language)) return res.status(400).json({ error: `${language} is not installed on this server` });
  const question = room.questions[Number(questionIndex)];
  if (!question) return res.status(400).json({ error: 'Invalid question' });

  // "Run" uses only the example tests. "Submit" also uses the hidden tests.
  const tests = mode === 'submit' ? question.testCases : question.testCases.filter((t) => !t.hidden);
  const { job, marker } = buildJob({ language, code, tests });

  const io = req.app.get('io');
  io.to(room.code).emit('run-started', { by: user.name, mode, language });

  const exec = await runCode(job);
  const result = parseOutput(exec, marker, tests);

  if (mode === 'submit') {
    await Submission.create({
      room: room._id,
      question: question._id,
      submittedBy: user._id,
      language,
      code,
      ...result,
    });
  }

  const payload = {
    ...hideHiddenDetails(result),
    mode,
    language,
    questionIndex: Number(questionIndex),
    by: { id: String(user._id), name: user.name },
    at: new Date(),
  };
  io.to(room.code).emit('run-result', payload);
  res.json(payload);
});

// ---------------- feedback & report ----------------

router.patch('/:code/feedback', withRoom, interviewerOnly, async (req, res) => {
  const { notes, rating, decision } = req.body ?? {};
  if (notes !== undefined) req.room.feedback.notes = String(notes);
  if (rating !== undefined) req.room.feedback.rating = Number(rating);
  if (decision !== undefined) req.room.feedback.decision = decision;
  await req.room.save();
  res.json({ feedback: req.room.feedback });
});

router.get('/:code/report', withRoom, interviewerOnly, async (req, res) => {
  const { room } = req;
  const submissions = await Submission.find({ room: room._id })
    .sort({ createdAt: -1 })
    .populate('submittedBy', 'name')
    .populate('question', 'title');
  const live = getLiveCodes(room.code);
  res.json({
    room: { ...roomView(room, 'interviewer'), questions: room.questions.map(fullQuestion) },
    feedback: room.feedback,
    codes: live?.codes ?? Object.fromEntries(room.codes ?? []),
    languages: live?.languages ?? Object.fromEntries(room.languages ?? []),
    submissions,
    chat: room.chat,
  });
});

export default router;

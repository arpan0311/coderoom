import * as Y from 'yjs';
import Room from '../models/Room.js';
import { userFromToken } from '../middleware/auth.js';
import { DEFAULT_LANGUAGE, LANGUAGE_IDS, templateFor } from '../runner/languages.js';

/**
 * Real-time features over Socket.io:
 *  - Shared code editor using Yjs (a CRDT: two people can type at once without overwriting each other)
 *  - Chat
 *  - WebRTC signaling for the video call (the video itself goes peer-to-peer, not through us)
 *  - Who is online in the room
 *
 * Each active room keeps one Y.Doc in memory. It holds:
 *   - a Y.Map "meta":  "q0" -> chosen language for question 0, ...
 *   - one Y.Text per question + language: "q0:python", "q0:java", ...
 * The code is saved to MongoDB a couple of seconds after people stop typing.
 */

const docs = new Map(); // room code -> { doc, questionCount, ended, deadline, saveTimer }
const loading = new Map(); // room code -> Promise (so two people joining at once share one load)
let ioRef = null;

const isParticipant = (room, userId) =>
  String(room.interviewer) === userId || (room.candidate && String(room.candidate) === userId);

/** Pick a language for a question. Only the server fills in the starter code, so it is never added twice. */
function setLanguage(doc, questionIndex, language, savedCode) {
  doc.transact(() => {
    doc.getMap('meta').set(`q${questionIndex}`, language);
    const text = doc.getText(`q${questionIndex}:${language}`);
    if (text.length === 0) text.insert(0, savedCode ?? templateFor(language));
  }, 'server');
}

async function loadDoc(code) {
  if (docs.has(code)) return docs.get(code);
  if (loading.has(code)) return loading.get(code);

  const promise = (async () => {
    const room = await Room.findOne({ code });
    const doc = new Y.Doc();
    doc.transact(() => {
      for (const [key, value] of room.codes ?? []) if (/^q\d+:/.test(key)) doc.getText(key).insert(0, value);
    }, 'server');
    room.questions.forEach((_q, i) => {
      const lang = room.languages?.get(`q${i}`);
      setLanguage(doc, i, LANGUAGE_IDS.has(lang) ? lang : DEFAULT_LANGUAGE);
    });
    const entry = {
      doc,
      questionCount: room.questions.length,
      ended: room.status === 'ended',
      deadline: room.deadline(),
      saveTimer: null,
    };
    doc.on('update', (update, origin) => {
      // Changes made by the server itself (like switching language) must be sent to everyone.
      if (origin === 'server') ioRef?.to(code).emit('yjs-update', update);
      clearTimeout(entry.saveTimer);
      entry.saveTimer = setTimeout(() => persist(code), 2000);
    });
    docs.set(code, entry);
    return entry;
  })();

  loading.set(code, promise);
  try {
    return await promise;
  } finally {
    loading.delete(code);
  }
}

async function persist(code) {
  const entry = docs.get(code);
  if (!entry) return;
  clearTimeout(entry.saveTimer);
  await Room.updateOne({ code }, { $set: snapshot(entry) }).catch((e) => console.error('Saving code failed:', e.message));
}

function snapshot(entry) {
  const codes = {};
  for (const name of entry.doc.share.keys()) {
    if (/^q\d+:/.test(name)) codes[name] = entry.doc.getText(name).toString();
  }
  return { codes, languages: entry.doc.getMap('meta').toJSON() };
}

/** Latest code + languages from the live editor, if the room is open right now. */
export function getLiveCodes(code) {
  const entry = docs.get(code);
  return entry ? snapshot(entry) : null;
}

/** Called by the API when a room starts/ends so the editor can lock at the right time. */
export function updateRoomState(code, { ended, deadline }) {
  const entry = docs.get(code);
  if (!entry) return;
  if (ended !== undefined) entry.ended = ended;
  if (deadline !== undefined) entry.deadline = deadline;
  if (entry.ended) persist(code);
}

const canEdit = (entry) => !entry.ended && !(entry.deadline && Date.now() > entry.deadline.getTime());

async function presence(io, code) {
  const sockets = await io.in(code).fetchSockets();
  const seen = new Map();
  sockets.forEach((s) => seen.set(s.data.user.id, s.data.user));
  io.to(code).emit('presence', [...seen.values()]);
}

export function setupSocket(io) {
  ioRef = io;
  // Every socket must log in with the same token as the REST API.
  io.use(async (socket, next) => {
    const user = await userFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = { id: String(user._id), name: user.name, role: user.role };
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.user;

    socket.on('join-room', async (payload, ack = () => {}) => {
      try {
        const code = String(payload?.code || '').toUpperCase();
        const room = await Room.findOne({ code }).select('interviewer candidate');
        if (!room || !isParticipant(room, me.id)) return ack({ ok: false, error: 'You are not part of this room' });

        const entry = await loadDoc(code);
        socket.join(code);
        socket.data.roomCode = code;
        ack({ ok: true, state: Y.encodeStateAsUpdate(entry.doc) });
        presence(io, code);
      } catch (err) {
        console.error('join-room failed:', err);
        ack({ ok: false, error: 'Could not join the room' });
      }
    });

    socket.on('yjs-update', (update) => {
      const code = socket.data.roomCode;
      const entry = code && docs.get(code);
      if (!entry || !canEdit(entry)) return;
      try {
        Y.applyUpdate(entry.doc, new Uint8Array(update), socket.id);
        socket.to(code).emit('yjs-update', update);
      } catch {
        // ignore broken updates
      }
    });

    socket.on('set-language', ({ questionIndex, language } = {}) => {
      const code = socket.data.roomCode;
      const entry = code && docs.get(code);
      const i = Number(questionIndex);
      if (!entry || !canEdit(entry) || !LANGUAGE_IDS.has(language)) return;
      if (!Number.isInteger(i) || i < 0 || i >= entry.questionCount) return;
      setLanguage(entry.doc, i, language);
    });

    socket.on('chat', async (text) => {
      const code = socket.data.roomCode;
      if (!code || typeof text !== 'string' || !text.trim()) return;
      const msg = { userId: me.id, name: me.name, text: text.trim().slice(0, 1000), at: new Date() };
      io.to(code).emit('chat', msg);
      await Room.updateOne({ code }, { $push: { chat: { $each: [msg], $slice: -500 } } }).catch(() => {});
    });

    // ---- WebRTC video call signaling ----
    // A client says "call-ready" once its camera is set up. Others in the room then call it.
    socket.on('call-ready', () => {
      const code = socket.data.roomCode;
      if (code) socket.to(code).emit('peer-joined', { socketId: socket.id, name: me.name });
    });

    socket.on('signal', ({ to, data } = {}) => {
      const code = socket.data.roomCode;
      const target = code && io.sockets.sockets.get(to);
      if (!target || target.data.roomCode !== code) return; // only signal people in the same room
      target.emit('signal', { from: socket.id, name: me.name, data });
    });

    socket.on('disconnect', async () => {
      const code = socket.data.roomCode;
      if (!code) return;
      socket.to(code).emit('peer-left', { socketId: socket.id });
      presence(io, code);
      // Last person left: save and free memory.
      if (!io.sockets.adapter.rooms.get(code)?.size && docs.has(code)) {
        await persist(code);
        if (!io.sockets.adapter.rooms.get(code)?.size) {
          docs.get(code)?.doc.destroy();
          docs.delete(code);
        }
      }
    });
  });
}

import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const messageSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User' },
    name: String,
    text: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    interviewer: { type: ObjectId, ref: 'User', required: true },
    candidate: { type: ObjectId, ref: 'User', default: null },
    questions: [{ type: ObjectId, ref: 'Question' }],
    currentQuestion: { type: Number, default: 0 },
    status: { type: String, enum: ['waiting', 'live', 'ended'], default: 'waiting' },
    // 0 = no time limit. Otherwise the room ends by itself after this many minutes.
    durationMinutes: { type: Number, default: 0, min: 0, max: 300 },
    startedAt: Date,
    endedAt: Date,
    // Latest code from the live editor. Key = "q<index>:<language>", e.g. "q0:python".
    codes: { type: Map, of: String, default: {} },
    // Language chosen for each question. Key = "q<index>".
    languages: { type: Map, of: String, default: {} },
    chat: [messageSchema],
    feedback: {
      notes: { type: String, default: '', maxlength: 10000 },
      rating: { type: Number, min: 0, max: 5, default: 0 },
      decision: {
        type: String,
        enum: ['', 'strong_hire', 'hire', 'no_hire', 'strong_no_hire'],
        default: '',
      },
    },
  },
  { timestamps: true },
);

roomSchema.methods.deadline = function deadline() {
  if (!this.durationMinutes || !this.startedAt) return null;
  return new Date(this.startedAt.getTime() + this.durationMinutes * 60_000);
};

roomSchema.methods.isExpired = function isExpired() {
  const d = this.deadline();
  return Boolean(d && Date.now() > d.getTime());
};

export default mongoose.model('Room', roomSchema);

import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const resultSchema = new mongoose.Schema(
  {
    passed: Boolean,
    hidden: Boolean,
    input: Mixed,
    expected: Mixed,
    actual: String,
    stderr: String,
    error: String,
    timeMs: Number,
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    room: { type: ObjectId, ref: 'Room', required: true, index: true },
    question: { type: ObjectId, ref: 'Question', required: true },
    submittedBy: { type: ObjectId, ref: 'User', required: true },
    language: { type: String, required: true },
    code: { type: String, required: true },
    status: { type: String, enum: ['ok', 'error', 'timeout', 'compile_error'], required: true },
    message: String,
    compileOutput: String,
    passed: Number,
    total: Number,
    results: [resultSchema],
    durationMs: Number,
  },
  { timestamps: true },
);

export default mongoose.model('Submission', submissionSchema);

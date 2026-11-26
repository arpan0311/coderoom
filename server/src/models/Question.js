import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema(
  {
    // Text given to the program on standard input
    input: { type: String, default: '', maxlength: 100_000 },
    // Text the program must print (line endings / trailing spaces are ignored)
    expected: { type: String, default: '', maxlength: 100_000 },
    // Hidden tests are only used on "Submit" and their details are never shown to the candidate
    hidden: { type: Boolean, default: false },
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    // Should explain the input format and the output format.
    description: { type: String, required: true, maxlength: 10000 },
    testCases: {
      type: [testCaseSchema],
      validate: { validator: (v) => v.length > 0 && v.length <= 30, message: 'Add between 1 and 30 test cases' },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export default mongoose.model('Question', questionSchema);

// Adds demo users and sample questions.  Run:  npm run seed
// Also runs by itself on startup when SEED_ON_START=true and the database has no questions.
// Questions use standard input/output so they work in every language.
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import User from './models/User.js';
import Question from './models/Question.js';

export async function seedDatabase() {
  const users = [
    { name: 'Demo Interviewer', email: 'interviewer@demo.com', role: 'interviewer' },
    { name: 'Demo Candidate', email: 'candidate@demo.com', role: 'candidate' },
  ];
  const passwordHash = await bcrypt.hash('demo1234', 10);
  for (const u of users) {
    await User.updateOne({ email: u.email }, { $setOnInsert: { ...u, passwordHash } }, { upsert: true });
  }
  const interviewer = await User.findOne({ email: 'interviewer@demo.com' });

  const questions = [
    {
      title: 'Two Sum',
      difficulty: 'easy',
      description: `Find the two numbers in the list that add up to the target, and print their positions (0-based), smaller first.

  **Input:** line 1 has the numbers separated by spaces. Line 2 has the \`target\`.

  **Output:** the two positions separated by a space, like \`0 1\`.

  There is always exactly one answer.`,
      testCases: [
        { input: '2 7 11 15\n9\n', expected: '0 1' },
        { input: '3 2 4\n6\n', expected: '1 2' },
        { input: '3 3\n6\n', expected: '0 1', hidden: true },
        { input: '-1 -2 -3 -4 -5\n-8\n', expected: '2 4', hidden: true },
      ],
    },
    {
      title: 'Valid Parentheses',
      difficulty: 'easy',
      description: `You get a string with only the characters \`()[]{}\`. Print \`true\` if every bracket is closed in the right order, otherwise print \`false\`.

  **Input:** one line with the string.

  **Output:** \`true\` or \`false\`.`,
      testCases: [
        { input: '()\n', expected: 'true' },
        { input: '()[]{}\n', expected: 'true' },
        { input: '(]\n', expected: 'false' },
        { input: '([)]\n', expected: 'false', hidden: true },
        { input: '{[]}\n', expected: 'true', hidden: true },
        { input: '((\n', expected: 'false', hidden: true },
      ],
    },
    {
      title: 'Reverse Words',
      difficulty: 'easy',
      description: `Print the words of the sentence in reverse order. Words are separated by one or more spaces. Print them with exactly one space between them.

  **Input:** one line with the sentence.

  **Output:** the words in reverse order.`,
      testCases: [
        { input: 'the sky is blue\n', expected: 'blue is sky the' },
        { input: '  hello world  \n', expected: 'world hello' },
        { input: 'a good   example\n', expected: 'example good a', hidden: true },
        { input: 'single\n', expected: 'single', hidden: true },
      ],
    },
    {
      title: 'Longest Substring Without Repeating Characters',
      difficulty: 'medium',
      description: `Print the length of the longest part of the string (a substring) that has no repeated characters.

  **Input:** one line with the string (letters, digits and symbols, no spaces).

  **Output:** one number.`,
      testCases: [
        { input: 'abcabcbb\n', expected: '3' },
        { input: 'bbbbb\n', expected: '1' },
        { input: 'pwwkew\n', expected: '3' },
        { input: 'dvdf\n', expected: '3', hidden: true },
        { input: 'abcdefghij\n', expected: '10', hidden: true },
      ],
    },
  ];

  for (const q of questions) {
    await Question.updateOne({ title: q.title }, { $set: { ...q, createdBy: interviewer._id } }, { upsert: true });
  }

  console.log('Seed done.');
  console.log('  Interviewer login: interviewer@demo.com / demo1234');
  console.log('  Candidate login:   candidate@demo.com / demo1234');
}

// Run directly with "npm run seed"
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri);
  await seedDatabase();
  await mongoose.disconnect();
}

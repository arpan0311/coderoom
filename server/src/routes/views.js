// Shapes of data we send to the browser. Hidden test cases never leave the server for candidates.

export function publicQuestion(q) {
  return {
    _id: q._id,
    title: q.title,
    difficulty: q.difficulty,
    description: q.description,
    examples: q.testCases.filter((t) => !t.hidden).map(({ input, expected }) => ({ input, expected })),
    hiddenCount: q.testCases.filter((t) => t.hidden).length,
  };
}

export function fullQuestion(q) {
  return { ...publicQuestion(q), testCases: q.testCases };
}

const person = (u) => (u ? { _id: u._id, name: u.name } : null);

export function roomView(room, myRole) {
  return {
    code: room.code,
    title: room.title,
    status: room.status,
    currentQuestion: room.currentQuestion,
    durationMinutes: room.durationMinutes,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    deadline: room.deadline(),
    interviewer: person(room.interviewer),
    candidate: person(room.candidate),
    myRole,
    questions: room.questions.map((q) => (myRole === 'interviewer' ? fullQuestion(q) : publicQuestion(q))),
    chat: room.chat.slice(-100),
  };
}

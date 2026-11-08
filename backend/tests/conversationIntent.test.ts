import { describe, it, expect } from 'vitest';
import { classifyIntent, composeConversationResponse } from '../src/lib/conversationIntent';

describe('conversationIntent', () => {
  it('classifies greeting', () => {
    expect(classifyIntent('hi')).toBe('GREETING');
  });

  it('composes greeting response', () => {
    expect(composeConversationResponse('GREETING', 'hi')).toContain('Good to see you');
  });

  it('composes explanation from stored explanation', () => {
    const response = composeConversationResponse('EXPLANATION_REQUEST', 'explain', 'What is 20% of 500?', '20% of 500 equals 100.');
    expect(response).toContain('20% of 500 equals 100.');
  });

  it('handles missing explanation honestly', () => {
    const response = composeConversationResponse('EXPLANATION_REQUEST', 'explain', 'Question', null);
    expect(response).toContain('I can help with that');
  });

  it('classifies general academic questions', () => {
    expect(classifyIntent('Explain India')).toBe('GENERAL_ACADEMIC');
    expect(classifyIntent('Explain Kerala')).toBe('GENERAL_ACADEMIC');
    expect(classifyIntent('What is photosynthesis?')).toBe('GENERAL_ACADEMIC');
  });

  it('classifies practice explanations', () => {
    expect(classifyIntent('Explain this question')).toBe('EXPLANATION_REQUEST');
    expect(classifyIntent('Why is option B correct?')).toBe('EXPLANATION_REQUEST');
  });

  // ── New intent tests ────────────────────────────────────────────────────────

  describe('SESSION_STATE_INQUIRY', () => {
    it('classifies "Which topic question are we focusing now?"', () => {
      expect(classifyIntent('Which topic question are we focusing now?')).toBe('SESSION_STATE_INQUIRY');
    });
    it('classifies "What topic are we studying?"', () => {
      expect(classifyIntent('What topic are we studying?')).toBe('SESSION_STATE_INQUIRY');
    });
    it('classifies "Which question are we solving?"', () => {
      expect(classifyIntent('Which question are we solving?')).toBe('SESSION_STATE_INQUIRY');
    });
    it('classifies "What are we focusing on?"', () => {
      expect(classifyIntent('What are we focusing on?')).toBe('SESSION_STATE_INQUIRY');
    });
    it('classifies "What is the current topic?"', () => {
      expect(classifyIntent('What is the current topic?')).toBe('SESSION_STATE_INQUIRY');
    });
    it('does NOT misclassify "Explain Kerala" as SESSION_STATE_INQUIRY', () => {
      expect(classifyIntent('Explain Kerala')).not.toBe('SESSION_STATE_INQUIRY');
    });
    it('does NOT misclassify greeting as SESSION_STATE_INQUIRY', () => {
      expect(classifyIntent('hi')).not.toBe('SESSION_STATE_INQUIRY');
    });
  });

  describe('PRACTICE_SUBJECT_REQUEST', () => {
    it('classifies "Give me an English grammar question"', () => {
      expect(classifyIntent('Give me an English grammar question')).toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('classifies "Give me a mathematics question"', () => {
      expect(classifyIntent('Give me a mathematics question')).toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('classifies "Give me an average question"', () => {
      expect(classifyIntent('Give me an average question')).toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('classifies "I want a polity question"', () => {
      expect(classifyIntent('I want a polity question')).toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('classifies "Question on current affairs"', () => {
      expect(classifyIntent('Question on current affairs')).toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('does NOT classify generic "Give me a question" as PRACTICE_SUBJECT_REQUEST', () => {
      expect(classifyIntent('Give me a question')).not.toBe('PRACTICE_SUBJECT_REQUEST');
    });
    it('does NOT classify "another question" as PRACTICE_SUBJECT_REQUEST', () => {
      expect(classifyIntent('another question')).not.toBe('PRACTICE_SUBJECT_REQUEST');
    });
  });

  describe('CHANGE_TOPIC', () => {
    it('classifies "Change topic"', () => {
      expect(classifyIntent('Change topic')).toBe('CHANGE_TOPIC');
    });
    it('classifies "Switch to maths"', () => {
      expect(classifyIntent('Switch to maths')).toBe('CHANGE_TOPIC');
    });
    it('classifies "Let\'s do something else"', () => {
      expect(classifyIntent("Let's do something else")).toBe('CHANGE_TOPIC');
    });
  });

  describe('no contamination from general academic context', () => {
    it('Explain Kerala stays GENERAL_ACADEMIC, not SESSION_STATE_INQUIRY', () => {
      expect(classifyIntent('Explain Kerala')).toBe('GENERAL_ACADEMIC');
    });
    it('Explain its wildlife stays GENERAL_ACADEMIC', () => {
      // Follow-up explanation with "its" references context but not the practice question
      const intent = classifyIntent('Explain its wildlife', [
        { sender: 'teacher', text: 'Kerala is a coastal state...' },
        { sender: 'student', text: 'Explain Kerala' },
      ]);
      expect(intent).not.toBe('SESSION_STATE_INQUIRY');
      expect(intent).not.toBe('PRACTICE_SUBJECT_REQUEST');
    });
  });

  describe('composeConversationResponse for new intents', () => {
    it('SESSION_STATE_INQUIRY with concept name includes the name', () => {
      const resp = composeConversationResponse('SESSION_STATE_INQUIRY', 'Which topic?', null, null, 'Average');
      expect(resp).toContain('Average');
    });
    it('SESSION_STATE_INQUIRY with no concept name asks to start', () => {
      const resp = composeConversationResponse('SESSION_STATE_INQUIRY', 'Which topic?');
      expect(resp.toLowerCase()).toMatch(/no active|would you like/i);
    });
    it('CHANGE_TOPIC asks for subject', () => {
      const resp = composeConversationResponse('CHANGE_TOPIC', 'change topic');
      expect(resp.toLowerCase()).toMatch(/which|what|subject|topic/i);
    });
  });
});

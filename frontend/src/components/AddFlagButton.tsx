// ============================================
// 5. AddFlagButton Integration - Use in question lists
// ============================================

import React from 'react';
import { QuestionFlagButton } from './QuestionFlagButton';

/**
 * Use this component in your question list display
 * Example:
 *   {questions.map(q => (
 *     <div key={q.id}>
 *       <span>{q.text.slice(0, 50)}</span>
 *       <AddFlagButton questionId={q.id} />
 *     </div>
 *   ))
 * })
 */
export const AddFlagButton = ({ questionId }: { questionId: string }) => {
  return <QuestionFlagButton questionId={questionId} />;
};

export default AddFlagButton;
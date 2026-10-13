import QuestionFlagButton from './QuestionFlagButton';

export const AddFlagButton = ({ questionId }: { questionId: string }) => {
  return <QuestionFlagButton questionId={questionId} />;
};

export default AddFlagButton;
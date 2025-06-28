import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/quiz-result.css';

const QuizResultDetails = ({ user }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchResultDetails = async () => {
      try {
        const res = await axios.get(`/api/results/${id}/details`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (res.data.success) {
          setResult(res.data.result);
        } else {
          setError(res.data.message || 'Failed to load result details');
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch result details');
        if (err.response?.status === 401) {
          navigate('/login');
        } else if (err.response?.status === 403) {
          navigate('/student');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResultDetails();
  }, [id, navigate]);

  if (loading) return <div className="loading">Loading quiz results...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!result) return <div className="error">No result data available</div>;

  return (
    <div className="quiz-result-container">
      <header className="quiz-result-header">
        <h1>Quiz Result: {result.quiz.title}</h1>
        <div className="user-info">
          <span>{user.name} ({user.rollNumber})</span>
          <button onClick={() => navigate('/student')}>Back to Dashboard</button>
        </div>
      </header>

      <div className="quiz-result-summary">
        <h2>Summary</h2>
        <p>Score: {result.score}</p>
        <p>Submitted at: {new Date(result.submittedAt).toLocaleString()}</p>
      </div>

      <div className="quiz-questions">
        <h2>Questions and Answers</h2>
        {result.quiz.questions.map((question, index) => (
          <div 
            key={index} 
            className={`question ${result.answers[index] === question.correctAnswer ? 'correct' : 'incorrect'}`}
          >
            <h3>Question {index + 1}: {question.questionText}</h3>
            {question.imageUrl && (
              <img src={question.imageUrl} alt="Question" className="question-image" />
            )}
            <div className="options">
              {question.options.map((option, optIndex) => (
                <div 
                  key={optIndex}
                  className={`option 
                    ${optIndex === question.correctAnswer ? 'correct-answer' : ''}
                    ${optIndex === result.answers[index] ? 'your-answer' : ''}
                  `}
                >
                  {option}
                </div>
              ))}
            </div>
            <p>Points: {question.points || 1}</p>
            <p>
              {result.answers[index] === question.correctAnswer 
                ? '✓ Correct' 
                : '✗ Incorrect'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuizResultDetails;
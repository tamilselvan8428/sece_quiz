import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/quiz.css';

const Quiz = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [warning, setWarning] = useState('');
  const [fullscreenError, setFullscreenError] = useState(false);
  const [imageLoadError, setImageLoadError] = useState({});
  const quizRef = useRef(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  // Enter fullscreen mode
  const enterFullscreen = () => {
    const element = quizRef.current;
    if (element) {
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => {
          console.error('Fullscreen error:', err);
          setFullscreenError(true);
        });
      } else if (element.webkitRequestFullscreen) { /* Safari */
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) { /* IE11 */
        element.msRequestFullscreen();
      }
    }
  };

  // Check fullscreen state
  const checkFullscreen = () => {
    if (!document.fullscreenElement && !submitted) {
      setWarning('Fullscreen mode is required! Returning to fullscreen...');
      enterFullscreen();
    }
  };

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const res = await axios.get(`/api/quizzes/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        const now = new Date();
        const startTime = new Date(res.data.quiz.startTime);
        const endTime = new Date(res.data.quiz.endTime);
        
        if (now < startTime) {
          navigate('/student', { state: { error: 'Quiz has not started yet' } });
          return;
        }

        if (now > endTime) {
          navigate('/student', { state: { error: 'Quiz has already ended' } });
          return;
        }

        const remainingTime = Math.min(
          res.data.quiz.duration * 60,
          Math.floor((endTime - now) / 1000)
        );

        setQuiz(res.data.quiz);
        setAnswers(new Array(res.data.quiz.questions.length).fill(null));
        setTimeLeft(remainingTime);
        
        // Initialize image error state
        const initialImageErrorState = {};
        res.data.quiz.questions.forEach((_, index) => {
          initialImageErrorState[index] = false;
        });
        setImageLoadError(initialImageErrorState);
        
        // Enter fullscreen mode
        enterFullscreen();
        
        // Set up event listeners
        document.addEventListener('fullscreenchange', checkFullscreen);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        
        return () => {
          document.removeEventListener('fullscreenchange', checkFullscreen);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('blur', handleWindowBlur);
        };
      } catch (err) {
        console.error('Error fetching quiz:', err);
        navigate('/student');
      }
    };
    
    fetchQuiz();
  }, [id, navigate]);

  useEffect(() => {
    if (timeLeft === null) return;

    if (timeLeft > 0 && !submitted) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !submitted) {
      handleSubmit();
    }
  }, [timeLeft, submitted]);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      setTabSwitchCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 2) { // Allow one warning, submit on second attempt
          handleSubmit();
          return newCount;
        }
        setWarning('Tab switching detected! Next time, the quiz will be submitted automatically.');
        setTimeout(() => setWarning(''), 5000);
        return newCount;
      });
    }
  };

  const handleWindowBlur = () => {
    if (!document.fullscreenElement && !submitted) {
      setWarning('Fullscreen mode is required! Returning to fullscreen...');
      enterFullscreen();
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = answerIndex;
    setAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    if (submitted) return;
    
    try {
      const res = await axios.post('/api/results', {
        quizId: id,
        answers
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setScore(res.data.result);
      setSubmitted(true);
      
      // Exit fullscreen after submission
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (err) {
      console.error('Error submitting quiz:', err);
      alert('Failed to submit quiz. Please try again.');
    }
  };

  const handleImageError = (questionIndex) => {
    setImageLoadError(prev => ({
      ...prev,
      [questionIndex]: true
    }));
  };

  const formatTime = (seconds) => {
    if (seconds === null) return 'Loading...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (fullscreenError) {
    return (
      <div className="fullscreen-error">
        <h2>Fullscreen Required</h2>
        <p>You must allow fullscreen mode to take this quiz.</p>
        <p>Please refresh the page and allow fullscreen when prompted.</p>
        <button onClick={() => window.location.reload()}>Refresh Page</button>
      </div>
    );
  }

  if (!quiz) {
    return <div className="quiz-loading">Loading quiz...</div>;
  }

  if (submitted) {
    return (
      <div className="quiz-result">
        <h2>Quiz Submitted!</h2>
        <p>Your score: {score.score}</p>
        <button onClick={() => navigate('/student')}>Back to Dashboard</button>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];

  return (
    <div className="quiz-container" ref={quizRef}>
      {warning && <div className="quiz-warning">{warning}</div>}
      
      <div className="quiz-header">
        <h2>{quiz.title}</h2>
        <div className="quiz-info">
          <div className="time-left">Time Left: {formatTime(timeLeft)}</div>
          <div className="question-count">
            Question {currentQuestion + 1} of {quiz.questions.length}
          </div>
        </div>
      </div>
      
      <div className="question-container">
        <h3 className="question-text">{question.questionText}</h3>
        
        {/* Enhanced image display with error handling */}
        {question.imageUrl && !imageLoadError[currentQuestion] && (
          <div className="question-image-container">
            <img 
              src={question.imageUrl} 
              alt="Question illustration" 
              className="question-image"
              onError={() => handleImageError(currentQuestion)}
            />
          </div>
        )}
        
        {question.imageUrl && imageLoadError[currentQuestion] && (
          <div className="image-error-message">
            Could not load image for this question.
          </div>
        )}
        
        <ul className="options-list">
          {question.options.map((option, index) => (
            <li key={index} className="option">
              <input
                type="radio"
                id={`option-${currentQuestion}-${index}`}
                name={`question-${currentQuestion}`}
                checked={answers[currentQuestion] === index}
                onChange={() => handleAnswerSelect(index)}
              />
              <label htmlFor={`option-${currentQuestion}-${index}`}>
                {option}
              </label>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="quiz-navigation">
        <button 
          onClick={handlePrevQuestion}
          disabled={currentQuestion === 0}
        >
          Previous
        </button>
        
        {currentQuestion < quiz.questions.length - 1 ? (
          <button onClick={handleNextQuestion}>Next</button>
        ) : (
          <button 
            onClick={handleSubmit}
            className="submit-btn"
          >
            Submit Quiz
          </button>
        )}
      </div>
      
      <div className="progress-indicator">
        {quiz.questions.map((_, index) => (
          <div 
            key={index}
            className={`progress-dot ${currentQuestion === index ? 'active' : ''} ${answers[index] !== null ? 'answered' : ''}`}
            onClick={() => setCurrentQuestion(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default Quiz;
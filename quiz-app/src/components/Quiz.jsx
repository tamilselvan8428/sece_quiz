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
    const [fullscreenError, setFullscreenError] = useState(false);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [loadingError, setLoadingError] = useState(null);
    const quizRef = useRef(null);

    // Configure axios with auth token
    useEffect(() => {
      const token = localStorage.getItem('token');
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        navigate('/login');
      }
    }, [navigate]);

    // Enter fullscreen mode
    const enterFullscreen = () => {
      const element = quizRef.current;
      if (element) {
        element.requestFullscreen().catch(err => {
          console.error('Fullscreen error:', err);
          setFullscreenError(true);
        });
      }
    };

    // Handle tab switching
    const handleTabSwitch = () => {
      const newCount = tabSwitchCount + 1;
      setTabSwitchCount(newCount);

      if (newCount === 1) {
        // First violation - show warning
        setFullscreenError(true);
      } else if (newCount >= 2) {
        // Second violation - submit quiz
        handleSubmit();
      }
    };

    // Event listeners setup
    useEffect(() => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && !submitted) {
          handleTabSwitch();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }, [submitted, tabSwitchCount]);

    // Initialize quiz
    useEffect(() => {
      const fetchQuiz = async () => {
        try {
          const res = await axios.get(`/api/quizzes/${id}`);
          setQuiz(res.data.quiz);
          setAnswers(new Array(res.data.quiz.questions.length).fill(null));
          setTimeLeft(res.data.quiz.duration * 60); // Convert minutes to seconds
          enterFullscreen();
        } catch (err) {
          console.error('Error fetching quiz:', err);
          if (err.response?.status === 401) {
            setLoadingError('Session expired. Please login again.');
            localStorage.removeItem('token');
            setTimeout(() => navigate('/login'), 2000);
          } else {
            setLoadingError('Failed to load quiz. Please try again.');
          }
        }
      };
      
      fetchQuiz();
    }, [id, navigate]);

    // Timer effect
    useEffect(() => {
      if (timeLeft === null || submitted) return;

      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }, [timeLeft, submitted]);

    // Handle answer selection
    const handleAnswerSelect = (answerIndex) => {
      const newAnswers = [...answers];
      newAnswers[currentQuestion] = answerIndex;
      setAnswers(newAnswers);
    };

    // Navigation functions
    const handleNextQuestion = () => {
      if (answers[currentQuestion] === null) {
        alert('Please select an answer before proceeding');
        return;
      }
      if (currentQuestion < quiz.questions.length - 1) {
        setCurrentQuestion(currentQuestion + 1);
      }
    };

    const handlePrevQuestion = () => {
      if (currentQuestion > 0) {
        setCurrentQuestion(currentQuestion - 1);
      }
    };

    // Handle quiz submission
    const handleSubmit = async () => {
      if (submitted) return;
      
      try {
        const res = await axios.post('/api/results', {
          quizId: id,
          answers,
          violations: tabSwitchCount
        });
        setScore(res.data.result);
        setSubmitted(true);
        document.exitFullscreen();
      } catch (err) {
        console.error('Error submitting quiz:', err);
        alert('Failed to submit quiz. Please try again.');
      }
    };

    // Format time display
    const formatTime = (seconds) => {
      if (seconds === null) return 'Loading...';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Render fullscreen error message
    if (fullscreenError) {
      return (
        <div className="fullscreen-error">
          <h2>Fullscreen Required</h2>
          <p>You must allow fullscreen mode to take this quiz.</p>
          {tabSwitchCount === 1 && (
            <p className="warning">Warning: Next violation will submit your quiz</p>
          )}
          <button onClick={() => {
            enterFullscreen();
            setFullscreenError(false);
          }}>
            Return to Fullscreen
          </button>
        </div>
      );
    }

    // Render loading/error states
    if (loadingError) {
      return (
        <div className="quiz-loading-error">
          <p>{loadingError}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      );
    }

    if (!quiz) {
      return <div className="quiz-loading">Loading quiz...</div>;
    }

    if (submitted) {
      return (
        <div className="quiz-result">
          <h2>Quiz {tabSwitchCount > 1 ? 'Submitted Due to Violation' : 'Completed'}</h2>
          <p>Your score: {score?.score}</p>
          {tabSwitchCount > 0 && (
            <p className="warning-text">Note: {tabSwitchCount} violation(s) detected</p>
          )}
          <button onClick={() => navigate('/')}>Finish</button>
        </div>
      );
    }

    // Main quiz render
    const question = quiz.questions[currentQuestion];
    const hasImage = question.image || question.imageUrl;

    return (
      <div className="quiz-container" ref={quizRef}>
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
{hasImage && (
  <div className="question-image-container">
    <img 
      src={`/api/quizzes/${id}/questions/${question._id}/image`}
      alt="Question illustration"
      className="question-image"
      onLoad={() => console.log('Image loaded successfully')}
      onError={(e) => {
        console.error('Image failed to load');
        e.target.style.display = 'none';
        const fallback = e.target.parentNode.querySelector('.image-fallback');
        if (fallback) {
          fallback.style.display = 'block';
        }
      }}
    />
    <div className="image-fallback" style={{display: 'none'}}>
      Image could not be loaded
    </div>
    <div className="image-loading">Loading image...</div>
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
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/quiz.css';

const Quiz = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timer, setTimer] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
  const visibilityChangeRef = useRef(null);
  const [imageLoadError, setImageLoadError] = useState({});
  
  const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050';

  const handleVisibilityChange = () => {
    if (document.hidden) {
      const newCount = tabSwitchCount + 1;
      setTabSwitchCount(newCount);
      
      if (newCount === 1) {
        setShowTabSwitchWarning(true);
        setTimeout(() => setShowTabSwitchWarning(false), 5000);
      } else if (newCount >= 2) {
        submitQuiz();
      }
    }
  };

  useEffect(() => {
    visibilityChangeRef.current = () => handleVisibilityChange();
    
    const eventName = document.addEventListener 
      ? 'visibilitychange' 
      : 'webkitvisibilitychange';
    
    document.addEventListener(eventName, visibilityChangeRef.current);
    
    return () => {
      if (visibilityChangeRef.current) {
        document.removeEventListener(eventName, visibilityChangeRef.current);
      }
    };
  }, [tabSwitchCount]);

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        setLoading(true);
        setError('');
        
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await axios.get(`${baseURL}/api/quizzes/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.data?.quiz) {
          throw new Error('Invalid quiz data received');
        }

        const quizData = response.data.quiz;
        
        // Debug: Log the quiz data structure
        console.log('Quiz data:', quizData);
        if (quizData.questions && quizData.questions[0]?.image) {
          console.log('First question image data:', quizData.questions[0].image);
        }

        if (quizData.endTime) {
          const endTime = new Date(quizData.endTime).getTime();
          const now = new Date().getTime();
          const remaining = Math.max(0, endTime - now);
          setTimeRemaining(remaining);
          
          if (remaining > 0) {
            const timerId = setInterval(() => {
              setTimeRemaining(prev => {
                if (prev <= 1000) {
                  clearInterval(timerId);
                  submitQuiz();
                  return 0;
                }
                return prev - 1000;
              });
            }, 1000);
            setTimer(timerId);
          }
        }

        setQuiz(quizData);
        setAnswers(new Array(quizData.questions.length).fill(null));
        enterFullscreen();
      } catch (err) {
        console.error('Error fetching quiz:', err);
        
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
          setError('Session expired. Please login again.');
        } else if (err.response?.status === 404) {
          setError('Quiz not found');
        } else {
          setError(err.response?.data?.message || err.message || 'Failed to load quiz');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      exitFullscreen();
    };
  }, [id, navigate]); 

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  const enterFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    }
    setIsFullscreen(true);
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
    setIsFullscreen(false);
  };

  const submitQuiz = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.post(`${baseURL}/api/results`, {
        quizId: id,
        answers
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      setSubmittedResult({
        score: response.data.result?.score || 0,
        total: quiz.questions.reduce((total, q) => total + (q.points || 1), 0)
      });
      
      if (visibilityChangeRef.current) {
        const eventName = document.addEventListener 
          ? 'visibilitychange' 
          : 'webkitvisibilitychange';
        document.removeEventListener(eventName, visibilityChangeRef.current);
      }

      setTimeout(() => {
        navigate('/');
        exitFullscreen();
      }, 5000);
    } catch (err) {
      console.error('Error submitting quiz:', err);
      setError(err.response?.data?.message || err.message || 'Failed to submit quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionIndex, optionIndex) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const formatTime = (milliseconds) => {
    if (!milliseconds) return null;
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading && !submittedResult) {
    return (
      <div className="quiz-loading">
        <div className="spinner"></div>
        <p>Loading quiz...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="quiz-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="quiz-not-found">
        <h2>Quiz Not Found</h2>
        <p>The requested quiz could not be loaded.</p>
      </div>
    );
  }

  if (submittedResult) {
    return (
      <div className="quiz-result-container">
        <div className="quiz-result-card">
          <h1>Quiz Submitted Successfully!</h1>
          <div className="score-display">
            Your Score: <span className="score-value">{submittedResult.score}</span>
          </div>
          <div className="max-score">
            Out of: {submittedResult.total}
          </div>
          <p className="redirect-message">You will be redirected to the home page shortly...</p>
        </div>
      </div>
    );
  }

  const currentQuestionData = quiz.questions[currentQuestion];

  return (
    <div className={`quiz-container ${isFullscreen ? 'fullscreen-active' : ''}`}>
      {showTabSwitchWarning && (
        <div className="tab-switch-warning">
          <p>⚠️ Warning: You switched tabs. Please stay on this page during the quiz.</p>
          <p>Next tab switch will automatically submit your quiz.</p>
        </div>
      )}
      
      <div className="quiz-header">
        <h1>{quiz.title}</h1>
        {timeRemaining !== null && (
          <div className="quiz-timer">
            Time Remaining: {formatTime(timeRemaining)}
            {timeRemaining <= 60000 && (
              <span className="time-warning"> (Hurry!)</span>
            )}
          </div>
        )}
      </div>

      <div className="quiz-progress">
        Question {currentQuestion + 1} of {quiz.questions.length}
      </div>

      <div className="question-container">
        <h2 className="question-text">{currentQuestionData.questionText}</h2>

{currentQuestionData.image?.data && !imageLoadError[currentQuestion]&& (
  <div className="question-image-container">
    <img 
      src={`data:${currentQuestionData.image.contentType};base64,${currentQuestionData.image.data}`}
      alt="Question illustration"
      className="question-image"
      onLoad={() => setImageLoadError(prev => ({ ...prev, [currentQuestion]: false }))}
      onError={() => setImageLoadError(prev => ({ ...prev, [currentQuestion]: true }))}
    />
  </div>
)}
        
        {imageLoadError[currentQuestion] && (
          <div className="image-error">
            Image could not be loaded
          </div>
        )}

        <ul className="options-list">
          {currentQuestionData.options.map((option, index) => (
            <li 
              key={index} 
              className={`option ${answers[currentQuestion] === index ? 'selected' : ''}`}
            >
              <input
                type="radio"
                id={`option-${currentQuestion}-${index}`}
                name={`question-${currentQuestion}`}
                checked={answers[currentQuestion] === index}
                onChange={() => handleOptionSelect(currentQuestion, index)}
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
          onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
          disabled={currentQuestion === 0}
          className="nav-button prev-button"
        >
          Previous
        </button>
        
        {currentQuestion === quiz.questions.length - 1 ? (
          <button
            onClick={submitQuiz}
            disabled={loading}
            className="nav-button submit-button"
          >
            {loading ? 'Submitting...' : 'Submit Quiz'}
          </button>
        ) : (
          <button
            onClick={() => setCurrentQuestion(prev => Math.min(quiz.questions.length - 1, prev + 1))}
            className="nav-button next-button"
          >
            Next
          </button>
        )}
      </div>

      {error && (
        <div className="quiz-error-message">
          {error}
        </div>
      )}

      {!isFullscreen && (
        <div className="fullscreen-prompt">
          <p>Please enter fullscreen mode for the best quiz experience</p>
          <button onClick={enterFullscreen}>Enter Fullscreen</button>
        </div>
      )}
    </div>
  );
};

export default Quiz;
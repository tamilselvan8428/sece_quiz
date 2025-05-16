import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/staff.css';

const StaffDashboard = ({ user, logout }) => {
  const [quizzes, setQuizzes] = useState([]);
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [questions, setQuestions] = useState([{ 
    questionText: '', 
    options: ['', '', '', ''], 
    correctAnswer: 0, 
    points: 1,
    image: null,
    imagePreview: ''
  }]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found');
        return;
      }

      const baseURL = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:5000' 
        : '';
        
      const response = await axios.get(`${baseURL}/api/quizzes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data?.success) {
        setQuizzes(response.data.quizzes);
      } else {
        console.error('Unexpected response format:', response.data);
      }
    } catch (error) {
      console.error('Error fetching quizzes:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
    }
  };

  const fetchResults = async (quizId) => {
    try {
      const res = await axios.get(`/api/quizzes/${quizId}/results`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setResults(res.data.results);
      setSelectedQuiz(quizzes.find(q => q._id === quizId));
    } catch (err) {
      console.error('Error fetching results:', err);
    }
  };

  const handleAddQuestion = () => {
    setQuestions([...questions, { 
      questionText: '', 
      options: ['', '', '', ''], 
      correctAnswer: 0, 
      points: 1,
      image: null,
      imagePreview: ''
    }]);
  };

  const handleRemoveQuestion = (index) => {
    if (questions.length > 1) {
      const newQuestions = [...questions];
      newQuestions.splice(index, 1);
      setQuestions(newQuestions);
    }
  };

  const handleQuestionChange = (index, field, value) => {
    const newQuestions = [...questions];
    newQuestions[index][field] = value;
    setQuestions(newQuestions);
  };

  const handleOptionChange = (qIndex, oIndex, value) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options[oIndex] = value;
    setQuestions(newQuestions);
  };

  const handleImageUpload = (e, qIndex) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newQuestions = [...questions];
        newQuestions[qIndex].image = file;
        newQuestions[qIndex].imagePreview = reader.result;
        setQuestions(newQuestions);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (qIndex) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].image = null;
    newQuestions[qIndex].imagePreview = '';
    setQuestions(newQuestions);
  };

  const handleSubmitQuiz = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', quizTitle);
      formData.append('description', quizDescription);
      formData.append('startTime', startTime);
      formData.append('endTime', endTime);
      formData.append('duration', duration);
      formData.append('department', department);
      formData.append('batch', batch);

      // Add questions data
      const questionsData = questions.map(q => ({
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points
      }));
      formData.append('questions', JSON.stringify(questionsData));

      // Add image files if they exist
      questions.forEach((q, index) => {
        if (q.image) {
          formData.append(`questionImages`, q.image);
        }
      });

      await axios.post('/api/quizzes', formData, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setShowQuizForm(false);
      resetForm();
      fetchQuizzes();
    } catch (err) {
      console.error('Error creating quiz:', err);
    }
  };

  const resetForm = () => {
    setQuizTitle('');
    setQuizDescription('');
    setQuestions([{ 
      questionText: '', 
      options: ['', '', '', ''], 
      correctAnswer: 0, 
      points: 1,
      image: null,
      imagePreview: ''
    }]);
    setStartTime('');
    setEndTime('');
    setDuration(30);
    setDepartment('');
    setBatch('');
  };

  const exportResults = async (quizId) => {
    try {
      const response = await axios.get(`/api/quizzes/${quizId}/results/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quiz_results_${quizId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error exporting results:', err);
    }
  };

  return (
    <div className="staff-container">
      <header className="staff-header">
        <h1>Staff Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="staff-content">
        <div className="quiz-management">
          <h2>Quiz Management</h2>
          <button onClick={() => setShowQuizForm(true)}>Create New Quiz</button>
          
          {quizzes.length > 0 ? (
            <table className="quiz-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map(quiz => (
                  <tr key={quiz._id}>
                    <td>{quiz.title}</td>
                    <td>{new Date(quiz.startTime).toLocaleString()}</td>
                    <td>{new Date(quiz.endTime).toLocaleString()}</td>
                    <td>{quiz.duration} mins</td>
                    <td>
                      <button onClick={() => fetchResults(quiz._id)}>View Results</button>
                      <button onClick={() => exportResults(quiz._id)}>Export Results</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No quizzes created yet</p>
          )}
        </div>

        {showQuizForm && (
          <div className="quiz-form-overlay">
            <div className="quiz-form">
              <h2>Create New Quiz</h2>
              <form onSubmit={handleSubmitQuiz}>
                <div className="form-group">
                  <label>Quiz Title</label>
                  <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={quizDescription}
                    onChange={(e) => setQuizDescription(e.target.value)}
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>End Time</label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Duration (minutes)</label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      min="1"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Department (optional)</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Batch (optional)</label>
                    <input
                      type="text"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                    />
                  </div>
                </div>
                
                <h3>Questions</h3>
                {questions.map((q, qIndex) => (
                  <div key={qIndex} className="question-group">
                    <div className="form-group">
                      <label>Question {qIndex + 1}</label>
                      <input
                        type="text"
                        value={q.questionText}
                        onChange={(e) => handleQuestionChange(qIndex, 'questionText', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label>Points</label>
                      <input
                        type="number"
                        value={q.points}
                        onChange={(e) => handleQuestionChange(qIndex, 'points', parseInt(e.target.value))}
                        min="1"
                        required
                      />
                    </div>
                    
                    <div className="options-group">
                      {q.options.map((option, oIndex) => (
                        <div key={oIndex} className="option-row">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                            required
                            placeholder={`Option ${oIndex + 1}`}
                          />
                          <label>
                            <input
                              type="radio"
                              name={`correctAnswer-${qIndex}`}
                              checked={q.correctAnswer === oIndex}
                              onChange={() => handleQuestionChange(qIndex, 'correctAnswer', oIndex)}
                            />
                            Correct
                          </label>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIndex)}
                      className="remove-btn"
                    >
                      Remove Question
                    </button>
                  </div>
                ))}
                
                <button type="button" onClick={handleAddQuestion} className="add-btn">
                  Add Question
                </button>
                
                <div className="form-actions">
                  <button type="button" onClick={() => {
                    setShowQuizForm(false);
                    resetForm();
                  }}>
                    Cancel
                  </button>
                  <button type="submit">Create Quiz</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedQuiz && (
          <div className="results-overlay">
            <div className="results-container">
              <h2>Results for {selectedQuiz.title}</h2>
              <button onClick={() => setSelectedQuiz(null)} className="close-btn">×</button>
              
              {results.length > 0 ? (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll Number</th>
                      <th>Score</th>
                      <th>Submitted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(result => (
                      <tr key={result._id}>
                        <td>{result.user?.name || 'Unknown'}</td>
                        <td>{result.user?.rollNumber || 'N/A'}</td>
                        <td>{result.score}</td>
                        <td>{new Date(result.submittedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No results available for this quiz</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffDashboard;
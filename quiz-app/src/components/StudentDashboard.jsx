import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/student.css';

const StudentDashboard = ({ user, logout }) => {
  const [availableQuizzes, setAvailableQuizzes] = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAvailableQuizzes();
    fetchPastResults();
  }, []);
const fetchAvailableQuizzes = async () => {
  try {
    const res = await axios.get('/api/quizzes/available', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    
    console.log('Available quizzes response:', {
      data: res.data,
      user: user
    });
    
    setAvailableQuizzes(res.data.quizzes || []);
  } catch (err) {
    console.error('Error fetching available quizzes:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    setAvailableQuizzes([]);
  }
};
  const fetchPastResults = async () => {
    try {
      const res = await axios.get('/api/results', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPastResults(res.data.results);
    } catch (err) {
      console.error('Error fetching past results:', err);
    }
  };

  const startQuiz = (quizId) => {
    navigate(`/quiz/${quizId}`);
  };

  return (
    <div className="student-container">
      <header className="student-header">
        <h1>Student Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user.name} ({user.rollNumber})</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="student-content">
        <div className="quizzes-section">
          <h2>Available Quizzes</h2>
          {availableQuizzes.length > 0 ? (
            <table className="quiz-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Available Until</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {availableQuizzes.map(quiz => (
                  <tr key={quiz._id}>
                    <td>{quiz.title}</td>
                    <td>{new Date(quiz.endTime).toLocaleString()}</td>
                    <td>{quiz.duration} mins</td>
                    <td>
                      <button onClick={() => startQuiz(quiz._id)}>Start Quiz</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No quizzes available at the moment</p>
          )}
        </div>

        <div className="results-section">
          <h2>Your Past Results</h2>
          {pastResults.length > 0 ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Score</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {pastResults.map(result => (
                  <tr key={result._id}>
                    <td>{result.quiz?.title || 'Unknown Quiz'}</td>
                    <td>{result.score}</td>
                    <td>{new Date(result.submittedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No quiz results yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
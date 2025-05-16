import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Login from './components/Login'
import Register from './components/Register'
import AdminPanel from './components/AdminPanel'
import StaffDashboard from './components/StaffDashboard'
import StudentDashboard from './components/StudentDashboard'
import Quiz from './components/Quiz'
import './App.css'

// Set axios base URL
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

function App() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

useEffect(() => {
    const validateToken = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const res = await axios.get('/api/validate', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setUser(res.data.user);
            } catch (err) {
                localStorage.removeItem('token');
                setUser(null);
            }
        }
    };
    validateToken();
}, []);
  const login = async (rollNumber, password) => {
    try {
      const res = await axios.post('/api/login', { rollNumber, password })
      localStorage.setItem('token', res.data.token)
      setUser(res.data.user)
      return { success: true, user: res.data.user }
    } catch (err) {
      return { 
        success: false, 
        message: err.response?.data?.message || err.message || 'Login failed' 
      }
    }
  }

  const register = async (userData) => {
    try {
      const response = await axios.post('/api/register', userData, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      return { 
        success: true, 
        message: response.data.message || 'Registration successful' 
      }
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || 'Registration failed'
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={!user ? <Login login={login} /> : <Navigate to={`/${user.role}`} />} />
        <Route path="/register" element={!user ? <Register register={register} /> : <Navigate to={`/${user.role}`} />} />
        <Route path="/admin" element={user?.role === 'admin' ? <AdminPanel user={user} logout={logout} /> : <Navigate to="/login" />} />
        <Route path="/staff" element={user?.role === 'staff' ? <StaffDashboard user={user} logout={logout} /> : <Navigate to="/login" />} />
        <Route path="/student" element={user?.role === 'student' ? <StudentDashboard user={user} logout={logout} /> : <Navigate to="/login" />} />
        <Route path="/quiz/:id" element={user?.role === 'student' ? <Quiz user={user} /> : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to={user ? `/${user.role}` : '/login'} />} />
      </Routes>
    </div>
  )
}

export default App
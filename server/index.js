    require('dotenv').config();
    const express = require('express');
    const mongoose = require('mongoose');
    const cors = require('cors');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const ExcelJS = require('exceljs');
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');

    const app = express();

    // Enhanced CORS configuration
    app.use(cors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        credentials: true,
        preflightContinue: false,
        optionsSuccessStatus: 204
    }));

    // Add OPTIONS handler
    app.options('*', cors());

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Database Connection with enhanced logging
    mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quizapp', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    })
    .then(async () => {
        console.log('Connected to MongoDB');
        await rebuildIndexes();
        await createDefaultAdmin();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

    // Connection event listeners
    mongoose.connection.on('connected', () => console.log('MongoDB connected'));
    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));

    // Configure storage for uploaded images
    const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
    });

    const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (mimetype && extname) {
        return cb(null, true);
        } else {
        cb(new Error('Error: Images only!'));
        }
    }
    });

    // Serve static files
    app.use('/uploads', express.static('uploads'));
    // Models
    const UserSchema = new mongoose.Schema({
        name: String,
        rollNumber: { type: String, unique: true },
        password: String,
        role: { type: String, enum: ['student', 'staff', 'admin'], default: 'student' },
        department: String,
        section: String,
        batch: String,
        isApproved: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    });

    const DeletedUserSchema = new mongoose.Schema({
        name: String,
        rollNumber: String,
        role: String,
        department: String,
        section: String,
        batch: String,
        deletedAt: { type: Date, default: Date.now }
    });

const QuizSchema = new mongoose.Schema({
  title: String,
  description: String,
  questions: [{
    questionText: String,
    image: {
      data: Buffer,
      contentType: String
    },
    options: [String],
    correctAnswer: Number,
    points: Number
  }],
  startTime: Date,
  endTime: Date,
  duration: Number,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  department: String,
  batch: String,
  createdAt: { type: Date, default: Date.now }
});

    const QuizResultSchema = new mongoose.Schema({
        quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        answers: [Number],
        score: Number,
        submittedAt: { type: Date, default: Date.now }
    });

    const User = mongoose.model('User', UserSchema);
    const DeletedUser = mongoose.model('DeletedUser', DeletedUserSchema);
    const Quiz = mongoose.model('Quiz', QuizSchema);
    const QuizResult = mongoose.model('QuizResult', QuizResultSchema);

    // Index Management
    async function rebuildIndexes() {
        try {
            await User.syncIndexes();
            await DeletedUser.syncIndexes();
            await Quiz.syncIndexes();
            await QuizResult.syncIndexes();
            console.log('All indexes rebuilt successfully');
        } catch (err) {
            console.error('Error rebuilding indexes:', err);
        }
    }

    // Default Admin Creation
    async function createDefaultAdmin() {
        try {
            const defaultAdmin = {
                name: "System Administrator",
                rollNumber: "admin",
                password: "admin123",
                role: "admin",
                department: "Administration",
                isApproved: true
            };

            const existingAdmin = await User.findOne({ rollNumber: defaultAdmin.rollNumber });
            if (!existingAdmin) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(defaultAdmin.password, salt);
                
                await User.create({
                    ...defaultAdmin,
                    password: hashedPassword
                });
                
                console.log('\n=== DEFAULT ADMIN ACCOUNT ===');
                console.log(`Username: ${defaultAdmin.rollNumber}`);
                console.log(`Password: ${defaultAdmin.password}`);
                console.log('============================\n');
            }
        } catch (err) {
            console.error('Error creating default admin:', err);
        }
    }

    // Authentication Middleware
    const authenticate = (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET || 'quizappsecret');
            req.user = verified;
            next();
        } catch (err) {
            res.status(400).json({ success: false, message: 'Invalid token' });
        }
    };

    const authorize = (roles) => {
        return (req, res, next) => {
            if (!roles.includes(req.user.role)) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Forbidden. Insufficient permissions.' 
                });
            }
            next();
        };
    };

    // Routes
    app.get('/api/health', (req, res) => {
        res.json({ 
            status: 'OK', 
            db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString()
        });
    });

    // User Management Routes
    app.get('/api/users/pending', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { role, department, section, batch, search } = req.query;
            
            const query = { isApproved: false };
            
            if (role) query.role = role;
            if (department) query.department = new RegExp(department, 'i');
            if (section) query.section = new RegExp(section, 'i');
            if (batch) query.batch = new RegExp(batch, 'i');
            if (search) {
                query.$or = [
                    { name: new RegExp(search, 'i') },
                    { rollNumber: new RegExp(search, 'i') }
                ];
            }

            const users = await User.find(query);
            res.json({ success: true, users });
        } catch (err) {
            console.error('Error in /api/users/pending:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while fetching pending users',
                error: err.message 
            });
        }
    });

    app.get('/api/users', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { role, department, section, batch, search } = req.query;
            
            const query = { isApproved: true };
            
            if (role) query.role = role;
            if (department) query.department = new RegExp(department, 'i');
            if (section) query.section = new RegExp(section, 'i');
            if (batch) query.batch = new RegExp(batch, 'i');
            if (search) {
                query.$or = [
                    { name: new RegExp(search, 'i') },
                    { rollNumber: new RegExp(search, 'i') }
                ];
            }

            const users = await User.find(query).select('-password');
            res.json({ success: true, users });
        } catch (err) {
            console.error('Error in /api/users:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while fetching active users',
                error: err.message 
            });
        }
    });

    app.get('/api/deleted-users', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { role, department, section, batch, search } = req.query;
            
            const query = {};
            
            if (role) query.role = role;
            if (department) query.department = new RegExp(department, 'i');
            if (section) query.section = new RegExp(section, 'i');
            if (batch) query.batch = new RegExp(batch, 'i');
            if (search) {
                query.$or = [
                    { name: new RegExp(search, 'i') },
                    { rollNumber: new RegExp(search, 'i') }
                ];
            }

            const deletedUsers = await DeletedUser.find(query).sort({ deletedAt: -1 });
            res.json({ success: true, deletedUsers });
        } catch (err) {
            console.error('Error in /api/deleted-users:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while fetching deleted users',
                error: err.message 
            });
        }
    });

    app.post('/api/users/approve', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { userIds } = req.body;
            if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid user IDs provided' 
                });
            }

            const result = await User.updateMany(
                { _id: { $in: userIds } },
                { $set: { isApproved: true } }
            );

            if (result.modifiedCount === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No users found to approve' 
                });
            }

            res.json({ 
                success: true, 
                message: `${result.modifiedCount} user(s) approved successfully` 
            });
        } catch (err) {
            console.error('Error in /api/users/approve:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while approving users',
                error: err.message 
            });
        }
    });

    app.delete('/api/users/:id', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const userId = req.params.id;
            
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid user ID format' 
                });
            }

            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            // Create deleted user record
            await DeletedUser.create({
                name: user.name,
                rollNumber: user.rollNumber,
                role: user.role,
                department: user.department,
                section: user.section,
                batch: user.batch
            });

            // Delete the user
            await User.findByIdAndDelete(userId);
            
            res.json({ 
                success: true, 
                message: 'User deleted successfully',
                deletedUser: {
                    name: user.name,
                    rollNumber: user.rollNumber
                }
            });
        } catch (err) {
            console.error('Error in DELETE /api/users/:id:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while deleting user',
                error: err.message 
            });
        }
    });

    app.delete('/api/users/permanent/:id', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const userId = req.params.id;
            
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid user ID format' 
                });
            }

            const result = await DeletedUser.findByIdAndDelete(userId);
            
            if (!result) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Deleted user record not found' 
                });
            }

            res.json({ 
                success: true, 
                message: 'User permanently deleted',
                deletedUser: {
                    name: result.name,
                    rollNumber: result.rollNumber
                }
            });
        } catch (err) {
            console.error('Error in DELETE /api/users/permanent/:id:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while permanently deleting user',
                error: err.message 
            });
        }
    });

    app.post('/api/users/restore/:id', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const userId = req.params.id;
            
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid user ID format' 
                });
            }

            const deletedUser = await DeletedUser.findById(userId);
            if (!deletedUser) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Deleted user record not found' 
                });
            }

            const existingUser = await User.findOne({ rollNumber: deletedUser.rollNumber });
            if (existingUser) {
                return res.status(409).json({ 
                    success: false, 
                    message: 'User with this roll number already exists' 
                });
            }

            const restoredUser = new User({
                name: deletedUser.name,
                rollNumber: deletedUser.rollNumber,
                role: deletedUser.role,
                department: deletedUser.department,
                section: deletedUser.section,
                batch: deletedUser.batch,
                isApproved: true,
                password: await bcrypt.hash(`restored-${Date.now()}`, 10)
            });

            await restoredUser.save();
            await DeletedUser.findByIdAndDelete(userId);

            res.json({ 
                success: true, 
                message: 'User restored successfully',
                user: {
                    id: restoredUser._id,
                    name: restoredUser.name,
                    rollNumber: restoredUser.rollNumber
                }
            });
        } catch (err) {
            console.error('Error in POST /api/users/restore/:id:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Server error while restoring user',
                error: err.message 
            });
        }
    });

    // Auth Routes
    app.post('/api/register', async (req, res) => {
        try {
            const { name, rollNumber, password, role, department, section, batch } = req.body;
            
            if (!name || !rollNumber || !password || !department) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Missing required fields: name, rollNumber, password, department' 
                });
            }

            if (role === 'student' && !batch) {
                return res.status(400).json({
                    success: false,
                    message: 'Batch is required for students'
                });
            }

            const existingUser = await User.findOne({ rollNumber });
            if (existingUser) {
                return res.status(409).json({ 
                    success: false,
                    message: 'User already exists with this roll number' 
                });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const user = new User({
                name,
                rollNumber,
                password: hashedPassword,
                role: role || 'student',
                department,
                section,
                batch,
                isApproved: role === 'admin'
            });

            await user.save();
            
            res.status(201).json({ 
                success: true,
                message: 'User registered successfully. ' + 
                        (role === 'admin' ? 'Admin account created.' : 'Waiting for admin approval.'),
                user: {
                    id: user._id,
                    name: user.name,
                    rollNumber: user.rollNumber,
                    role: user.role
                }
            });
        } catch (err) {
            console.error('Error in /api/register:', err);
            res.status(500).json({ 
                success: false,
                message: 'Registration failed',
                error: err.message 
            });
        }
    });

    app.post('/api/login', async (req, res) => {
        try {
            const { rollNumber, password } = req.body;
            
            if (!rollNumber || !password) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Roll number and password are required' 
                });
            }

            const user = await User.findOne({ rollNumber });
            
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }

            if (!user.isApproved) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Account pending admin approval' 
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }

            const token = jwt.sign(
                { 
                    _id: user._id, 
                    role: user.role, 
                    name: user.name,
                    department: user.department,
                    batch: user.batch
                },
                process.env.JWT_SECRET || 'quizappsecret',
                { expiresIn: '1h' }
            );

            res.json({
                success: true,
                token,
                user: {
                    _id: user._id,
                    name: user.name,
                    role: user.role,
                    department: user.department,
                    section: user.section,
                    batch: user.batch
                }
            });
        } catch (err) {
            console.error('Error in /api/login:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Login failed',
                error: err.message 
            });
        }
    });

    app.get('/api/validate', authenticate, (req, res) => {
        res.json({
            success: true,
            user: {
                _id: req.user._id,
                name: req.user.name,
                role: req.user.role,
                department: req.user.department,
                batch: req.user.batch
            }
        });
    });

    // Quiz Routes with Image Support
app.post('/api/quizzes', 
  authenticate, 
  authorize(['staff', 'admin']), 
  upload.array('questionImages'), 
  async (req, res) => {
    try {
      const { title, description, questions, startTime, endTime, duration, department, batch } = req.body;
      
      let parsedQuestions = JSON.parse(questions);
      
      const processedQuestions = await Promise.all(parsedQuestions.map(async (q, index) => {
        const questionData = {
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points
        };
        
        if (req.files && req.files[index]) {
          const file = req.files[index];
          questionData.image = {
            data: fs.readFileSync(file.path),
            contentType: file.mimetype
          };
          // Clean up the uploaded file
          fs.unlinkSync(file.path);
        }
        
        return questionData;
      }));

      const quiz = new Quiz({
        title,
        description,
        questions: processedQuestions,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        duration,
        createdBy: req.user._id,
        department,
        batch
      });

      await quiz.save();
      
      res.status(201).json({
        success: true,
        message: 'Quiz created successfully',
        quiz
      });
    } catch (err) {
      console.error('Error creating quiz:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to create quiz',
        error: err.message
      });
    }
  }
);

    app.get('/api/quizzes', authenticate, authorize(['staff', 'admin']), async (req, res) => {
    try {
        const query = req.user.role === 'admin' 
        ? {} 
        : { createdBy: req.user._id };

        const quizzes = await Quiz.find(query)
        .sort({ createdAt: -1 })
        .populate('createdBy', 'name');

        res.json({ 
        success: true,
        quizzes 
        });
    } catch (err) {
        console.error('Error fetching quizzes:', err);
        res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch quizzes',
        error: err.message 
        });
    }
    });
app.get('/api/quizzes/:quizId/questions/:questionId/image', async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).send('Quiz not found');

    const question = quiz.questions.id(req.params.questionId);
    if (!question || !question.image || !question.image.data) {
      return res.status(404).send('Image not found');
    }

    res.set('Content-Type', question.image.contentType);
    res.send(question.image.data);
  } catch (err) {
    console.error('Error fetching question image:', err);
    res.status(500).send('Failed to fetch image');
  }
});
    app.get('/api/quizzes/available', authenticate, authorize(['student']), async (req, res) => {
    try {
        const now = new Date();
        
        const quizzes = await Quiz.find({
        startTime: { $lte: now },
        endTime: { $gte: now }
        }).populate('createdBy', 'name');

        const results = await QuizResult.find({ user: req.user._id });
        const takenQuizIds = results.map(r => r.quiz.toString());
        
        const availableQuizzes = quizzes.filter(q => 
        !takenQuizIds.includes(q._id.toString())
        );

        res.json({ 
        success: true, 
        quizzes: availableQuizzes,
        serverTime: now
        });
    } catch (err) {
        console.error('Error fetching available quizzes:', err);
        res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch available quizzes',
        error: err.message 
        });
    }
    });

    app.get('/api/quizzes/:id', authenticate, async (req, res) => {
        try {
            const quiz = await Quiz.findById(req.params.id).populate('createdBy', 'name');
            if (!quiz) return res.status(404).json({ 
                success: false, 
                message: 'Quiz not found' 
            });

            if (req.user.role === 'student') {
                const quizForStudent = {
                    ...quiz.toObject(),
                    questions: quiz.questions.map(q => ({
                        questionText: q.questionText,
                        image: q.image,
                        options: q.options,
                        points: q.points
                    }))
                };
                return res.json({ success: true, quiz: quizForStudent });
            }

            res.json({ success: true, quiz });
        } catch (err) {
            console.error('Error fetching quiz:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch quiz',
                error: err.message 
            });
        }
    });

    // Quiz Results Routes
    app.post('/api/results', authenticate, authorize(['student']), async (req, res) => {
        try {
            const { quizId, answers } = req.body;
            const now = new Date();
            
            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Quiz not found' 
                });
            }

            if (now < new Date(quiz.startTime)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Quiz has not started yet' 
                });
            }

            if (now > new Date(quiz.endTime)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Quiz has already ended' 
                });
            }

            const existingResult = await QuizResult.findOne({ 
                quiz: quizId, 
                user: req.user._id 
            });
            
            if (existingResult) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'You have already taken this quiz' 
                });
            }

            let score = 0;
            quiz.questions.forEach((q, i) => {
                if (answers[i] === q.correctAnswer) {
                    score += q.points || 1;
                }
            });

            const result = new QuizResult({
                quiz: quizId,
                user: req.user._id,
                answers,
                score
            });

            await result.save();
            res.json({ success: true, result });
        } catch (err) {
            console.error('Error submitting quiz:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to submit quiz',
                error: err.message 
            });
        }
    });

    app.get('/api/results', authenticate, async (req, res) => {
        try {
            let results;
            if (req.user.role === 'student') {
                results = await QuizResult.find({ user: req.user._id })
                    .populate('quiz', 'title');
            } else {
                results = await QuizResult.find({ quiz: { $in: await Quiz.find({ createdBy: req.user._id }).distinct('_id') } })
                    .populate('quiz', 'title')
                    .populate('user', 'name rollNumber');
            }
            res.json({ success: true, results });
        } catch (err) {
            console.error('Error fetching results:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch results',
                error: err.message 
            });
        }
    });

    app.get('/api/quizzes/:id/results/export', authenticate, authorize(['staff', 'admin']), async (req, res) => {
        try {
            const quiz = await Quiz.findById(req.params.id);
            if (!quiz) return res.status(404).json({ 
                success: false, 
                message: 'Quiz not found' 
            });

            if (quiz.createdBy.toString() !== req.user._id && req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Not authorized' 
                });
            }

            const results = await QuizResult.find({ quiz: req.params.id })
                .populate('user', 'name rollNumber department batch section');

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Quiz Results');

            worksheet.columns = [
                { header: 'Roll Number', key: 'rollNumber', width: 15 },
                { header: 'Name', key: 'name', width: 20 },
                { header: 'Department', key: 'department', width: 15 },
                { header: 'Section', key: 'section', width: 10 },
                { header: 'Batch', key: 'batch', width: 10 },
                { header: 'Score', key: 'score', width: 10 },
                { header: 'Submitted At', key: 'submittedAt', width: 20 }
            ];

            results.forEach(result => {
                worksheet.addRow({
                    rollNumber: result.user.rollNumber,
                    name: result.user.name,
                    department: result.user.department,
                    section: result.user.section || 'N/A',
                    batch: result.user.batch,
                    score: result.score,
                    submittedAt: result.submittedAt.toLocaleString()
                });
            });

            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=quiz_results_${quiz.title.replace(/\s+/g, '_')}.xlsx`
            );

            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            console.error('Error exporting results:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to export results',
                error: err.message 
            });
        }
    });

    // Debug Routes
    app.get('/api/debug/time', (req, res) => {
    res.json({ 
        serverTime: new Date(),
        isoString: new Date().toISOString()
    });
    });

    app.get('/api/debug/quiz-times/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
        return res.status(404).json({ success: false, message: 'Quiz not found' });
        }
        
        res.json({
        success: true,
        quiz: {
            id: quiz._id,
            title: quiz.title,
            startTime: quiz.startTime,
            endTime: quiz.endTime,
            serverTime: new Date()
        }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
    });
    // Add this route with your other result routes
    // Get detailed quiz result (with correct answers)
    app.get('/api/results/:id/details', authenticate, authorize(['student']), async (req, res) => {
        try {
            const resultId = req.params.id;
            
            const result = await QuizResult.findById(resultId)
                .populate('quiz')
                .populate('user', 'name rollNumber');
            
            if (!result) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Result not found' 
                });
            }

            // Verify the requesting user owns this result
            if (result.user._id.toString() !== req.user._id) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Not authorized to view this result' 
                });
            }

            const quiz = await Quiz.findById(result.quiz._id);
            const now = new Date();
            
            // Only allow access after quiz end time
            if (now < quiz.endTime) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Quiz results are only available after the quiz has ended' 
                });
            }

            res.json({
                success: true,
                result: {
                    ...result.toObject(),
                    quiz: {
                        ...quiz.toObject(),
                        questions: quiz.questions.map(q => ({
                            questionText: q.questionText,
                            imageUrl: q.imageUrl,
                            options: q.options,
                            correctAnswer: q.correctAnswer,
                            points: q.points
                        }))
                    }
                }
            });
        } catch (err) {
            console.error('Error fetching result details:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch result details',
                error: err.message 
            });
        }
    });
    app.put('/api/users/profile', authenticate, async (req, res) => {
        console.log('=== PROFILE UPDATE REQUEST ===');
        console.log('User ID:', req.user._id);
        console.log('Request body:', req.body);
      
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
          const { name, department, section, batch, newPassword, rollNumber } = req.body;
          const userId = req.user._id;
      
          // Find user
          const user = await User.findById(userId).session(session);
          if (!user) {
            console.error('User not found:', userId);
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ 
              success: false, 
              message: 'User not found' 
            });
          }
          
          // Check if rollNumber is being changed and validate it
          if (rollNumber && rollNumber !== user.rollNumber) {
            // Check if new roll number already exists
            const existingUser = await User.findOne({ rollNumber }).session(session);
            if (existingUser) {
              await session.abortTransaction();
              session.endSession();
              return res.status(409).json({
                success: false,
                message: 'Roll number already in use',
                field: 'rollNumber'
              });
            }
            user.rollNumber = rollNumber;
          }
      
          // Update basic info
          if (name) user.name = name;
          if (department) user.department = department;
          
          // Only update section and batch for non-staff users
          if (user.role !== 'staff') {
            if (section !== undefined) user.section = section;
            if (batch !== undefined) user.batch = batch;
          }
      
          // Update password if provided
          if (newPassword && newPassword.trim() !== '') {
            console.log('Updating password for user:', user.rollNumber);
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, 10);
          }
      
          // Save changes
          const updatedUser = await user.save({ session });
          console.log('User updated successfully:', updatedUser);
          
          // Commit the transaction
          await session.commitTransaction();
          session.endSession();
      
          // Prepare response data
          const userData = {
            _id: updatedUser._id,
            name: updatedUser.name,
            rollNumber: updatedUser.rollNumber,
            role: updatedUser.role,
            department: updatedUser.department,
            section: updatedUser.section,
            batch: updatedUser.batch
          };
      
          // Generate new token if password was changed
          let token;
          if (newPassword && newPassword.trim() !== '') {
            token = jwt.sign(
              { 
                _id: updatedUser._id, 
                role: updatedUser.role, 
                name: updatedUser.name,
                department: updatedUser.department,
                batch: updatedUser.batch
              },
              process.env.JWT_SECRET || 'quizappsecret',
              { expiresIn: '1h' }
            );
            console.log('New token generated for user:', updatedUser.rollNumber);
          }
      
          const response = {
            success: true,
            message: 'Profile updated successfully',
            user: userData
          };
          
          if (token) {
            response.token = token;
          }
      
          console.log('Sending response:', response);
          res.json(response);
      
        } catch (err) {
          console.error('Profile update error:', err);
          await session.abortTransaction();
          session.endSession();
          
          let statusCode = 500;
          let errorMessage = 'Failed to update profile';
          
          if (err.code === 11000) { // Duplicate key error
            statusCode = 409;
            errorMessage = 'Roll number already in use';
          }
          
          const errorResponse = { 
            success: false, 
            message: errorMessage,
            error: err.message,
            ...(err.code === 11000 && { field: 'rollNumber' })
          };
          
          console.error('Error response:', errorResponse);
          res.status(statusCode).json(errorResponse);
        }
      });
    // Add this with other user management routes
    app.put('/api/users/:id/password', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { newPassword } = req.body;
            const userId = req.params.id;
            
            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'New password must be at least 6 characters long' 
                });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            await user.save();

            res.json({ 
                success: true,
                message: 'Password updated successfully'
            });
        } catch (err) {
            console.error('Error updating password:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update password',
                error: err.message 
            });
        }
    });
    // Get results for a specific quiz
    app.get('/api/quizzes/:id/results', authenticate, authorize(['staff', 'admin']), async (req, res) => {
        try {
            const quizId = req.params.id;
            
            // Verify the requesting user created this quiz or is admin
            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Quiz not found' 
                });
            }

            if (quiz.createdBy.toString() !== req.user._id && req.user.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Not authorized to view these results' 
                });
            }

            const results = await QuizResult.find({ quiz: quizId })
                .populate('user', 'name rollNumber department batch');

            res.json({ 
                success: true,
                results 
            });
        } catch (err) {
            console.error('Error fetching quiz results:', err);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch quiz results',
                error: err.message 
            });
        }
    });
    app.get('/api/debug/quizzes', async (req, res) => {
    const quizzes = await Quiz.find({});
    res.json({ quizzes });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    });

    // Logging middleware
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
        next();
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Access the API at http://localhost:${PORT}`);
    });
    // Add this route with the other user management routes
    app.post('/api/users/staff', authenticate, authorize(['admin']), async (req, res) => {
        try {
            const { name, rollNumber, password, department } = req.body;
            
            if (!name || !rollNumber || !password || !department) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Missing required fields: name, rollNumber, password, department' 
                });
            }

            const existingUser = await User.findOne({ rollNumber });
            if (existingUser) {
                return res.status(409).json({ 
                    success: false,
                    message: 'User already exists with this roll number' 
                });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const user = new User({
                name,
                rollNumber,
                password: hashedPassword,
                role: 'staff',
                department,
                isApproved: true
            });

            await user.save();
            
            res.status(201).json({ 
                success: true,
                message: 'Staff account created successfully',
                user: {
                    id: user._id,
                    name: user.name,
                    rollNumber: user.rollNumber,
                    department: user.department
                }
            });
        } catch (err) {
            console.error('Error creating staff account:', err);
            res.status(500).json({ 
                success: false,
                message: 'Failed to create staff account',
                error: err.message 
            });
        }
    });
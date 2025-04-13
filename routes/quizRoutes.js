const express = require('express');
const {
    createQuiz,
    getAllQuizzes,
    getQuizById,
    getAllQuizzesExceptOwner,
    deleteQuizById,
    updateQuizWithQuestions,
    getQuizzesByUser, getQuizzesBySubject
} = require('../controllers/quizController');
const authenticateJWT = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/create-quiz', authenticateJWT, createQuiz);

router.get('/get-quizzes', authenticateJWT, getAllQuizzesExceptOwner);

router.get("/get-all-available-quizzes", authenticateJWT, getAllQuizzes);

router.get('/get-quiz/:quizId', authenticateJWT, getQuizById);

router.get('/get-quizzes-by-user', authenticateJWT, getQuizzesByUser);

router.put('/update-quiz/:quizId', authenticateJWT, updateQuizWithQuestions);

router.delete('/delete-quiz/:quizId', authenticateJWT, deleteQuizById);

router.get('/get-quizzes-by-subject/:subjectId', authenticateJWT, getQuizzesBySubject);
module.exports = router;

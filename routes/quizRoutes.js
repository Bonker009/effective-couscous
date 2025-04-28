const express = require('express');
const {
    createQuiz,
    getAllQuizzes,
    getQuizById,
    getAllQuizzesExceptOwner,
    deleteQuizById,
    updateQuizWithQuestions,
    getQuizzesByUser,
    getQuizzesBySubject,
    joinQuiz,
    submitQuizAnswers,
    getAllJoinedQuizzes,
    getJoinedQuizDetails,
    getQuizDetailsByAccessCode
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

router.post('/join-quiz', authenticateJWT, joinQuiz);

router.post('/submit-quiz', authenticateJWT, submitQuizAnswers);

router.get('/joined-quizzes', authenticateJWT, getAllJoinedQuizzes);

router.get('/quiz-details-by-access-code', authenticateJWT, getQuizDetailsByAccessCode);

router.get('/joined-quiz-details/:join_id', authenticateJWT, getJoinedQuizDetails);


module.exports = router;

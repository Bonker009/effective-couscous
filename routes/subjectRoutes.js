const express = require('express');
const {
    createSubject,
    getAllSubjects,
    getSubjectById,
    updateSubject,
    deleteSubject
} = require('../controllers/subjectController');
const authenticateJWT = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/create-subject', authenticateJWT, createSubject);

router.get('/get-all-subjects', authenticateJWT, getAllSubjects);

router.get('/get-subject/:subjectId', authenticateJWT, getSubjectById);

router.put('/update-subject/:subjectId', authenticateJWT, updateSubject);

router.delete('/delete-subject/:subjectId', authenticateJWT, deleteSubject);

module.exports = router;

const client = require("../db");

const getAllQuizzes = async (req, res) => {
    try {
        const {subject_id, creator_id} = req.query;
        let baseQuery = `
            SELECT q.quiz_id,
                   q.title,
                   q.description,
                   q.creation_at,
                   s.subject_name,
                   u.full_name AS creator_name
            FROM quizzes q
                     JOIN subjects s ON q.subject_id = s.subject_id
                     JOIN users u ON q.creator_id = u.user_id
        `;
        const params = [];
        const conditions = [];

        if (subject_id) {
            params.push(subject_id);
            conditions.push(`q.subject_id = $${params.length}`);
        }

        if (creator_id) {
            params.push(creator_id);
            conditions.push(`q.creator_id = $${params.length}`);
        }

        if (conditions.length > 0) {
            baseQuery += ` WHERE ` + conditions.join(' AND ');
        }

        baseQuery += ` ORDER BY q.creation_at DESC`;

        const result = await client.query(baseQuery, params);
        return res.status(200).json({quizzes: result.rows});

    } catch (err) {
        console.error('Error fetching quizzes:', err);
        return res.status(500).json({message: "Failed to fetch quizzes."});
    }
};


const generateAccessCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

const createQuiz = async (req, res) => {
    const {
        title,
        description,
        is_schedule,
        time_limit,
        subject_id,
        start_at,
        questions
    } = req.body;

    const creator_id = req.user.userId;
    const access_code = generateAccessCode();

    if (!title || !creator_id || !subject_id || !questions || questions.length === 0) {
        return res.status(400).json({message: "Title, subject_id, and at least one question are required."});
    }

    // 🔢 Auto-calculate total score from questions
    const total_score = questions.reduce((sum, q) => sum + (q.points || 0), 0);

    try {
        await client.query('BEGIN');

        const quizInsertQuery = `
            INSERT INTO quizzes (title, description, creator_id, is_schedule, time_limit, access_code, subject_id,
                                 total_score, start_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING quiz_id, access_code
        `;
        // testin
        const quizValues = [title, description, creator_id, is_schedule, time_limit, access_code, subject_id, total_score, start_at];
        const quizResult = await client.query(quizInsertQuery, quizValues);
        const quiz_id = quizResult.rows[0].quiz_id;

        for (let i = 0; i < questions.length; i++) {
            const {question_text, is_qcm, points, options} = questions[i];

            const questionInsertQuery = `
                INSERT INTO questions (quiz_id, question_text, is_qcm, points)
                VALUES ($1, $2, $3, $4)
                RETURNING question_id
            `;
            const questionValues = [quiz_id, question_text, is_qcm, points];
            const questionResult = await client.query(questionInsertQuery, questionValues);
            const question_id = questionResult.rows[0].question_id;

            for (let j = 0; j < options.length; j++) {
                const {option_text, is_correct} = options[j];

                const optionInsertQuery = `
                    INSERT INTO options (question_id, option_text, is_correct)
                    VALUES ($1, $2, $3)
                `;
                const optionValues = [question_id, option_text, is_correct];
                await client.query(optionInsertQuery, optionValues);
            }
        }

        await client.query('COMMIT');

        return res.status(201).json({
            message: "Quiz created successfully!",
            quiz_id,
            access_code,
            total_score
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating quiz:', err);
        return res.status(500).json({message: "Error creating quiz. Please try again."});
    }
};

const getQuizById = async (req, res) => {
    const {quizId} = req.params;

    try {

        const quizQuery = `
            SELECT q.quiz_id,
                   q.title,
                   q.description,
                   q.is_schedule,
                   q.time_limit,
                   q.access_code,
                   q.subject_id,
                   q.total_score,
                   q.start_at,
                   q.creator_id,
                   q.creation_at,
                   s.subject_name,
                   u.full_name AS creator_name
            FROM quizzes q
                     JOIN subjects s ON q.subject_id = s.subject_id
                     JOIN users u ON q.creator_id = u.user_id
            WHERE q.quiz_id = $1
        `;
        const quizResult = await client.query(quizQuery, [parseInt(quizId)]);
        if (quizResult.rows.length === 0) {
            return res.status(404).json({message: "Quiz not found."});
        }

        const quizData = quizResult.rows[0];

        // Get the questions for the quiz
        const questionQuery = `
            SELECT question_id, question_text, is_qcm, points
            FROM questions
            WHERE quiz_id = $1
            ORDER BY question_id
        `;
        const questionsResult = await client.query(questionQuery, [quizId]);

        const optionsQuery = `
            SELECT o.option_id, o.option_text, o.is_correct, o.question_id
            FROM options o
            WHERE o.question_id = ANY ($1::int[])
            ORDER BY o.question_id, o.option_id
        `;
        const questionIds = questionsResult.rows.map(q => q.question_id);
        const optionsResult = await client.query(optionsQuery, [questionIds]);
        const questionsWithOptions = questionsResult.rows.map(question => {
            const options = optionsResult.rows.filter(option => option.question_id === question.question_id);
            return {...question, options};
        });

        return res.status(200).json({
            quiz: {
                ...quizData,
                questions: questionsWithOptions
            }
        });

    } catch (err) {
        console.error('Error fetching quiz:', err);
        return res.status(500).json({message: "Error fetching quiz. Please try again."});
    }
};
const deleteQuizById = async (req, res) => {
    const {quizId} = req.params;

    try {
        const result = await client.query(`DELETE
                                           FROM quizzes
                                           WHERE quiz_id = $1
                                           RETURNING *`, [quizId]);
        if (result.rowCount === 0) {
            return res.status(404).json({message: "Quiz not found."});
        }

        return res.status(200).json({message: "Quiz deleted successfully."});
    } catch (err) {
        console.error('Error deleting quiz:', err);
        return res.status(500).json({message: "Failed to delete quiz."});
    }
};
const updateQuizWithQuestions = async (req, res) => {
    const {quizId} = req.params;
    const {
        title,
        description,
        is_schedule,
        time_limit,
        subject_id,
        start_at,
        questions
    } = req.body;

    try {
        await client.query('BEGIN');

        // Check if quiz exists
        const quizCheck = await client.query(`SELECT *
                                              FROM quizzes
                                              WHERE quiz_id = $1`, [quizId]);
        if (quizCheck.rows.length === 0) {
            return res.status(404).json({message: "Quiz not found."});
        }

        // Calculate total_score based on question points
        const total_score = questions.reduce((sum, question) => sum + question.points, 0);

        // Update the quiz metadata
        await client.query(`
            UPDATE quizzes
            SET title       = $1,
                description = $2,
                is_schedule = $3,
                time_limit  = $4,
                subject_id  = $5,
                total_score = $6,
                start_at    = $7
            WHERE quiz_id = $8
        `, [title, description, is_schedule, time_limit, subject_id, total_score, start_at, quizId]);

        // Delete existing questions (cascade to options)
        await client.query(`DELETE
                            FROM questions
                            WHERE quiz_id = $1`, [quizId]);

        // Re-insert updated questions and options
        for (const question of questions) {
            const {question_text, is_qcm, points, options} = question;

            const questionInsert = `
                INSERT INTO questions (quiz_id, question_text, is_qcm, points)
                VALUES ($1, $2, $3, $4)
                RETURNING question_id
            `;
            const questionResult = await client.query(questionInsert, [quizId, question_text, is_qcm, points]);
            const question_id = questionResult.rows[0].question_id;

            for (const option of options) {
                const {option_text, is_correct} = option;
                await client.query(`
                    INSERT INTO options (question_id, option_text, is_correct)
                    VALUES ($1, $2, $3)
                `, [question_id, option_text, is_correct]);
            }
        }

        await client.query('COMMIT');
        return res.status(200).json({message: "Quiz and questions updated successfully."});

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error updating quiz:", err);
        return res.status(500).json({message: "Error updating quiz."});
    }
};

const getQuizzesByUser = async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await client.query(`
            SELECT quiz_id, title, description, creation_at
            FROM quizzes
            WHERE creator_id = $1
            ORDER BY creation_at DESC
        `, [userId]);

        return res.status(200).json({quizzes: result.rows});
    } catch (err) {
        console.error('Error fetching user quizzes:', err);
        return res.status(500).json({message: "Failed to fetch user quizzes."});
    }
};
const getAllQuizzesExceptOwner = async (req, res) => {
    const currentUserId = req.user.userId;

    try {
        const query = `
            SELECT q.quiz_id,
                   q.title,
                   q.description,
                   q.is_schedule,
                   q.time_limit,
                   q.access_code,
                   q.subject_id,
                   q.total_score,
                   q.start_at,
                   q.creator_id,
                   q.creation_at,
                   s.subject_name,
                   u.full_name AS creator_name
            FROM quizzes q
                     JOIN subjects s ON q.subject_id = s.subject_id
                     JOIN users u ON q.creator_id = u.user_id
            WHERE q.creator_id != $1
            ORDER BY q.creation_at DESC
        `;
        const result = await client.query(query, [currentUserId]);

        return res.status(200).json({quizzes: result.rows});

    } catch (err) {
        console.error("Error fetching quizzes (excluding owner):", err);
        return res.status(500).json({message: "Error fetching quizzes."});
    }
};

const getQuizzesBySubject = async (req, res) => {
    const {subjectId} = req.params;

    try {
        const query = `
            SELECT q.quiz_id,
                   q.title,
                   q.description,
                   q.creator_id,
                   q.is_schedule,
                   q.time_limit,
                   q.access_code,
                   q.subject_id,
                   q.total_score,
                   q.start_at
            FROM quizzes q
            WHERE q.subject_id = $1
            ORDER BY q.start_at
        `;
        const result = await client.query(query, [subjectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({message: "No quizzes found for this subject."});
        }

        return res.status(200).json({
            quizzes: result.rows
        });
    } catch (err) {
        console.error("Error fetching quizzes by subject:", err);
        return res.status(500).json({message: "Error fetching quizzes by subject."});
    }
};

const joinQuiz = async (req, res) => {
    const {access_code} = req.body;
    const student_id = req.user.userId;

    if (!access_code) {
        return res.status(400).json({message: "Access code is required."});
    }

    try {

        const quizQuery = `
            SELECT quiz_id, title, description, is_schedule, start_at, time_limit
            FROM quizzes
            WHERE access_code = $1
        `;
        const quizResult = await client.query(quizQuery, [access_code]);

        if (quizResult.rows.length === 0) {
            return res.status(404).json({message: "Invalid access code."});
        }

        const quiz = quizResult.rows[0];

        const joinCheckQuery = `
            SELECT join_id, session_id
            FROM join_quiz
            WHERE quiz_id = $1
              AND student_id = $2
        `;
        const joinCheckResult = await client.query(joinCheckQuery, [quiz.quiz_id, student_id]);

        let join_id, session_id;

        if (joinCheckResult.rows.length > 0) {

            join_id = joinCheckResult.rows[0].join_id;
            session_id = joinCheckResult.rows[0].session_id;
        } else {

            const insertJoinQuizQuery = `
                INSERT INTO join_quiz (quiz_id, student_id, is_joined)
                VALUES ($1, $2, TRUE)
                RETURNING join_id, session_id
            `;
            const newJoin = await client.query(insertJoinQuizQuery, [quiz.quiz_id, student_id]);
            join_id = newJoin.rows[0].join_id;
            session_id = newJoin.rows[0].session_id;

            if (quiz.is_schedule === false && !session_id) {

                const insertSessionQuery = `
                    INSERT INTO sessions (quiz_id, host_id)
                    VALUES ($1, $2)
                    RETURNING session_id
                `;
                const newSession = await client.query(insertSessionQuery, [quiz.quiz_id, student_id]);
                session_id = newSession.rows[0].session_id;

                const updateJoinQuizSessionQuery = `
                    UPDATE join_quiz
                    SET session_id = $1
                    WHERE join_id = $2
                `;
                await client.query(updateJoinQuizSessionQuery, [session_id, join_id]);
            }

            const questionsQuery = `
                SELECT question_id
                FROM questions
                WHERE quiz_id = $1
            `;
            const questionsResult = await client.query(questionsQuery, [quiz.quiz_id]);
            const questionIds = questionsResult.rows.map(q => q.question_id);

            const answerInserts = questionIds.map(qid => {
                return client.query(`
                    INSERT INTO student_answers (join_id, question_id, option_id)
                    VALUES ($1, $2)
                `, [join_id, qid]);
            });

            await Promise.all(answerInserts);
        }

        return res.status(200).json({
            message: "Joined quiz successfully.",
            session_id,
            quiz
        });

    } catch (err) {
        console.error("Error joining quiz:", err);
        return res.status(500).json({message: "Failed to join quiz."});
    }
};


module.exports = {
    createQuiz,
    getQuizById,
    getAllQuizzes,
    deleteQuizById,
    updateQuizWithQuestions,
    getQuizzesByUser,
    getAllQuizzesExceptOwner,
    getQuizzesBySubject
};

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
        // testing
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
    const student_id = req.user.userId;
    const { access_code } = req.body;

    if (!access_code) {
        return res.status(400).json({ message: "Access code is required to join the quiz." });
    }

    try {
        // Check if quiz exists with the given access code
        const quizResult = await client.query(
            'SELECT * FROM quizzes WHERE access_code = $1',
            [access_code]
        );

        if (quizResult.rows.length === 0) {
            return res.status(404).json({ message: "Quiz not found or invalid access code." });
        }

        const quiz_id = quizResult.rows[0].quiz_id;

        // Check if already joined the quiz
        const existingJoin = await client.query(
            'SELECT * FROM join_quiz WHERE quiz_id = $1 AND student_id = $2',
            [quiz_id, student_id]
        );
        if (existingJoin.rows.length > 0) {
            return res.status(400).json({ message: "You already joined this quiz." });
        }

        // Insert new join record
        const joinResult = await client.query(
            `INSERT INTO join_quiz (quiz_id, student_id, is_joined, start_time)
             VALUES ($1, $2, TRUE, NOW())
             RETURNING join_id`,
            [quiz_id, student_id]
        );

        const join_id = joinResult.rows[0].join_id;

        return res.status(201).json({ message: "Joined quiz successfully.", join_id });

    } catch (err) {
        console.error('Error joining quiz:', err);
        return res.status(500).json({ message: "Error joining quiz." });
    }
};

const submitQuizAnswers = async (req, res) => {
    const student_id = req.user.userId;
    const { join_id, answers } = req.body;

    if (!join_id || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ message: "Join ID and answers are required." });
    }

    try {
        // Check if the join record exists for the student and the quiz
        const joinResult = await client.query(
            'SELECT * FROM join_quiz WHERE join_id = $1 AND student_id = $2',
            [join_id, student_id]
        );

        if (joinResult.rows.length === 0) {
            return res.status(404).json({ message: "Join record not found." });
        }

        // Check if the quiz has already been finished (optional)
        if (joinResult.rows[0].finished_at) {
            return res.status(400).json({ message: "You have already submitted this quiz." });
        }

        // Validate answers and insert into student_answers table
        let total_score = 0;
        for (let answer of answers) {
            const { question_id, option_id } = answer;

            // Check if the answer is valid for this question
            const validAnswer = await client.query(
                'SELECT * FROM options WHERE option_id = $1 AND question_id = $2',
                [option_id, question_id]
            );

            if (validAnswer.rows.length === 0) {
                return res.status(400).json({ message: "Invalid answer choice for question ID " + question_id });
            }

            // Add points if the selected option is correct
            if (validAnswer.rows[0].is_correct) {
                const questionResult = await client.query(
                    'SELECT points FROM questions WHERE question_id = $1',
                    [question_id]
                );
                total_score += questionResult.rows[0].points;
            }

            // Insert or update the student's answer in the student_answers table
            const existingAnswer = await client.query(
                'SELECT * FROM student_answers WHERE join_id = $1 AND question_id = $2',
                [join_id, question_id]
            );

            if (existingAnswer.rows.length > 0) {
                // Update the existing answer if it already exists
                await client.query(
                    'UPDATE student_answers SET option_id = $1 WHERE join_id = $2 AND question_id = $3',
                    [option_id, join_id, question_id]
                );
            } else {
                // Insert a new answer if it doesn't exist
                await client.query(
                    'INSERT INTO student_answers (join_id, question_id, option_id) VALUES ($1, $2, $3)',
                    [join_id, question_id, option_id]
                );
            }
        }

        // Update the join_quiz record with the final score and submission timestamp
        await client.query(
            'UPDATE join_quiz SET archive_score = $1, end_time = NOW(), is_joined = FALSE WHERE join_id = $2 AND student_id = $3',
            [total_score, join_id, student_id]
        );

        return res.status(200).json({ message: "Quiz submitted successfully.", score: total_score });

    } catch (err) {
        console.error('Error submitting quiz:', err);
        return res.status(500).json({ message: "Error submitting quiz." });
    }
};

const getAllJoinedQuizzes = async (req, res) => {
    const studentId = req.user.userId;  // Assuming user info is stored in req.user

    try {
        // Query the database for all quizzes the user has joined
        const result = await client.query(`
            SELECT
                jq.join_id,
                q.quiz_id,
                q.title AS quiz_title,
                jq.start_time AS quiz_start_time,
                jq.end_time AS quiz_finish_time
            FROM
                join_quiz jq
                INNER JOIN quizzes q ON jq.quiz_id = q.quiz_id
            WHERE
                jq.student_id = $1
            ORDER BY
                jq.start_time DESC;
        `, [studentId]);

        // If no quizzes found
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No quizzes found for the user." });
        }

        // Return the quizzes the user has joined
        return res.status(200).json({ quizzes: result.rows });
    } catch (err) {
        console.error('Error fetching joined quizzes:', err);
        return res.status(500).json({ message: "Error retrieving joined quizzes." });
    }
};
const getJoinedQuizDetails = async (req, res) => {
    const { join_id } = req.params;

    try {
        const result = await client.query(`
            SELECT jq.join_id,
                   q.quiz_id,
                   q.title       AS quiz_title,
                   q.description AS quiz_description,
                   jq.start_time AS quiz_start_time,
                   jq.end_time   AS quiz_finish_time,
                   jq.archive_score,
                   jq.is_joined,
                   q.time_limit,
                   q.start_at    AS quiz_start_at,
                   json_agg(
                           json_build_object(
                                   'question_id', quest.question_id,
                                   'question_text', quest.question_text,
                                   'is_qcm', quest.is_qcm,
                                   'points', quest.points,
                                   'user_answer',
                                   json_build_object(
                                           'option_id', sa.option_id,
                                           'answer_text',
                                           CASE
                                               WHEN sa.option_id IS NOT NULL
                                                   THEN (SELECT option_text FROM options WHERE option_id = sa.option_id)
                                               ELSE 'No answer'
                                               END
                                   )
                           )
                   ) AS questions_and_answers
            FROM join_quiz jq
                     INNER JOIN quizzes q ON jq.quiz_id = q.quiz_id
                     LEFT JOIN questions quest ON q.quiz_id = quest.quiz_id
                     LEFT JOIN student_answers sa ON jq.join_id = sa.join_id AND quest.question_id = sa.question_id
            WHERE jq.join_id = $1
            GROUP BY jq.join_id, q.quiz_id;
        `, [join_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Joined quiz not found." });
        }

        return res.status(200).json({ quiz_details: result.rows[0] });
    } catch (err) {
        console.error('Error fetching joined quiz details:', err);
        return res.status(500).json({ message: "Error retrieving quiz details." });
    }
};

const getQuizDetailsByAccessCode = async (req, res) => {
    const { access_code } = req.query;

    if (!access_code) {
        return res.status(400).json({ message: "Access code is required." });
    }

    try {

        const result = await client.query(`
            SELECT 
                q.quiz_id,
                q.title AS quiz_title,
                q.description AS quiz_description,
                q.time_limit,
                q.start_at AS quiz_start_at,
                json_agg(
                    json_build_object(
                        'question_id', quest.question_id,
                        'question_text', quest.question_text,
                        'is_qcm', quest.is_qcm,
                        'points', quest.points
                    )
                ) AS questions
            FROM 
                quizzes q
            LEFT JOIN questions quest ON q.quiz_id = quest.quiz_id
            WHERE q.access_code = $1
            GROUP BY q.quiz_id;
        `, [access_code]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quiz not found for the given access code." });
        }

        return res.status(200).json({ quiz_details: result.rows[0] });
    } catch (err) {
        console.error('Error fetching quiz details by access code:', err);
        return res.status(500).json({ message: "Error retrieving quiz details by access code." });
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
    getQuizzesBySubject,
    joinQuiz,
    submitQuizAnswers,
    getAllJoinedQuizzes,
    getJoinedQuizDetails,
    getQuizDetailsByAccessCode
};

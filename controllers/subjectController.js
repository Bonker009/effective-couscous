const client = require('../db');

const createSubject = async (req, res) => {
    const {subject_name} = req.body;

    if (!subject_name) {
        return res.status(400).json({message: "Subject name is required."});
    }

    try {
        const insertQuery = `
            INSERT INTO subjects (subject_name)
            VALUES ($1)
            RETURNING subject_id, subject_name
        `;
        const values = [subject_name];
        const result = await client.query(insertQuery, values);

        return res.status(201).json({
            message: "Subject created successfully!",
            subject: result.rows[0]
        });
    } catch (err) {
        console.error("Error creating subject:", err);
        return res.status(500).json({message: "Error creating subject."});
    }
};

const getAllSubjects = async (req, res) => {
    try {
        const query = 'SELECT * FROM subjects ORDER BY subject_name';
        const result = await client.query(query);

        return res.status(200).json({
            subjects: result.rows
        });
    } catch (err) {
        console.error("Error fetching subjects:", err);
        return res.status(500).json({message: "Error fetching subjects."});
    }
};

const getSubjectById = async (req, res) => {
    const {subjectId} = req.params;

    try {
        const query = 'SELECT * FROM subjects WHERE subject_id = $1';
        const result = await client.query(query, [subjectId]);

        if (result.rows.length === 0) {
            return res.status(404).json({message: "Subject not found."});
        }

        return res.status(200).json({
            subject: result.rows[0]
        });
    } catch (err) {
        console.error("Error fetching subject:", err);
        return res.status(500).json({message: "Error fetching subject."});
    }
};

const updateSubject = async (req, res) => {
    const {subjectId} = req.params;
    const {subject_name} = req.body;

    try {
        const checkSubjectQuery = 'SELECT * FROM subjects WHERE subject_id = $1';
        const checkSubjectResult = await client.query(checkSubjectQuery, [subjectId]);

        if (checkSubjectResult.rows.length === 0) {
            return res.status(404).json({message: "Subject not found."});
        }

        const updateQuery = `
            UPDATE subjects
            SET subject_name = $1
            WHERE subject_id = $2
            RETURNING subject_id, subject_name
        `;
        const values = [subject_name, subjectId];
        const result = await client.query(updateQuery, values);

        return res.status(200).json({
            message: "Subject updated successfully!",
            subject: result.rows[0]
        });
    } catch (err) {
        console.error("Error updating subject:", err);
        return res.status(500).json({message: "Error updating subject."});
    }
};

const deleteSubject = async (req, res) => {
    const {subjectId} = req.params;

    try {
        const checkSubjectQuery = 'SELECT * FROM subjects WHERE subject_id = $1';
        const checkSubjectResult = await client.query(checkSubjectQuery, [subjectId]);

        if (checkSubjectResult.rows.length === 0) {
            return res.status(404).json({message: "Subject not found."});
        }

        const deleteQuery = 'DELETE FROM subjects WHERE subject_id = $1';
        await client.query(deleteQuery, [subjectId]);

        return res.status(200).json({message: "Subject deleted successfully."});
    } catch (err) {
        console.error("Error deleting subject:", err);
        return res.status(500).json({message: "Error deleting subject."});
    }
};

module.exports = {
    createSubject,
    getAllSubjects,
    getSubjectById,
    updateSubject,
    deleteSubject
};

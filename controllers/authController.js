const bcrypt = require('bcryptjs');
const {generateToken} = require('../utils/authUtils');
const client = require("../db")

const register = async (req, res) => {
    const {full_name, email, password} = req.body;
    if (!full_name || !email || !password) {
        return res.status(400).json({error: 'All fields are required'});
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await client.query(
            'INSERT INTO users (full_name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [full_name, email, hashedPassword]
        );

        const newUser = result.rows[0];
        const token = generateToken(newUser.user_id);
        res.json({token, user: newUser});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: 'Something went wrong'});
    }
};

// Login an existing user
const login = async (req, res) => {
    const {email, password} = req.body;
    if (!email || !password) {
        return res.status(400).json({error: 'Email and password are required'});
    }

    try {
        const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({error: 'Invalid email or password'});
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({error: 'Invalid email or password'});
        }

        const token = generateToken(user.user_id);

        res.json({token});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: 'Something went wrong'});
    }
};

module.exports = {register, login};

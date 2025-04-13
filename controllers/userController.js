const client = require("../db")

const getUserProfile = async (req, res) => {
    const userId = await req.user.userId;
    console.log(req.user);


    try {
        const result = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({error: 'User not found'});
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: 'Something went wrong'});
    }
};

module.exports = {getUserProfile};

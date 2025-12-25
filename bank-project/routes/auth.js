const express = require('express');
const User = require('../models/User');
const router = express.Router();

router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password, phone, address } = req.body;
        const accountNumber = 'ACC' + Date.now() + Math.floor(Math.random() * 1000);
        
        const user = new User({
            fullName,
            email,
            password,
            phone,
            address,
            accountNumber,
            balance: 1000
        });
        
        await user.save();
        res.redirect('/auth/login');
    } catch (error) {
        res.render('register', { error: 'Registration failed. Email might already exist.' });
    }
});

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.render('login', { error: 'Invalid credentials' });
        }
        
        req.session.userId = user._id;
        res.redirect('/bank/dashboard');
    } catch (error) {
        res.render('login', { error: 'Login failed' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;

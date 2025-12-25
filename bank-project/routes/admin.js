const express = require('express');
const User = require('../models/User');
const router = express.Router();

const isAdmin = (req, res, next) => {
    if (!req.session.isAdmin) return res.redirect('/admin/login');
    next();
};

router.get('/login', (req, res) => {
    res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Hardcoded admin credentials (in production, use database)
    if (username === 'admin' && password === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin/login', { error: 'Invalid credentials' });
    }
});

router.get('/dashboard', isAdmin, async (req, res) => {
    const totalUsers = await User.countDocuments();
    const activeLoans = await User.aggregate([
        { $unwind: '$loans' },
        { $match: { 'loans.status': 'active' } },
        { $count: 'total' }
    ]);
    const totalTransactions = await User.aggregate([
        { $project: { count: { $size: '$transactions' } } },
        { $group: { _id: null, total: { $sum: '$count' } } }
    ]);
    
    const totalBalance = await User.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    
    const stats = {
        totalUsers,
        activeLoans: activeLoans[0] ? activeLoans[0].total : 0,
        totalTransactions: totalTransactions[0] ? totalTransactions[0].total : 0,
        totalBalance: totalBalance[0] ? totalBalance[0].total : 0
    };
    
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(10);
    
    res.render('admin/dashboard', { stats, recentUsers });
});

router.get('/users', isAdmin, async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.render('admin/users', { users });
});

router.get('/users/:id', isAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    res.render('admin/user-details', { user });
});

router.post('/users/:id/lock', isAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { accountLocked: true });
    res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/unlock', isAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { accountLocked: false, loginAttempts: 0 });
    res.redirect('/admin/users/' + req.params.id);
});

router.get('/transactions', isAdmin, async (req, res) => {
    const users = await User.find().select('fullName accountNumber transactions');
    let allTransactions = [];
    
    users.forEach(user => {
        user.transactions.forEach(trans => {
            allTransactions.push({
                userName: user.fullName,
                accountNumber: user.accountNumber,
                ...trans._doc
            });
        });
    });
    
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    allTransactions = allTransactions.slice(0, 100);
    
    res.render('admin/transactions', { transactions: allTransactions });
});

router.get('/logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/admin/login');
});

module.exports = router;

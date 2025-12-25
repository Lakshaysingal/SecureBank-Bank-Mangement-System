const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const bankRoutes = require('./routes/bank');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = 3000;

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/bankManagement')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: 'bank-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/auth', authRoutes);
app.use('/bank', bankRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
    res.render('landing');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

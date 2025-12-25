const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const transactionSchema = new mongoose.Schema({
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    description: String,
    toAccount: String,
    category: { type: String, default: 'other' },
    receipt: String,
    date: { type: Date, default: Date.now }
});

const loanSchema = new mongoose.Schema({
    loanType: { type: String, enum: ['personal', 'home', 'car', 'education'], default: 'personal' },
    amount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    tenure: { type: Number, required: true },
    emiAmount: { type: Number, required: true },
    paidEmis: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now },
    status: { type: String, default: 'active' },
    payments: [{
        amount: Number,
        date: { type: Date, default: Date.now },
        paidBy: String
    }]
});

const fdSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    tenure: { type: Number, required: true },
    maturityAmount: { type: Number, required: true },
    startDate: { type: Date, default: Date.now },
    maturityDate: Date,
    status: { type: String, default: 'active' }
});

const rdSchema = new mongoose.Schema({
    monthlyDeposit: { type: Number, required: true },
    tenure: { type: Number, required: true },
    interestRate: { type: Number, default: 7 },
    maturityAmount: { type: Number, required: true },
    startDate: { type: Date, default: Date.now },
    maturityDate: Date,
    deposits: [{
        amount: Number,
        date: { type: Date, default: Date.now }
    }],
    status: { type: String, default: 'active' }
});

const cardSchema = new mongoose.Schema({
    cardNumber: { type: String, required: true },
    cardType: { type: String, enum: ['debit', 'credit'], required: true },
    cardHolder: { type: String, required: true },
    expiryDate: { type: String, required: true },
    cvv: { type: String, required: true },
    creditLimit: { type: Number, default: 0 },
    availableCredit: { type: Number, default: 0 },
    dailyLimit: { type: Number, default: 50000 },
    monthlyLimit: { type: Number, default: 500000 },
    isActive: { type: Boolean, default: true },
    internationalEnabled: { type: Boolean, default: false },
    contactlessEnabled: { type: Boolean, default: true },
    rewardPoints: { type: Number, default: 0 },
    issueDate: { type: Date, default: Date.now }
});

const beneficiarySchema = new mongoose.Schema({
    name: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: String,
    ifscCode: String,
    nickname: String,
    addedDate: { type: Date, default: Date.now }
});

const budgetSchema = new mongoose.Schema({
    category: { type: String, required: true },
    limit: { type: Number, required: true },
    spent: { type: Number, default: 0 },
    month: { type: String, required: true },
    alerts: { type: Boolean, default: true }
});

const billSchema = new mongoose.Schema({
    billerName: { type: String, required: true },
    billType: { type: String, required: true },
    accountNumber: String,
    autoPay: { type: Boolean, default: false },
    dueDate: Number,
    reminderEnabled: { type: Boolean, default: true }
});

const investmentSchema = new mongoose.Schema({
    type: { type: String, enum: ['mutual_fund', 'gold', 'sip'], required: true },
    name: String,
    amount: { type: Number, required: true },
    currentValue: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
    units: Number,
    status: { type: String, default: 'active' }
});

const notificationSchema = new mongoose.Schema({
    title: String,
    message: String,
    type: { type: String, enum: ['transaction', 'alert', 'info', 'security'] },
    isRead: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});

const loginHistorySchema = new mongoose.Schema({
    ipAddress: String,
    device: String,
    browser: String,
    location: String,
    date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accountNumber: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    phone: String,
    address: String,
    dateOfBirth: Date,
    gender: String,
    panCard: String,
    aadharCard: String,
    
    // Security
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    transactionPin: String,
    accountLocked: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    
    // Profile
    profilePicture: String,
    customQRCode: String,
    kycStatus: { type: String, default: 'pending' },
    accountType: { type: String, default: 'savings' },
    
    // Referral
    referralCode: String,
    referredBy: String,
    referralCount: { type: Number, default: 0 },
    rewardPoints: { type: Number, default: 0 },
    
    // Arrays
    transactions: [transactionSchema],
    loans: [loanSchema],
    fixedDeposits: [fdSchema],
    recurringDeposits: [rdSchema],
    cards: [cardSchema],
    beneficiaries: [beneficiarySchema],
    budgets: [budgetSchema],
    savedBillers: [billSchema],
    investments: [investmentSchema],
    notifications: [notificationSchema],
    loginHistory: [loginHistorySchema],
    
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.comparePin = async function(pin) {
    return await bcrypt.compare(pin, this.transactionPin);
};

module.exports = mongoose.model('User', userSchema);

const express = require('express');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const emailService = require('../services/emailService');
const router = express.Router();

// Configure multer for QR code upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'public/uploads/qr-codes/';
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueName = req.session.userId + '-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Images only (jpeg, jpg, png)!');
        }
    }
});

const isAuthenticated = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    next();
};

// Helper function to send transaction alerts via email
async function sendTransactionAlert(email, fullName, transaction) {
    console.log(`✅ Transaction Alert: ${transaction.type} of ₹${transaction.amount} for ${fullName}`);
    
    try {
        // Use email service to send transaction alert
        await emailService.sendTransactionAlert(email, fullName, transaction);
        console.log('📧 Email notification sent successfully');
    } catch (error) {
        console.error('⚠️ Email notification failed:', error.message);
    }
    
    return true;
}

// Dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    
    // Check for account lock
    if (user.accountLocked) {
        return res.render('account-locked');
    }
    
    res.render('dashboard', { user });
});

// Profile Management
router.get('/profile', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('profile', { user });
});

router.post('/profile/update', isAuthenticated, async (req, res) => {
    const { phone, address, dateOfBirth, gender } = req.body;
    await User.findByIdAndUpdate(req.session.userId, {
        phone, address, dateOfBirth, gender
    });
    res.redirect('/bank/profile');
});

// Security Settings
router.get('/security', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('security', { user, qrCode: null });
});

router.post('/security/enable-2fa', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    
    const secret = speakeasy.generateSecret({
        name: `SecureBank (${user.email})`
    });
    
    user.twoFactorSecret = secret.base32;
    await user.save();
    
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.render('security', { user, qrCode });
});

router.post('/security/verify-2fa', isAuthenticated, async (req, res) => {
    const { token } = req.body;
    const user = await User.findById(req.session.userId);
    
    const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token
    });
    
    if (verified) {
        user.twoFactorEnabled = true;
        await user.save();
        res.redirect('/bank/security');
    } else {
        res.render('security', { user, error: 'Invalid code', qrCode: null });
    }
});

router.post('/security/set-pin', isAuthenticated, async (req, res) => {
    const { pin } = req.body;
    const user = await User.findById(req.session.userId);
    const bcrypt = require('bcryptjs');
    user.transactionPin = await bcrypt.hash(pin, 10);
    await user.save();
    res.redirect('/bank/security');
});

// Deposit with email alert
router.get('/deposit', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('deposit', { user });
});

router.post('/deposit', isAuthenticated, async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findById(req.session.userId);
        
        const depositAmount = parseFloat(amount);
        user.balance += depositAmount;
        
        const transaction = {
            type: 'deposit',
            amount: depositAmount,
            balance: user.balance,
            description: 'Cash Deposit',
            category: 'income',
            date: new Date()
        };
        
        user.transactions.push(transaction);
        user.notifications.push({
            title: 'Deposit Successful',
            message: `₹${depositAmount} has been credited to your account`,
            type: 'transaction'
        });
        
        await user.save();
        
        // Send email alert
        await sendTransactionAlert(user.email, user.fullName, transaction);
        
        res.redirect('/bank/dashboard');
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).send('Error processing deposit');
    }
});

// Withdraw
router.get('/withdraw', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('withdraw', { user, error: null });
});

router.post('/withdraw', isAuthenticated, async (req, res) => {
    const { amount, pin } = req.body;
    const user = await User.findById(req.session.userId);
    
    // Verify PIN if set
    if (user.transactionPin && pin) {
        const validPin = await user.comparePin(pin);
        if (!validPin) {
            return res.render('withdraw', { user, error: 'Invalid PIN' });
        }
    }
    
    if (user.balance < parseFloat(amount)) {
        return res.render('withdraw', { user, error: 'Insufficient balance' });
    }
    
    user.balance -= parseFloat(amount);
    const transaction = {
        type: 'withdraw',
        amount: parseFloat(amount),
        balance: user.balance,
        description: 'Cash Withdrawal',
        category: 'withdrawal',
        date: new Date()
    };
    
    user.transactions.push(transaction);
    user.notifications.push({
        title: 'Withdrawal Successful',
        message: `₹${amount} has been debited from your account`,
        type: 'transaction'
    });
    
    await user.save();
    await sendTransactionAlert(user.email, user.fullName, transaction);
    
    res.redirect('/bank/dashboard');
});

router.get('/transfer', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('transfer', { user, error: null });
});

router.post('/transfer', isAuthenticated, async (req, res) => {
    const { accountNumber, amount } = req.body;
    const user = await User.findById(req.session.userId);
    const recipient = await User.findOne({ accountNumber });
    
    if (!recipient) {
        return res.render('transfer', { user, error: 'Account not found' });
    }
    
    if (user.balance < parseFloat(amount)) {
        return res.render('transfer', { user, error: 'Insufficient balance' });
    }
    
    user.balance -= parseFloat(amount);
    recipient.balance += parseFloat(amount);
    
    user.transactions.push({
        type: 'transfer',
        amount: parseFloat(amount),
        balance: user.balance,
        description: `Transfer to ${accountNumber}`,
        toAccount: accountNumber,
        date: new Date()
    });
    
    recipient.transactions.push({
        type: 'received',
        amount: parseFloat(amount),
        balance: recipient.balance,
        description: `Received from ${user.accountNumber}`,
        date: new Date()
    });
    
    await user.save();
    await recipient.save();
    res.redirect('/bank/dashboard');
});

router.get('/loan', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('loan', { user });
});

router.post('/loan', isAuthenticated, async (req, res) => {
    const { amount, tenure } = req.body;
    const user = await User.findById(req.session.userId);
    
    const interestRate = 8.5;
    const monthlyRate = interestRate / 12 / 100;
    const emiAmount = (parseFloat(amount) * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
                      (Math.pow(1 + monthlyRate, tenure) - 1);
    
    user.loans.push({
        amount: parseFloat(amount),
        interestRate,
        tenure: parseInt(tenure),
        emiAmount: emiAmount.toFixed(2)
    });
    
    user.balance += parseFloat(amount);
    user.transactions.push({
        type: 'loan',
        amount: parseFloat(amount),
        balance: user.balance,
        description: `Loan credited - ${tenure} months`,
        date: new Date()
    });
    
    await user.save();
    res.redirect('/bank/dashboard');
});

router.get('/fixed-deposit', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('fixed-deposit', { user, error: null });
});

router.post('/fixed-deposit', isAuthenticated, async (req, res) => {
    const { amount, tenure } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (user.balance < parseFloat(amount)) {
        return res.render('fixed-deposit', { user, error: 'Insufficient balance' });
    }
    
    const interestRate = 7.5;
    const maturityAmount = parseFloat(amount) * Math.pow(1 + interestRate / 100, parseInt(tenure));
    const maturityDate = new Date();
    maturityDate.setFullYear(maturityDate.getFullYear() + parseInt(tenure));
    
    user.balance -= parseFloat(amount);
    user.fixedDeposits.push({
        amount: parseFloat(amount),
        interestRate,
        tenure: parseInt(tenure),
        maturityAmount: maturityAmount.toFixed(2),
        maturityDate
    });
    
    user.transactions.push({
        type: 'fixed_deposit',
        amount: parseFloat(amount),
        balance: user.balance,
        description: `FD for ${tenure} years`,
        date: new Date()
    });
    
    await user.save();
    res.redirect('/bank/dashboard');
});

router.get('/bill-payment', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('bill-payment', { user, error: null });
});

router.post('/bill-payment', isAuthenticated, async (req, res) => {
    const { billType, amount, billNumber, paymentMethod, cardId } = req.body;
    const user = await User.findById(req.session.userId);
    
    const paymentAmount = parseFloat(amount);
    let paymentSource = 'Account Balance';
    
    if (paymentMethod === 'card' && cardId) {
        const card = user.cards.id(cardId);
        
        if (!card || !card.isActive) {
            return res.render('bill-payment', { user, error: 'Invalid or blocked card' });
        }
        
        if (card.cardType === 'credit') {
            if (card.availableCredit < paymentAmount) {
                return res.render('bill-payment', { user, error: 'Insufficient credit limit' });
            }
            card.availableCredit -= paymentAmount;
            paymentSource = `Credit Card (${card.cardNumber.slice(-4)})`;
        } else {
            if (user.balance < paymentAmount) {
                return res.render('bill-payment', { user, error: 'Insufficient balance' });
            }
            user.balance -= paymentAmount;
            paymentSource = `Debit Card (${card.cardNumber.slice(-4)})`;
        }
    } else {
        if (user.balance < paymentAmount) {
            return res.render('bill-payment', { user, error: 'Insufficient balance' });
        }
        user.balance -= paymentAmount;
    }
    
    user.transactions.push({
        type: 'bill_payment',
        amount: paymentAmount,
        balance: user.balance,
        description: `${billType} - ${billNumber} (Paid via ${paymentSource})`,
        category: billType.toLowerCase().replace(/\s+/g, '_'),
        date: new Date()
    });
    
    await user.save();
    res.redirect('/bank/dashboard');
});

router.get('/analytics', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('analytics', { user });
});

router.get('/transactions', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('transactions', { user });
});

router.get('/cards', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('cards', { user });
});

router.post('/cards/apply', isAuthenticated, async (req, res) => {
    const { cardType, creditLimit } = req.body;
    const user = await User.findById(req.session.userId);
    
    const cardNumber = '4' + Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join('');
    const cvv = Array.from({length: 3}, () => Math.floor(Math.random() * 10)).join('');
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 5);
    const expiry = `${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()}`;
    
    const newCard = {
        cardNumber,
        cardType,
        cardHolder: user.fullName.toUpperCase(),
        expiryDate: expiry,
        cvv,
        creditLimit: cardType === 'credit' ? parseFloat(creditLimit || 50000) : 0,
        availableCredit: cardType === 'credit' ? parseFloat(creditLimit || 50000) : 0,
        isActive: true
    };
    
    user.cards.push(newCard);
    await user.save();
    res.redirect('/bank/cards');
});

router.post('/cards/block/:cardId', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const card = user.cards.id(req.params.cardId);
    
    if (card) {
        card.isActive = false;
        await user.save();
    }
    
    res.redirect('/bank/cards');
});

router.get('/statement/download', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const { startDate, endDate, format } = req.query;
        
        // Get all transactions
        let allTransactions = [];
        
        if (user.transactions && Array.isArray(user.transactions)) {
            allTransactions = user.transactions.map(t => ({
                type: t.type,
                amount: t.amount,
                balance: t.balance,
                description: t.description,
                date: t.date,
                toAccount: t.toAccount
            }));
        }
        
        console.log('Total transactions in DB:', allTransactions.length);
        
        // Filter by date if provided
        let filteredTransactions = allTransactions;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include entire end date
            
            filteredTransactions = allTransactions.filter(t => {
                const tDate = new Date(t.date);
                return tDate >= start && tDate <= end;
            });
        }
        
        // Sort by date (newest first)
        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log('Filtered transactions:', filteredTransactions.length);
        
        if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=statement_${user.accountNumber}_${Date.now()}.pdf`);
            
            doc.pipe(res);
            
            // HEADER
            doc.fontSize(28).fillColor('#667eea').text('SECUREBANK', 50, 50);
            doc.fontSize(12).fillColor('#666').text('Your Trusted Banking Partner', 50, 85);
            
            // TITLE
            doc.moveDown(2);
            doc.fontSize(20).fillColor('#333').text('Account Statement', { align: 'center' });
            doc.moveDown(1);
            
            // ACCOUNT DETAILS BOX
            const boxY = doc.y;
            doc.rect(50, boxY, 495, 140).lineWidth(2).stroke('#667eea');
            doc.fillColor('#f8f9fa').rect(51, boxY + 1, 493, 138).fill();
            
            const detailsY = boxY + 20;
            doc.fillColor('#333').fontSize(11).font('Helvetica-Bold');
            
            doc.text('Account Holder:', 70, detailsY);
            doc.font('Helvetica').text(user.fullName, 200, detailsY);
            
            doc.font('Helvetica-Bold').text('Account Number:', 70, detailsY + 25);
            doc.font('Helvetica').text(user.accountNumber, 200, detailsY + 25);
            
            doc.font('Helvetica-Bold').text('Email:', 70, detailsY + 50);
            doc.font('Helvetica').text(user.email, 200, detailsY + 50);
            
            doc.font('Helvetica-Bold').text('Current Balance:', 70, detailsY + 75);
            doc.font('Helvetica').fillColor('#10b981').text(`₹${user.balance.toFixed(2)}`, 200, detailsY + 75);
            
            doc.fillColor('#333').font('Helvetica-Bold').text('Generated On:', 70, detailsY + 100);
            doc.font('Helvetica').text(new Date().toLocaleString(), 200, detailsY + 100);
            
            doc.y = boxY + 160;
            doc.moveDown(1.5);
            
            // TRANSACTIONS SECTION
            doc.fontSize(14).fillColor('#333').font('Helvetica-Bold').text('Transaction History', 50);
            doc.moveDown(0.5);
            
            // TABLE HEADER
            const tableTop = doc.y;
            doc.rect(50, tableTop, 495, 30).fillAndStroke('#667eea', '#667eea');
            
            doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
            doc.text('Date', 60, tableTop + 10, { width: 70 });
            doc.text('Type', 135, tableTop + 10, { width: 80 });
            doc.text('Amount', 220, tableTop + 10, { width: 70, align: 'right' });
            doc.text('Balance', 295, tableTop + 10, { width: 70, align: 'right' });
            doc.text('Description', 375, tableTop + 10, { width: 160 });
            
            let yPosition = tableTop + 35;
            
            // CHECK IF NO TRANSACTIONS
            if (filteredTransactions.length === 0) {
                doc.fillColor('#999').fontSize(12).font('Helvetica').text(
                    '📭 No transactions found for the selected period.', 
                    50, 
                    yPosition + 20, 
                    { align: 'center', width: 495 }
                );
                yPosition += 60;
            } else {
                // DRAW ALL TRANSACTIONS
                filteredTransactions.forEach((t, index) => {
                    // Check if need new page
                    if (yPosition > 710) {
                        doc.addPage();
                        yPosition = 50;
                        
                        // Repeat header on new page
                        doc.rect(50, yPosition, 495, 30).fillAndStroke('#667eea', '#667eea');
                        doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
                        doc.text('Date', 60, yPosition + 10, { width: 70 });
                        doc.text('Type', 135, yPosition + 10, { width: 80 });
                        doc.text('Amount', 220, yPosition + 10, { width: 70, align: 'right' });
                        doc.text('Balance', 295, yPosition + 10, { width: 70, align: 'right' });
                        doc.text('Description', 375, yPosition + 10, { width: 160 });
                        yPosition += 35;
                    }
                    
                    // Row background
                    const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';
                    doc.rect(50, yPosition, 495, 28).fillAndStroke(bgColor, bgColor);
                    
                    // Format data
                    const transDate = new Date(t.date);
                    const dateStr = transDate.toLocaleDateString('en-IN');
                    const timeStr = transDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const type = (t.type || 'N/A').replace('_', ' ').toUpperCase();
                    const amount = parseFloat(t.amount || 0).toFixed(2);
                    const balance = parseFloat(t.balance || 0).toFixed(2);
                    const description = (t.description || 'No description').substring(0, 50);
                    
                    // Draw transaction data
                    doc.fillColor('#333').fontSize(8).font('Helvetica');
                    doc.text(dateStr, 60, yPosition + 5, { width: 70 });
                    doc.fontSize(7).text(timeStr, 60, yPosition + 16, { width: 70 });
                    
                    doc.fontSize(8).text(type, 135, yPosition + 8, { width: 80 });
                    
                    // Color code amounts
                    if (['deposit', 'loan', 'received'].includes(t.type)) {
                        doc.fillColor('#10b981').font('Helvetica-Bold');
                        doc.text(`+₹${amount}`, 220, yPosition + 8, { width: 70, align: 'right' });
                    } else {
                        doc.fillColor('#ef4444').font('Helvetica-Bold');
                        doc.text(`-₹${amount}`, 220, yPosition + 8, { width: 70, align: 'right' });
                    }
                    
                    doc.fillColor('#333').font('Helvetica');
                    doc.text(`₹${balance}`, 295, yPosition + 8, { width: 70, align: 'right' });
                    doc.fontSize(7).text(description, 375, yPosition + 8, { width: 160 });
                    
                    yPosition += 28;
                });
            }
            
            // SUMMARY SECTION
            doc.moveDown(2);
            yPosition = doc.y + 20;
            
            if (yPosition > 680) {
                doc.addPage();
                yPosition = 50;
            }
            
            const totalDeposits = filteredTransactions
                .filter(t => ['deposit', 'loan', 'received'].includes(t.type))
                .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            
            const totalWithdrawals = filteredTransactions
                .filter(t => ['withdraw', 'transfer', 'bill_payment', 'fixed_deposit'].includes(t.type))
                .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            
            doc.rect(50, yPosition, 495, 75).fillAndStroke('#e0f2fe', '#3b82f6');
            doc.fontSize(12).fillColor('#333').text('Transaction Summary', 70, yPosition + 15);
            doc.fontSize(10).font('Helvetica');
            doc.fillColor('#10b981').text(`✅ Total Credits: ₹${totalDeposits.toFixed(2)}`, 70, yPosition + 40);
            doc.fillColor('#ef4444').text(`❌ Total Debits: ₹${totalWithdrawals.toFixed(2)}`, 280, yPosition + 40);
            doc.fillColor('#333').text(`📝 Total Transactions: ${filteredTransactions.length}`, 70, yPosition + 58);
            
            // FOOTER
            yPosition += 95;
            if (yPosition > 750) {
                doc.addPage();
                yPosition = 50;
            }
            
            doc.fontSize(9).fillColor('#aaa');
            doc.text('_'.repeat(95), 50, yPosition, { width: 495 });
            doc.fontSize(8).fillColor('#666').text('This is a computer-generated statement and does not require a signature.', 50, yPosition + 15, { align: 'center', width: 495 });
            doc.text('For queries: support@securebank.com | Tel: +91-1800-XXX-XXXX', 50, yPosition + 30, { align: 'center', width: 495 });
            doc.fontSize(7).fillColor('#999').text(`Document ID: ${user.accountNumber}-${Date.now()}`, 50, yPosition + 45, { align: 'center', width: 495 });
            
            doc.end();
            
        } else {
            // TEXT FORMAT
            let statement = `SECUREBANK - ACCOUNT STATEMENT\n`;
            statement += `${'='.repeat(80)}\n\n`;
            statement += `Account Holder: ${user.fullName}\n`;
            statement += `Account Number: ${user.accountNumber}\n`;
            statement += `Current Balance: ₹${user.balance.toFixed(2)}\n`;
            statement += `Statement Date: ${new Date().toLocaleDateString()}\n`;
            
            if (startDate && endDate) {
                statement += `Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}\n`;
            }
            
            statement += `\n${'='.repeat(80)}\n\n`;
            statement += `Date\t\tType\t\tAmount\t\tBalance\t\tDescription\n`;
            statement += `${'-'.repeat(80)}\n`;
            
            if (filteredTransactions.length === 0) {
                statement += `No transactions found.\n`;
            } else {
                filteredTransactions.forEach(t => {
                    const date = new Date(t.date).toLocaleDateString();
                    const type = t.type.toUpperCase().padEnd(15);
                    const amount = `₹${t.amount.toFixed(2)}`.padEnd(12);
                    const balance = `₹${t.balance.toFixed(2)}`.padEnd(12);
                    statement += `${date}\t${type}\t${amount}\t${balance}\t${t.description}\n`;
                });
            }
            
            statement += `\n${'='.repeat(80)}\n`;
            statement += `Total Transactions: ${filteredTransactions.length}\n`;
            statement += `End of Statement\n`;
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename=statement_${user.accountNumber}_${Date.now()}.txt`);
            res.send(statement);
        }
    } catch (error) {
        console.error('Statement generation error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).send('Error generating statement: ' + error.message);
    }
});

// ==================== BENEFICIARY MANAGEMENT ====================

router.get('/beneficiaries', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('beneficiaries', { user });
});

router.post('/beneficiaries/add', isAuthenticated, async (req, res) => {
    const { name, accountNumber, bankName, ifscCode, nickname } = req.body;
    const user = await User.findById(req.session.userId);
    
    user.beneficiaries.push({
        name,
        accountNumber,
        bankName,
        ifscCode,
        nickname
    });
    
    await user.save();
    res.redirect('/bank/beneficiaries');
});

router.post('/beneficiaries/delete/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    user.beneficiaries.pull(req.params.id);
    await user.save();
    res.redirect('/bank/beneficiaries');
});

router.get('/transfer/beneficiary/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const beneficiary = user.beneficiaries.id(req.params.id);
    res.render('transfer-beneficiary', { user, beneficiary, error: null });
});

router.post('/transfer/beneficiary/:id', isAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const user = await User.findById(req.session.userId);
    const beneficiary = user.beneficiaries.id(req.params.id);
    
    if (user.balance < parseFloat(amount)) {
        return res.render('transfer-beneficiary', { user, beneficiary, error: 'Insufficient balance' });
    }
    
    const recipient = await User.findOne({ accountNumber: beneficiary.accountNumber });
    
    if (recipient) {
        user.balance -= parseFloat(amount);
        recipient.balance += parseFloat(amount);
        
        user.transactions.push({
            type: 'transfer',
            amount: parseFloat(amount),
            balance: user.balance,
            description: `Transfer to ${beneficiary.name}`,
            toAccount: beneficiary.accountNumber,
            date: new Date()
        });
        
        recipient.transactions.push({
            type: 'received',
            amount: parseFloat(amount),
            balance: recipient.balance,
            description: `Received from ${user.fullName}`,
            date: new Date()
        });
        
        await user.save();
        await recipient.save();
    }
    
    res.redirect('/bank/dashboard');
});

// ==================== RECURRING DEPOSITS ====================

router.get('/recurring-deposit', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('recurring-deposit', { user, error: null });
});

router.post('/recurring-deposit/create', isAuthenticated, async (req, res) => {
    const { monthlyDeposit, tenure } = req.body;
    const user = await User.findById(req.session.userId);
    
    const amount = parseFloat(monthlyDeposit);
    if (user.balance < amount) {
        return res.render('recurring-deposit', { user, error: 'Insufficient balance for first deposit' });
    }
    
    const interestRate = 7;
    const n = parseInt(tenure);
    const r = interestRate / 400; // Quarterly rate
    const quarters = n * 4;
    
    // RD Maturity Formula: M = P × n × [(1 + r/4)^(4n) - 1] / (1 - (1 + r/4)^(-1/3))
    const maturityAmount = amount * (Math.pow(1 + r, quarters) - 1) / (1 - Math.pow(1 + r, -1/3));
    
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + n);
    
    user.balance -= amount;
    
    user.recurringDeposits.push({
        monthlyDeposit: amount,
        tenure: n,
        interestRate,
        maturityAmount: maturityAmount.toFixed(2),
        maturityDate,
        deposits: [{ amount, date: new Date() }],
        status: 'active'
    });
    
    user.transactions.push({
        type: 'recurring_deposit',
        amount,
        balance: user.balance,
        description: `RD - First installment (${n} months)`,
        date: new Date()
    });
    
    await user.save();
    res.redirect('/bank/recurring-deposit');
});

router.post('/recurring-deposit/pay/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const rd = user.recurringDeposits.id(req.params.id);
    
    if (rd && rd.status === 'active') {
        if (user.balance < rd.monthlyDeposit) {
            return res.redirect('/bank/recurring-deposit?error=insufficient');
        }
        
        user.balance -= rd.monthlyDeposit;
        rd.deposits.push({ amount: rd.monthlyDeposit, date: new Date() });
        
        user.transactions.push({
            type: 'recurring_deposit',
            amount: rd.monthlyDeposit,
            balance: user.balance,
            description: `RD installment #${rd.deposits.length}`,
            date: new Date()
        });
        
        await user.save();
    }
    
    res.redirect('/bank/recurring-deposit');
});

// ==================== BUDGET TRACKING ====================

router.get('/budget', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Calculate spending by category for current month
    const monthTransactions = user.transactions.filter(t => {
        const tMonth = new Date(t.date).toISOString().slice(0, 7);
        return tMonth === currentMonth && t.category;
    });
    
    const spending = {};
    monthTransactions.forEach(t => {
        spending[t.category] = (spending[t.category] || 0) + t.amount;
    });
    
    res.render('budget', { user, spending, currentMonth });
});

router.post('/budget/create', isAuthenticated, async (req, res) => {
    const { category, limit } = req.body;
    const user = await User.findById(req.session.userId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Check if budget exists for this category and month
    const existingBudget = user.budgets.find(b => b.category === category && b.month === currentMonth);
    
    if (existingBudget) {
        existingBudget.limit = parseFloat(limit);
    } else {
        user.budgets.push({
            category,
            limit: parseFloat(limit),
            spent: 0,
            month: currentMonth,
            alerts: true
        });
    }
    
    await user.save();
    res.redirect('/bank/budget');
});

router.post('/budget/delete/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    user.budgets.pull(req.params.id);
    await user.save();
    res.redirect('/bank/budget');
});

// ==================== INVESTMENTS ====================

router.get('/investments', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('investments', { user, error: null });
});

router.post('/investments/buy', isAuthenticated, async (req, res) => {
    const { type, name, amount, units } = req.body;
    const user = await User.findById(req.session.userId);
    
    const investAmount = parseFloat(amount);
    
    if (user.balance < investAmount) {
        return res.render('investments', { user, error: 'Insufficient balance' });
    }
    
    user.balance -= investAmount;
    
    user.investments.push({
        type,
        name,
        amount: investAmount,
        currentValue: investAmount,
        units: parseFloat(units) || 1,
        purchaseDate: new Date(),
        status: 'active'
    });
    
    user.transactions.push({
        type: 'investment',
        amount: investAmount,
        balance: user.balance,
        description: `${type.replace('_', ' ').toUpperCase()} - ${name}`,
        category: 'investment',
        date: new Date()
    });
    
    await user.save();
    res.redirect('/bank/investments');
});

router.post('/investments/sell/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const investment = user.investments.id(req.params.id);
    
    if (investment && investment.status === 'active') {
        user.balance += investment.currentValue;
        investment.status = 'sold';
        
        const profit = investment.currentValue - investment.amount;
        
        user.transactions.push({
            type: 'investment_sell',
            amount: investment.currentValue,
            balance: user.balance,
            description: `Sold ${investment.name} (Profit: ₹${profit.toFixed(2)})`,
            category: 'investment',
            date: new Date()
        });
        
        await user.save();
    }
    
    res.redirect('/bank/investments');
});

// ==================== NOTIFICATIONS ====================

router.get('/notifications', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('notifications', { user });
});

router.post('/notifications/mark-read/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const notification = user.notifications.id(req.params.id);
    
    if (notification) {
        notification.isRead = true;
        await user.save();
    }
    
    res.redirect('/bank/notifications');
});

router.post('/notifications/mark-all-read', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    user.notifications.forEach(n => n.isRead = true);
    await user.save();
    res.redirect('/bank/notifications');
});

// ==================== QR CODE PAYMENTS ====================

router.get('/qr-pay', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    
    let qrCode;
    let hasCustomQR = false;
    
    // Check if user has uploaded custom QR code
    if (user.customQRCode) {
        qrCode = '/uploads/qr-codes/' + user.customQRCode;
        hasCustomQR = true;
    } else {
        // Generate default QR code
        const paymentData = JSON.stringify({
            accountNumber: user.accountNumber,
            name: user.fullName,
            upiId: `${user.accountNumber}@securebank`
        });
        
        qrCode = await QRCode.toDataURL(paymentData);
    }
    
    res.render('qr-pay', { user, qrCode, hasCustomQR });
});

router.post('/qr-pay/upload', isAuthenticated, upload.single('qrImage'), async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (req.file) {
            // Delete old QR code if exists
            if (user.customQRCode) {
                const fs = require('fs');
                const oldPath = path.join(__dirname, '../public/uploads/qr-codes/', user.customQRCode);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            
            user.customQRCode = req.file.filename;
            await user.save();
        }
        
        res.redirect('/bank/qr-pay');
    } catch (error) {
        console.error('QR upload error:', error);
        res.redirect('/bank/qr-pay?error=upload');
    }
});

router.post('/qr-pay/remove', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (user.customQRCode) {
            const fs = require('fs');
            const qrPath = path.join(__dirname, '../public/uploads/qr-codes/', user.customQRCode);
            if (fs.existsSync(qrPath)) {
                fs.unlinkSync(qrPath);
            }
            
            user.customQRCode = null;
            await user.save();
        }
        
        res.redirect('/bank/qr-pay');
    } catch (error) {
        console.error('QR remove error:', error);
        res.redirect('/bank/qr-pay?error=remove');
    }
});

// ==================== REFERRAL PROGRAM ====================

router.get('/referral', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    
    if (!user.referralCode) {
        const { v4: uuidv4 } = require('uuid');
        user.referralCode = uuidv4().slice(0, 8).toUpperCase();
        await user.save();
    }
    
    res.render('referral', { user });
});

// ==================== LOAN EMI PAYMENT ====================

router.get('/loans', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('loan-management', { user });
});

router.post('/loans/pay-emi/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const loan = user.loans.id(req.params.id);
    
    if (loan && loan.status === 'active') {
        const emiAmount = parseFloat(loan.emiAmount);
        
        if (user.balance < emiAmount) {
            return res.redirect('/bank/loans?error=insufficient');
        }
        
        user.balance -= emiAmount;
        loan.paidEmis += 1;
        
        loan.payments.push({
            amount: emiAmount,
            date: new Date(),
            paidBy: 'Account Balance'
        });
        
        if (loan.paidEmis >= loan.tenure) {
            loan.status = 'closed';
        }
        
        user.transactions.push({
            type: 'loan_payment',
            amount: emiAmount,
            balance: user.balance,
            description: `EMI Payment - ${loan.loanType} loan (${loan.paidEmis}/${loan.tenure})`,
            category: 'loan',
            date: new Date()
        });
        
        await user.save();
    }
    
    res.redirect('/bank/loans');
});

// ==================== TRANSACTION RECEIPT ====================

router.get('/transaction/receipt/:id', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const transaction = user.transactions.id(req.params.id);
    
    if (!transaction) {
        return res.redirect('/bank/transactions');
    }
    
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt_${transaction._id}.pdf`);
    
    doc.pipe(res);
    
    // Header
    doc.fontSize(24).fillColor('#667eea').text('SECUREBANK', 50, 50);
    doc.fontSize(10).fillColor('#666').text('Transaction Receipt', 50, 80);
    
    doc.moveDown(2);
    
    // Receipt Box
    doc.rect(50, doc.y, 495, 200).stroke('#667eea');
    
    const startY = doc.y + 20;
    doc.fontSize(12).fillColor('#333');
    
    doc.text(`Receipt Number: ${transaction._id}`, 70, startY);
    doc.text(`Date: ${new Date(transaction.date).toLocaleString()}`, 70, startY + 25);
    doc.text(`Transaction Type: ${transaction.type.toUpperCase()}`, 70, startY + 50);
    doc.text(`Amount: ₹${transaction.amount.toFixed(2)}`, 70, startY + 75);
    doc.text(`Balance After: ₹${transaction.balance.toFixed(2)}`, 70, startY + 100);
    doc.text(`Description: ${transaction.description}`, 70, startY + 125);
    doc.text(`Account: ${user.accountNumber}`, 70, startY + 150);
    
    doc.moveDown(15);
    
    doc.fontSize(8).fillColor('#999').text('This is a computer-generated receipt.', { align: 'center' });
    
    doc.end();
});

// ==================== SCHEDULED PAYMENTS ====================

router.get('/scheduled-payments', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('scheduled-payments', { user });
});

// ==================== SUPPORT TICKETS ====================

router.get('/support', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render('support', { user });
});

module.exports = router;

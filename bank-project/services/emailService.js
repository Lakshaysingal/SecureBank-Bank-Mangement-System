const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '<your mail>', // Replace with your email
        pass: '<mail pass>' // Replace with your app password
    }
});

// Send OTP Email
exports.sendOTP = async (email, otp, name) => {
    const mailOptions = {
        from: 'SecureBank <your-email@gmail.com>',
        to: email,
        subject: 'Your OTP for SecureBank Login',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">SecureBank</h2>
                <p>Hello ${name},</p>
                <p>Your One-Time Password (OTP) for login is:</p>
                <h1 style="color: #667eea; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                <p>This OTP is valid for 10 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <hr>
                <small style="color: #666;">SecureBank - Your Trusted Banking Partner</small>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Send Transaction Alert
exports.sendTransactionAlert = async (email, name, transaction) => {
    const mailOptions = {
        from: 'SecureBank <your-email@gmail.com>',
        to: email,
        subject: `Transaction Alert: ${transaction.type.toUpperCase()}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Transaction Alert</h2>
                <p>Dear ${name},</p>
                <p>A transaction has been completed on your account:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background: #f0f0f0;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Type</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${transaction.type.toUpperCase()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">₹${transaction.amount.toFixed(2)}</td>
                    </tr>
                    <tr style="background: #f0f0f0;">
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Balance</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">₹${transaction.balance.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Date</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${new Date(transaction.date).toLocaleString()}</td>
                    </tr>
                </table>
                <p>If you didn't make this transaction, please contact us immediately.</p>
                <hr>
                <small style="color: #666;">SecureBank - Keeping your money safe</small>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Send Monthly Statement
exports.sendMonthlyStatement = async (email, name, accountNumber, transactions, balance) => {
    const mailOptions = {
        from: 'SecureBank <your-email@gmail.com>',
        to: email,
        subject: 'Your Monthly Account Statement',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Monthly Account Statement</h2>
                <p>Dear ${name},</p>
                <p>Please find your monthly account statement below:</p>
                <p><strong>Account Number:</strong> ${accountNumber}</p>
                <p><strong>Current Balance:</strong> ₹${balance.toFixed(2)}</p>
                <p><strong>Total Transactions:</strong> ${transactions.length}</p>
                <p>Login to your account to download the detailed statement.</p>
                <hr>
                <small style="color: #666;">SecureBank</small>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Send Welcome Email
exports.sendWelcomeEmail = async (email, name, accountNumber) => {
    const mailOptions = {
        from: 'SecureBank <your-email@gmail.com>',
        to: email,
        subject: 'Welcome to SecureBank!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Welcome to SecureBank!</h2>
                <p>Dear ${name},</p>
                <p>Congratulations! Your account has been successfully created.</p>
                <p><strong>Account Number:</strong> ${accountNumber}</p>
                <p><strong>Initial Balance:</strong> ₹1000.00</p>
                <p>You can now enjoy all our banking services.</p>
                <a href="http://localhost:3000/auth/login" style="display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Login Now</a>
                <hr>
                <small style="color: #666;">SecureBank - Your Trusted Banking Partner</small>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

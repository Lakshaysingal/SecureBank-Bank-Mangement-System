document.getElementById('fdAmount').addEventListener('input', calculateMaturity);
document.getElementById('fdTenure').addEventListener('change', calculateMaturity);

function calculateMaturity() {
    const amount = parseFloat(document.getElementById('fdAmount').value);
    const tenure = parseInt(document.getElementById('fdTenure').value);
    
    if (amount && tenure) {
        const rate = 7.5;
        const maturityAmount = amount * Math.pow(1 + rate / 100, tenure);
        const interest = maturityAmount - amount;
        
        document.getElementById('maturityPreview').innerHTML = `
            <p><strong>Maturity Amount:</strong> ₹${maturityAmount.toFixed(2)}</p>
            <p><strong>Interest Earned:</strong> ₹${interest.toFixed(2)}</p>
            <p><strong>Investment Period:</strong> ${tenure} years</p>
        `;
    }
}

document.getElementById('loanAmount').addEventListener('input', calculateEMI);
document.getElementById('tenure').addEventListener('change', calculateEMI);

function calculateEMI() {
    const amount = parseFloat(document.getElementById('loanAmount').value);
    const tenure = parseInt(document.getElementById('tenure').value);
    
    if (amount && tenure) {
        const rate = 8.5 / 12 / 100;
        const emi = (amount * rate * Math.pow(1 + rate, tenure)) / (Math.pow(1 + rate, tenure) - 1);
        const totalPayment = emi * tenure;
        const totalInterest = totalPayment - amount;
        
        document.getElementById('emiPreview').innerHTML = `
            <p><strong>Monthly EMI:</strong> ₹${emi.toFixed(2)}</p>
            <p><strong>Total Interest:</strong> ₹${totalInterest.toFixed(2)}</p>
            <p><strong>Total Payment:</strong> ₹${totalPayment.toFixed(2)}</p>
        `;
    }
}

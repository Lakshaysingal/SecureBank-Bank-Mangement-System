function showApplyModal() {
    document.getElementById('applyModal').style.display = 'block';
}

function closeApplyModal() {
    document.getElementById('applyModal').style.display = 'none';
}

function toggleCreditLimit() {
    const cardType = document.getElementById('cardType').value;
    const creditLimitGroup = document.getElementById('creditLimitGroup');
    
    if (cardType === 'credit') {
        creditLimitGroup.style.display = 'block';
    } else {
        creditLimitGroup.style.display = 'none';
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('applyModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

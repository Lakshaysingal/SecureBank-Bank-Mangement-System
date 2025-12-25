function showDownloadModal() {
    document.getElementById('downloadModal').style.display = 'block';
    
    // Set default dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    
    document.querySelector('input[name="endDate"]').valueAsDate = endDate;
    document.querySelector('input[name="startDate"]').valueAsDate = startDate;
}

function closeDownloadModal() {
    document.getElementById('downloadModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('downloadModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // --- Element Selectors ---
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const form = document.getElementById('upload-form');
    const uploadInstructions = document.getElementById('upload-instructions');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const cancelImage = document.getElementById('cancel-image');
    const confidenceSlider = document.getElementById('confidence-threshold');
    const confidenceValue = document.getElementById('confidence-value');
    const detectObjectsCheck = document.getElementById('detect-objects');
    const detectPosesCheck = document.getElementById('detect-poses');
    const detectEmotionsCheck = document.getElementById('detect-emotions');
    const performanceIndicator = document.getElementById('performance-indicator');

    // --- File Handling & Preview ---
    function handleFile(file) {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if(imagePreview) imagePreview.src = e.target.result;
                if(uploadInstructions) uploadInstructions.classList.add('d-none');
                if(imagePreviewContainer) imagePreviewContainer.classList.remove('d-none');
                if(uploadZone) uploadZone.style.padding = '10px';
            };
            reader.readAsDataURL(file);
        }
    }

    function resetUploadZone() {
        if(fileInput) fileInput.value = '';
        if(imagePreview) imagePreview.src = '#';
        if(imagePreviewContainer) imagePreviewContainer.classList.add('d-none');
        if(uploadInstructions) uploadInstructions.classList.remove('d-none');
        if(uploadZone) uploadZone.style.padding = '60px 20px';
    }

    // --- Performance & Confidence UI ---
    function updateConfidenceValue() {
        if (confidenceSlider && confidenceValue) {
            confidenceValue.textContent = confidenceSlider.value;
        }
    }

    function updatePerformanceIndicator() {
        if (!performanceIndicator || !detectObjectsCheck || !detectPosesCheck || !detectEmotionsCheck) return;

        const hasPoses = detectPosesCheck.checked;
        const hasEmotions = detectEmotionsCheck.checked;
        const hasObjects = detectObjectsCheck.checked;

        let level = 'None';
        let className = 'text-bg-light';

        if (hasPoses) {
            level = 'High';
            className = 'text-bg-warning';
            if (hasObjects && hasEmotions) {
                level = 'Very High';
                className = 'text-bg-danger';
            }
        } else if (hasObjects && hasEmotions) {
            level = 'Moderate';
            className = 'text-bg-info';
        } else if (hasObjects || hasEmotions) {
            level = 'Low';
            className = 'text-bg-success';
        }

        performanceIndicator.textContent = `Performance Impact: ${level}`;
        performanceIndicator.className = `badge rounded-pill ${className}`;
    }

    // --- Event Listeners ---
    if (uploadZone) {
        uploadZone.addEventListener('click', (e) => {
            if (e.target.id !== 'cancel-image' && !e.target.closest('#cancel-image')) {
                if (fileInput) fileInput.click();
            }
        });
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                if (fileInput) fileInput.files = files;
                handleFile(files[0]);
            }
        });
    }

    if (cancelImage) {
        cancelImage.addEventListener('click', (e) => { e.stopPropagation(); resetUploadZone(); });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!fileInput || !fileInput.files || !fileInput.files.length) {
                alert("Please select or drop an image first.");
                return;
            }
            const formData = new FormData(form);
            const submitButton = form.querySelector('input[type="submit"]');
            if (submitButton) {
                submitButton.value = 'Analyzing...';
                submitButton.disabled = true;
            }
            fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert('Error: ' + data.error);
                } else {
                    sessionStorage.setItem('detectionResult', JSON.stringify(data));
                    window.location.href = '/result';
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An unexpected error occurred.');
            })
            .finally(() => {
                 if (submitButton) {
                    submitButton.value = 'Upload and Analyze';
                    submitButton.disabled = false;
                }
            });
        });
    }

    if (confidenceSlider) {
        confidenceSlider.addEventListener('input', updateConfidenceValue);
    }

    [detectObjectsCheck, detectPosesCheck, detectEmotionsCheck].forEach(check => {
        if (check) check.addEventListener('change', updatePerformanceIndicator);
    });

    // --- Initial State Setup ---
    updateConfidenceValue();
    updatePerformanceIndicator();
});
document.addEventListener('DOMContentLoaded', function() {
    const image = document.getElementById('result-image');
    const canvas = document.getElementById('result-canvas');
    const ctx = canvas.getContext('2d');
    const imageContainer = document.getElementById('image-container');

    const tabContainer = document.getElementById('myTab');
    const tabContent = document.getElementById('myTabContent');

    const tabs = {
        objects: { 
            tab: document.getElementById('objects-tab'), 
            pane: document.getElementById('objects'), 
            list: document.getElementById('object-list'),
            dataKey: 'detected_objects',
            name: 'Objects'
        },
        emotions: { 
            tab: document.getElementById('emotions-tab'), 
            pane: document.getElementById('emotions'), 
            list: document.getElementById('emotion-list'),
            dataKey: 'emotions',
            name: 'Emotions'
        },
        poses: { 
            tab: document.getElementById('poses-tab'), 
            pane: document.getElementById('poses'), 
            list: document.getElementById('pose-list'),
            dataKey: 'poses',
            name: 'Poses'
        }
    };

    let detectionData = {};
    let recordId = null;

    const SKELETON = [
        [15, 13], [13, 11], [16, 14], [14, 12], [11, 12], [5, 11], [6, 12], [5, 6],
        [5, 7], [6, 8], [7, 9], [8, 10], [1, 2], [0, 1], [0, 2], [1, 3], [2, 4]
    ];

    function draw(highlightedObjectIndex = -1, highlightedEmotionIndex = -1, highlightedPoseIndex = -1) {
        if (!canvas || !ctx || !image.complete || image.naturalWidth === 0) return;
        
        const scale = image.width / image.naturalWidth;
        canvas.width = image.width;
        canvas.height = image.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detectionData.detected_objects) {
            detectionData.detected_objects.forEach((obj, index) => {
                ctx.globalAlpha = (highlightedObjectIndex !== -1 && index !== highlightedObjectIndex) ? 0.3 : 1.0;
                const [x1, y1, x2, y2] = obj.box.map(coord => coord * scale);
                const label = `${obj.class_name} (${obj.score.toFixed(2)})`;
                ctx.strokeStyle = obj.color;
                ctx.lineWidth = (index === highlightedObjectIndex) ? 4 : 2;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                
                ctx.font = 'bold 14px Poppins';
                const textWidth = ctx.measureText(label).width;
                const textX = x1;
                const textY = y1 > 20 ? y1 - 5 : y1 + 15;

                ctx.fillStyle = obj.color;
                ctx.fillRect(textX - 2, textY - 14, textWidth + 4, 18);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, textX, textY);
            });
        }

        if (detectionData.emotions) {
            detectionData.emotions.forEach((emotion, index) => {
                ctx.globalAlpha = (highlightedEmotionIndex !== -1 && index !== highlightedEmotionIndex) ? 0.3 : 1.0;
                const [x, y, w, h] = emotion.box.map(coord => coord * scale);
                const label = emotion.emotion;
                ctx.strokeStyle = '#FF3838';
                ctx.lineWidth = (index === highlightedEmotionIndex) ? 4 : 2;
                ctx.strokeRect(x, y, w, h);

                ctx.font = 'bold 16px Poppins';
                const textWidth = ctx.measureText(label).width;
                const textX = x;
                const textY = y > 20 ? y - 5 : y + h + 20;

                ctx.fillStyle = '#FF3838';
                ctx.fillRect(textX - 2, textY - 16, textWidth + 4, 20);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, textX, textY);
            });
        }

        if (detectionData.poses) {
            detectionData.poses.forEach((pose, index) => {
                ctx.globalAlpha = (highlightedPoseIndex !== -1 && index !== highlightedPoseIndex) ? 0.3 : 1.0;
                const keypoints = pose.keypoints;
                ctx.strokeStyle = '#3498DB';
                ctx.lineWidth = (index === highlightedPoseIndex) ? 3 : 1.5;
                SKELETON.forEach(pair => {
                    const p1 = keypoints[pair[0]];
                    const p2 = keypoints[pair[1]];
                    if (p1 && p2 && p1[2] > 0 && p2[2] > 0) {
                        ctx.beginPath();
                        ctx.moveTo(Number(p1[0]) * scale, Number(p1[1]) * scale);
                        ctx.lineTo(Number(p2[0]) * scale, Number(p2[1]) * scale);
                        ctx.stroke();
                    }
                });
                keypoints.forEach(kp => {
                    if (kp && kp[2] > 0) {
                        ctx.fillStyle = '#E74C3C';
                        ctx.beginPath();
                        ctx.arc(Number(kp[0]) * scale, Number(kp[1]) * scale, 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                });
            });
        }
        ctx.globalAlpha = 1.0;
    }

    function verifyDetection(recId, objIndex, button) {
        fetch('/verify_detection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id: recId, object_index: objIndex })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                button.classList.remove('btn-outline-success');
                button.classList.add('btn-success', 'active');
                button.disabled = true;
                button.textContent = 'Verified';
                button.title = 'Verified';
            } else {
                alert('Failed to verify detection.');
            }
        })
        .catch(err => {
            console.error('Verification error:', err);
            alert('An error occurred during verification.');
        });
    }

    function populateLists() {
        let hasAnyResults = false;
        let firstVisibleTab = null;

        Object.values(tabs).forEach(t => {
            if(t.tab) t.tab.classList.remove('active');
            if(t.pane) t.pane.classList.remove('show', 'active');
        });

        Object.values(tabs).forEach(tabInfo => {
            const data = detectionData[tabInfo.dataKey];
            const wasRequested = data !== undefined;

            if (!wasRequested) {
                if(tabInfo.tab) tabInfo.tab.style.display = 'none';
                return;
            }

            hasAnyResults = true;
            if (!firstVisibleTab) firstVisibleTab = tabInfo;
            if(tabInfo.tab) tabInfo.tab.style.display = 'block';

            tabInfo.list.innerHTML = ''; // Clear list

            if (data && data.length > 0) {
                if (tabInfo.dataKey === 'detected_objects') {
                    data.forEach((obj, index) => {
                        const listItem = document.createElement('li');
                        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                        listItem.innerHTML = `
                            <span>
                                <span style="background-color: ${obj.color}; display: inline-block; width: 20px; height: 15px; margin-right: 10px; vertical-align: middle; border: 1px solid #555;"></span>
                                ${obj.class_name}
                            </span>
                            <div class="d-flex align-items-center">
                                <span class="badge bg-primary rounded-pill me-3">${obj.score.toFixed(2)}</span>
                                <button class="btn btn-sm ${obj.verified ? 'btn-success active' : 'btn-outline-success'} verify-btn" title="${obj.verified ? 'Verified' : 'Verify this detection'}" ${obj.verified ? 'disabled' : ''}>
                                    ${obj.verified ? 'Verified' : '✓'}
                                </button>
                            </div>`;
                        listItem.querySelector('.verify-btn').addEventListener('click', (e) => { 
                            e.stopPropagation(); 
                            verifyDetection(recordId, index, e.currentTarget); 
                        });
                        listItem.addEventListener('mouseenter', () => draw(index, -1, -1));
                        listItem.addEventListener('mouseleave', () => draw());
                        tabInfo.list.appendChild(listItem);
                    });
                } else if (tabInfo.dataKey === 'emotions') {
                    data.forEach((emotion, index) => {
                        const listItem = document.createElement('li');
                        listItem.className = 'list-group-item';
                        listItem.textContent = emotion.emotion;
                        listItem.addEventListener('mouseenter', () => draw(-1, index, -1));
                        listItem.addEventListener('mouseleave', () => draw());
                        tabInfo.list.appendChild(listItem);
                    });
                } else if (tabInfo.dataKey === 'poses') {
                    data.forEach((pose, index) => {
                        const listItem = document.createElement('li');
                        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                        listItem.innerHTML = `<span>Person ${index + 1}</span><span class="badge bg-primary rounded-pill">${pose.score.toFixed(2)}</span>`;
                        listItem.addEventListener('mouseenter', () => draw(-1, -1, index));
                        listItem.addEventListener('mouseleave', () => draw());
                        tabInfo.list.appendChild(listItem);
                    });
                }
            } else {
                tabInfo.list.innerHTML = `<li class="list-group-item text-muted">No ${tabInfo.name.toLowerCase()} found. Try adjusting the confidence threshold.</li>`;
            }
        });

        if (!hasAnyResults) {
            if(tabContainer) tabContainer.style.display = 'none';
            if(tabContent) tabContent.innerHTML = '<div class="alert alert-info">No analysis was performed. Please upload an image and select an analysis type.</div>';
        } else if (firstVisibleTab) {
            firstVisibleTab.tab.classList.add('active');
            firstVisibleTab.pane.classList.add('show', 'active');
        }
    }

    function init(data) {
        detectionData = data;
        recordId = detectionData.record_id;

        if (image) {
            image.onerror = () => {
                console.error("Failed to load image:", detectionData.result_image);
                imageContainer.innerHTML = '<div class="alert alert-danger">Failed to load processed image. The file may be missing or corrupt.</div>';
            };
            image.onload = () => {
                if(canvas) {
                    draw();
                    window.addEventListener('resize', draw); // Redraw on resize
                }
            };
            image.src = detectionData.result_image;
            if (image.complete) image.onload(); // If image is cached, onload might not fire
        }
        
        populateLists();
    }

    const results = sessionStorage.getItem('detectionResult');
    if (results) {
        try {
            init(JSON.parse(results));
        } catch (e) {
            console.error("Error parsing detection result:", e);
            if(tabContent) tabContent.innerHTML = '<div class="alert alert-danger">Error loading results. Please try again.</div>';
        }
    } else {
        if(imageContainer) imageContainer.innerHTML = '<div class="alert alert-warning">No detection data found. Please <a href="/" class="alert-link">upload an image</a> to begin.</div>';
        if(tabContainer) tabContainer.style.display = 'none';
        if(tabContent) tabContent.style.display = 'none';
    }
});
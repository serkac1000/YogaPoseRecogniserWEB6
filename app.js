let model, webcam, ctx, labelContainer, maxPredictions;
const poseImages = new Map();
let currentPoseImage = null;
let currentPoseIndex = 0;
let poseHoldTimer = 3;
let lastPoseTime = 0;
const poseOrder = ['Pose1', 'Pose2', 'Pose3', 'Pose4', 'Pose5', 'Pose6', 'Pose7'];
let audioEnabled = true;
let recognitionDelay = 3;
let accuracyThreshold = 0.5;
let isRecognitionRunning = false;

// Event Listeners
document.getElementById('start-button').addEventListener('click', startRecognition);
document.getElementById('back-button').addEventListener('click', showSettingsPage);
document.getElementById('start-recognition-button').addEventListener('click', startCameraRecognition);
document.getElementById('stop-recognition-button').addEventListener('click', stopCameraRecognition);
document.getElementById('audio-toggle').addEventListener('change', (e) => {
    audioEnabled = e.target.checked;
    localStorage.setItem('audioEnabled', audioEnabled);
});
document.getElementById('delay-setting').addEventListener('input', (e) => {
    recognitionDelay = parseFloat(e.target.value);
    localStorage.setItem('recognitionDelay', recognitionDelay);
});
document.getElementById('accuracy-setting').addEventListener('input', (e) => {
    accuracyThreshold = parseFloat(e.target.value) / 100;
    localStorage.setItem('accuracyThreshold', accuracyThreshold);
});
document.getElementById('model-url').addEventListener('input', (e) => {
    localStorage.setItem('modelUrl', e.target.value);
});

// File input listeners
document.getElementById('pose1-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose1'));
document.getElementById('pose2-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose2'));
document.getElementById('pose3-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose3'));
document.getElementById('pose4-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose4'));
document.getElementById('pose5-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose5'));
document.getElementById('pose6-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose6'));
document.getElementById('pose7-image').addEventListener('change', (e) => handleImageUpload(e, 'Pose7'));

function handleImageUpload(event, poseName) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById(`${poseName.toLowerCase()}-preview`);
            preview.src = e.target.result;
            preview.style.display = 'block';
            poseImages.set(poseName, e.target.result);
            localStorage.setItem(`pose_${poseName}`, e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

// Load saved images and settings on page load
window.addEventListener('DOMContentLoaded', () => {
    ['Pose1', 'Pose2', 'Pose3', 'Pose4', 'Pose5', 'Pose6', 'Pose7'].forEach(poseName => {
        const savedImage = localStorage.getItem(`pose_${poseName}`);
        if (savedImage) {
            const preview = document.getElementById(`${poseName.toLowerCase()}-preview`);
            preview.src = savedImage;
            preview.style.display = 'block';
            poseImages.set(poseName, savedImage);
        }
    });

    // Load model URL setting
    const savedModelUrl = localStorage.getItem('modelUrl');
    if (savedModelUrl !== null) {
        document.getElementById('model-url').value = savedModelUrl;
    }

    // Load audio setting
    const savedAudioEnabled = localStorage.getItem('audioEnabled');
    if (savedAudioEnabled !== null) {
        audioEnabled = savedAudioEnabled === 'true';
        document.getElementById('audio-toggle').checked = audioEnabled;
    }

    // Load delay setting
    const savedDelay = localStorage.getItem('recognitionDelay');
    if (savedDelay !== null) {
        recognitionDelay = parseFloat(savedDelay);
        document.getElementById('delay-setting').value = recognitionDelay;
    } else {
        document.getElementById('delay-setting').value = 3; // Default value
    }

    // Load accuracy setting
    const savedAccuracy = localStorage.getItem('accuracyThreshold');
    if (savedAccuracy !== null) {
        accuracyThreshold = parseFloat(savedAccuracy);
        document.getElementById('accuracy-setting').value = accuracyThreshold * 100;
    } else {
        document.getElementById('accuracy-setting').value = 50; // Default value
    }

    console.log('Settings loaded:', {
        modelUrl: document.getElementById('model-url').value,
        audioEnabled: audioEnabled,
        recognitionDelay: recognitionDelay,
        accuracyThreshold: accuracyThreshold
    });
});

function showSettingsPage() {
    document.getElementById('recognition-page').classList.remove('active');
    document.getElementById('settings-page').classList.add('active');
    if (webcam) {
        webcam.stop();
        isRecognitionRunning = false;
    }
}

async function startCameraRecognition() {
    if (!isRecognitionRunning && model) {
        try {
            console.log('Starting camera recognition...');

            // Check for camera permission first
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(track => track.stop()); // Stop the test stream
                console.log('Camera permission granted');
            } catch (permError) {
                console.error('Camera permission error:', permError);
                throw permError;
            }

            isRecognitionRunning = true;
            currentPoseIndex = 0; // Reset to pose 1
            lastPoseTime = 0;
            isTransitioning = false;
            document.getElementById('start-recognition-button').style.display = 'none';
            document.getElementById('stop-recognition-button').style.display = 'inline-block';

            // Always reinitialize webcam to ensure it works properly
            await initWebcam();
        } catch (error) {
            console.error('Error starting camera recognition:', error);
            isRecognitionRunning = false;
            document.getElementById('start-recognition-button').style.display = 'inline-block';
            document.getElementById('stop-recognition-button').style.display = 'none';
        }
    }
}

function stopCameraRecognition() {
    if (isRecognitionRunning) {
        isRecognitionRunning = false;
        if (webcam) {
            webcam.stop();
            webcam = null; // Reset webcam to null so it can be recreated
        }
        document.getElementById('start-recognition-button').style.display = 'inline-block';
        document.getElementById('stop-recognition-button').style.display = 'none';

        // Clear displays
        const canvas = document.getElementById('output');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        document.getElementById('pose-name').textContent = 'Recognition stopped';
        document.getElementById('confidence-bar').style.width = '0%';
        document.getElementById('confidence-text').textContent = '0%';
        document.getElementById('timer-display').style.display = 'none';
        document.getElementById('current-pose').style.display = 'none';
    }
}

async function startRecognition() {
    if (poseImages.size < 7) {
        alert('Please upload all seven pose images first');
        return;
    }

    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('recognition-page').classList.add('active');

    const URL = document.getElementById('model-url').value;
    await init(URL);
}

async function init(URL) {
    // Fallback model URLs in case the primary one fails
    const fallbackUrls = [
        URL,
        'https://teachablemachine.withgoogle.com/models/5H-V2YcoQ/',
        'https://teachablemachine.withgoogle.com/models/BmWV2_mfv/',
        'https://teachablemachine.withgoogle.com/models/XjSP8dCtn/'
    ];

    for (let i = 0; i < fallbackUrls.length; i++) {
        let currentUrl = fallbackUrls[i];
        
        try {
            console.log(`Attempting to load model from (${i + 1}/${fallbackUrls.length}):`, currentUrl);
            
            // Ensure URL ends with slash
            if (!currentUrl.endsWith('/')) {
                currentUrl += '/';
            }

            // Validate URL format
            if (!currentUrl.includes('teachablemachine.withgoogle.com')) {
                console.log('Skipping invalid URL:', currentUrl);
                continue;
            }

            // Add timeout and retry mechanism with better error handling
            const loadWithTimeout = async (url, timeout = 15000) => {
                try {
                    console.log('Testing model accessibility:', url);
                    
                    // Test if the model.json file is accessible first
                    const testResponse = await fetch(url + 'model.json', { 
                        method: 'HEAD',
                        mode: 'cors'
                    });
                    
                    if (!testResponse.ok) {
                        throw new Error(`Model not accessible: ${testResponse.status} ${testResponse.statusText}`);
                    }
                    
                    console.log('Model accessible, loading...');
                    return Promise.race([
                        tmPose.load(url + 'model.json', url + 'metadata.json'),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Model loading timeout after 15 seconds')), timeout)
                        )
                    ]);
                } catch (fetchError) {
                    console.error('Fetch error:', fetchError);
                    throw new Error(`Cannot access model URL: ${fetchError.message}`);
                }
            };

            // Try loading with timeout
            model = await loadWithTimeout(currentUrl);
        
        if (!model) {
                throw new Error('Model loaded but is null or undefined');
            }
            
            maxPredictions = model.getTotalClasses();
            console.log(`Model loaded successfully from: ${currentUrl}. Classes: ${maxPredictions}`);

            // Update the input field with the working URL
            document.getElementById('model-url').value = currentUrl;
            localStorage.setItem('modelUrl', currentUrl);

            // Show start button once model is loaded
            document.getElementById('start-recognition-button').style.display = 'inline-block';
            
            // Clear any previous error messages
            document.getElementById('pose-name').textContent = 'Model loaded successfully!';
            
            return; // Success, exit the function
            
        } catch (error) {
            console.error(`Failed to load model from ${currentUrl}:`, error);
            
            // If this is not the last URL, continue to the next one
            if (i < fallbackUrls.length - 1) {
                console.log('Trying next fallback URL...');
                continue;
            }
            
            // If we've exhausted all URLs, show the error
            console.error('All model URLs failed');
        }
    }
    
    // If we get here, all URLs failed
    try {
        console.error('Error loading model:', error);
        let errorMessage = 'Failed to load the pose recognition model.\n\n';
        
        // Handle specific error types
        if (error.message.includes('Cannot read properties of undefined')) {
            errorMessage += 'Model structure error - the model files may be corrupted or incomplete.\n\n';
            errorMessage += 'Solutions:\n';
            errorMessage += '1. Try a different model URL\n';
            errorMessage += '2. Check your internet connection\n';
            errorMessage += '3. Use this working model: https://teachablemachine.withgoogle.com/models/BmWV2_mfv/\n\n';
        } else if (error.message.includes('Cannot access model URL') || error.message.includes('Model not accessible')) {
            errorMessage += 'The model URL is not accessible. Please check:\n';
            errorMessage += '1. Your internet connection\n';
            errorMessage += '2. The model URL is correct\n';
            errorMessage += '3. The model is publicly accessible\n\n';
            errorMessage += 'Current URL: ' + URL + '\n\n';
            errorMessage += 'Try using: https://teachablemachine.withgoogle.com/models/BmWV2_mfv/';
        } else if (error.message.includes('CORS')) {
            errorMessage += 'CORS error - the model server is blocking access.\n';
            errorMessage += 'Try using a different model URL from Teachable Machine.\n';
            errorMessage += 'Recommended: https://teachablemachine.withgoogle.com/models/BmWV2_mfv/';
        } else if (error.message.includes('timeout')) {
            errorMessage += 'Model loading timed out. This could be due to:\n';
            errorMessage += '1. Slow internet connection\n';
            errorMessage += '2. Large model size\n';
            errorMessage += '3. Server issues\n\n';
            errorMessage += 'Try again or use: https://teachablemachine.withgoogle.com/models/BmWV2_mfv/';
        } else {
            errorMessage += 'Error details: ' + error.message + '\n\n';
            errorMessage += 'Try using this working model: https://teachablemachine.withgoogle.com/models/BmWV2_mfv/';
        }

        alert(errorMessage);
        
        // Update UI to show error
        document.getElementById('pose-name').textContent = 'Model loading failed. Check console for details.';
    }
}

async function initWebcam() {
    try {
        console.log('Starting webcam initialization...');

        // Check if we have camera permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            throw new Error('No camera devices found');
        }

        const size = 640;
        const flip = true;

        // Clean up existing webcam if any
        if (webcam) {
            try {
                webcam.stop();
            } catch (e) {
                console.log('Error stopping existing webcam:', e);
            }
        }

        webcam = new tmPose.Webcam(size, size, flip);
        console.log('Webcam object created, setting up...');

        await webcam.setup({
            facingMode: 'user'
        });
        console.log('Webcam setup complete, starting play...');

        await webcam.play();
        console.log('Webcam play started successfully');

        canvas = document.getElementById('output');
        ctx = canvas.getContext('2d');
        labelContainer = document.getElementById('pose-name');

        canvas.width = size;
        canvas.height = size;

        // Only start the loop if recognition is running
        if (isRecognitionRunning) {
            console.log('Starting recognition loop...');
            window.requestAnimationFrame(loop);
        }
    } catch (error) {
        console.error('Error initializing webcam:', error);
        let errorMessage = 'Failed to initialize camera. ';

        if (error.name === 'NotAllowedError') {
            errorMessage += 'Camera permission was denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera found. Please connect a camera and try again.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Camera is already in use by another application.';
        } else {
            errorMessage += 'Please check camera permissions and try again.';
        }

        alert(errorMessage);
        stopCameraRecognition();
    }
}

async function loop(timestamp) {
    if (isRecognitionRunning) {
        webcam.update();
        await predict();
        window.requestAnimationFrame(loop);
    }
}

function playBeep() {
    if (audioEnabled) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    }
}

let isTransitioning = false;
let transitionStartTime = 0;

async function predict() {
    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
    const prediction = await model.predict(posenetOutput);

    ctx.drawImage(webcam.canvas, 0, 0);
    if (pose) {
        drawPose(pose);
    }

    let maxConfidence = 0;
    let bestPose = '';
    for (let i = 0; i < maxPredictions; i++) {
        if (prediction[i].probability > maxConfidence) {
            maxConfidence = prediction[i].probability;
            bestPose = prediction[i].className;
        }
    }

    const expectedPose = poseOrder[currentPoseIndex];
    const currentPose = document.getElementById('current-pose');
    const timerDisplay = document.getElementById('timer-display');

    currentPose.src = poseImages.get(expectedPose);
    currentPose.style.display = 'block';

    // Update confidence bar
    const confidenceBar = document.getElementById('confidence-bar');
    const confidenceText = document.getElementById('confidence-text');
    const confidencePercent = (maxConfidence * 100).toFixed(1);

    confidenceBar.style.width = confidencePercent + '%';
    confidenceText.textContent = confidencePercent + '%';

    // Handle transition countdown
    if (isTransitioning) {
        const transitionTime = 3 - Math.floor((Date.now() - transitionStartTime) / 1000);
        if (transitionTime > 0) {
            timerDisplay.textContent = transitionTime;
            timerDisplay.style.display = 'block';
            currentPose.classList.add('correct');
            labelContainer.textContent = `Next pose in: ${transitionTime}s`;
            return;
        } else {
            // Transition complete
            isTransitioning = false;
            timerDisplay.style.display = 'none';
            currentPoseIndex = (currentPoseIndex + 1) % poseOrder.length;
            lastPoseTime = 0;
            currentPose.classList.remove('correct');
            currentPose.classList.add('waiting');
        }
    }

    if (maxConfidence > accuracyThreshold && bestPose === expectedPose) {
        confidenceBar.classList.add('correct');
        currentPose.classList.remove('waiting');
        currentPose.classList.add('correct');

        if (lastPoseTime === 0) {
            lastPoseTime = Date.now();
        }
        const holdTime = recognitionDelay - Math.floor((Date.now() - lastPoseTime) / 1000);

        if (holdTime <= 0) {
            playBeep();
            isTransitioning = true;
            transitionStartTime = Date.now();
            lastPoseTime = 0;
        }

        labelContainer.textContent = `Current Pose: ${bestPose}\nConfidence: ${(maxConfidence * 100).toFixed(2)}%\nHold for: ${Math.max(0, holdTime)}s`;
    } else {
        confidenceBar.classList.remove('correct');
        currentPose.classList.remove('correct');
        currentPose.classList.add('waiting');
        lastPoseTime = 0;
        labelContainer.textContent = `Expected Pose: ${expectedPose}\nCurrent Pose: ${bestPose}\nConfidence: ${(maxConfidence * 100).toFixed(2)}%`;
    }
}

function drawPose(pose) {
    // Define the skeleton connections (pairs of keypoint indices)
    const connections = [
        // Head connections
        [0, 1], [0, 2], [1, 3], [2, 4], // nose to eyes, eyes to ears

        // Torso connections
        [5, 6], [5, 7], [6, 8], [7, 9], [8, 10], // shoulders to arms
        [5, 11], [6, 12], [11, 12], // shoulders to hips, hip connection

        // Left arm
        [7, 9], [9, 11],

        // Right arm  
        [8, 10], [10, 12],

        // Left leg
        [11, 13], [13, 15],

        // Right leg
        [12, 14], [14, 16]
    ];

    // Draw skeleton lines
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 3;

    for (let connection of connections) {
        const [pointA, pointB] = connection;
        const keypointA = pose.keypoints[pointA];
        const keypointB = pose.keypoints[pointB];

        // Only draw if both keypoints are confident enough
        if (keypointA && keypointB && keypointA.score > 0.2 && keypointB.score > 0.2) {
            ctx.beginPath();
            ctx.moveTo(keypointA.position.x, keypointA.position.y);
            ctx.lineTo(keypointB.position.x, keypointB.position.y);
            ctx.stroke();
        }
    }

    // Draw keypoints on top of skeleton
    for (let keypoint of pose.keypoints) {
        if (keypoint.score > 0.2) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF6B6B';
            ctx.fill();

            // Add white border to keypoints
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 6, 0, 2 * Math.PI);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}
let model, webcam, ctx, labelContainer, maxPredictions;
const poseImages = new Map();
let currentPoseImage = null;
let currentPoseIndex = 0;
let poseHoldTimer = 3;
let lastPoseTime = 0;
let isTransitioning = false;
let isRecognitionRunning = false;
let confidenceScore = 0;

// Define all 7 poses
const poses = [
    { name: "Mountain Pose\n(Tadasana)", image: "mountain.jpg" },
    { name: "Tree Pose\n(Vrikshasana)", image: "tree.jpg" },
    { name: "Warrior I\n(Virabhadrasana I)", image: "warrior1.jpg" },
    { name: "Warrior II\n(Virabhadrasana II)", image: "warrior2.jpg" },
    { name: "Triangle Pose\n(Trikonasana)", image: "triangle.jpg" },
    { name: "Child's Pose\n(Balasana)", image: "child.jpg" },
    { name: "Downward Dog\n(Adho Mukha Svanasana)", image: "downward.jpg" }
];

// Model file storage
let localModelFiles = {
    modelJson: null,
    metadataJson: null,
    weightsBin: null
};

// Settings management
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('yogaAppSettings') || '{}');
    const defaultSettings = {
        modelUrl: 'https://teachablemachine.withgoogle.com/models/BmWV2_mfv/',
        modelSource: 'online',
        audioEnabled: true,
        recognitionDelay: 3,
        accuracyThreshold: 0.5
    };
    return { ...defaultSettings, ...settings };
}

function saveSettings(settings) {
    localStorage.setItem('yogaAppSettings', JSON.stringify(settings));
}

// Initialize settings on page load
document.addEventListener('DOMContentLoaded', function() {
    const settings = loadSettings();
    console.log('Settings loaded:', settings);

    // Apply settings to form
    document.getElementById('model-url').value = settings.modelUrl;
    document.getElementById('audio-enabled').checked = settings.audioEnabled;
    document.getElementById('recognition-delay').value = settings.recognitionDelay;
    document.getElementById('accuracy-threshold').value = settings.accuracyThreshold;

    // Set model source
    document.querySelector(`input[name="model-source"][value="${settings.modelSource}"]`).checked = true;
    toggleModelSource();

    // Update accuracy display
    document.getElementById('accuracy-value').textContent = settings.accuracyThreshold;

    // Add event listeners
    document.querySelectorAll('input[name="model-source"]').forEach(radio => {
        radio.addEventListener('change', toggleModelSource);
    });

    // Add local file handlers
    document.getElementById('model-json').addEventListener('change', (e) => handleLocalFile(e, 'modelJson'));
    document.getElementById('metadata-json').addEventListener('change', (e) => handleLocalFile(e, 'metadataJson'));
    document.getElementById('weights-bin').addEventListener('change', (e) => handleLocalFile(e, 'weightsBin'));

    // Load pose images
    loadPoseImages();
});

function loadPoseImages() {
    poses.forEach((pose, index) => {
        const fileInput = document.getElementById(`pose-${index + 1}-image`);
        const preview = document.getElementById(`pose-${index + 1}-preview`);

        // Load saved image from localStorage if exists
        const savedImage = localStorage.getItem(`pose-${index + 1}-image`);
        if (savedImage) {
            preview.src = savedImage;
            preview.style.display = 'block';
            poseImages.set(index, savedImage);
        }
    });
}

function handleImageUpload(event, poseIndex) {
    const file = event.target.files[0];
    const preview = document.getElementById(`pose-${poseIndex}-preview`);

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imageData = e.target.result;
            preview.src = imageData;
            preview.style.display = 'block';
            poseImages.set(poseIndex - 1, imageData);

            // Save to localStorage
            localStorage.setItem(`pose-${poseIndex}-image`, imageData);
        };
        reader.readAsDataURL(file);
    }
}

function updateAccuracyDisplay() {
    const slider = document.getElementById('accuracy-threshold');
    const display = document.getElementById('accuracy-value');
    display.textContent = slider.value;
}

function toggleModelSource() {
    const modelSource = document.querySelector('input[name="model-source"]:checked').value;
    const onlineGroup = document.getElementById('online-model-group');
    const localGroup = document.getElementById('local-model-group');

    if (modelSource === 'online') {
        onlineGroup.style.display = 'block';
        localGroup.style.display = 'none';
    } else {
        onlineGroup.style.display = 'none';
        localGroup.style.display = 'block';
    }
}

function handleLocalFile(event, fileType) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            if (fileType === 'weightsBin') {
                localModelFiles[fileType] = e.target.result;
            } else {
                try {
                    localModelFiles[fileType] = JSON.parse(e.target.result);
                } catch (error) {
                    alert(`Invalid JSON file: ${file.name}`);
                    return;
                }
            }
            
            // Update label to show file is loaded
            const label = event.target.nextElementSibling;
            label.classList.add('file-loaded');
            label.textContent = `✓ ${file.name}`;
            
            console.log(`Loaded ${fileType}:`, file.name);
        };
        
        if (fileType === 'weightsBin') {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }
}

function validateLocalFiles() {
    const errors = [];
    
    if (!localModelFiles.modelJson) {
        errors.push('model.json file is missing');
    }
    if (!localModelFiles.metadataJson) {
        errors.push('metadata.json file is missing');
    }
    if (!localModelFiles.weightsBin) {
        errors.push('weights.bin file is missing');
    }
    
    if (errors.length > 0) {
        console.error('Local model validation failed:', errors.join(', '));
        return false;
    }
    
    // Additional validation for file structure
    try {
        if (localModelFiles.modelJson && !localModelFiles.modelJson.weightsManifest) {
            errors.push('model.json does not contain weightsManifest');
        }
        if (localModelFiles.metadataJson && !localModelFiles.metadataJson.labels) {
            errors.push('metadata.json does not contain labels');
        }
    } catch (e) {
        errors.push('Invalid JSON structure in model files');
    }
    
    if (errors.length > 0) {
        console.error('Local model structure validation failed:', errors.join(', '));
        return false;
    }
    
    return true;
}

async function startRecognition() {
    const modelSource = document.querySelector('input[name="model-source"]:checked').value;

    // Save current settings
    const settings = {
        modelUrl: document.getElementById('model-url').value,
        modelSource: modelSource,
        audioEnabled: document.getElementById('audio-enabled').checked,
        recognitionDelay: parseInt(document.getElementById('recognition-delay').value),
        accuracyThreshold: parseFloat(document.getElementById('accuracy-threshold').value)
    };
    saveSettings(settings);

    // Validate based on model source
    if (modelSource === 'online') {
        if (!settings.modelUrl) {
            alert('Please enter a valid Teachable Machine model URL');
            return;
        }
    } else {
        if (!validateLocalFiles()) {
            alert('Please upload all required model files: model.json, metadata.json, and weights.bin. Make sure the files are valid Teachable Machine pose model files.');
            return;
        }
    }

    // Show loading and switch to recognition page
    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('recognition-page').classList.add('active');

    try {
        if (modelSource === 'online') {
            await init(settings.modelUrl);
        } else {
            await initLocal();
        }
        await startCameraRecognition();
    } catch (error) {
        console.error('Failed to start recognition:', error);
        let errorMessage = 'Failed to start recognition. ';
        
        if (modelSource === 'local') {
            errorMessage += 'Please ensure your model files are valid Teachable Machine pose model files (model.json, metadata.json, weights.bin) and try again.';
        } else {
            errorMessage += 'Please check your model URL and internet connection, then try again.';
        }
        
        alert(errorMessage);
        showSettingsPage();
    }
}

async function init(modelURL) {
    console.log('Loading model from:', modelURL);

    try {
        // Load the model
        model = await tmPose.load(modelURL + 'model.json', modelURL + 'metadata.json');
        maxPredictions = model.getTotalClasses();
        console.log('Model loaded successfully. Classes:', maxPredictions);

        await setupCamera();

    } catch (error) {
        console.error('Failed to initialize:', error);
        throw error;
    }
}

async function initLocal() {
    console.log('Loading local model files...');

    try {
        // Create blob URLs for local files
        const modelBlob = new Blob([JSON.stringify(localModelFiles.modelJson)], {type: 'application/json'});
        const metadataBlob = new Blob([JSON.stringify(localModelFiles.metadataJson)], {type: 'application/json'});
        const weightsBlob = new Blob([localModelFiles.weightsBin], {type: 'application/octet-stream'});
        
        const modelUrl = URL.createObjectURL(modelBlob);
        const metadataUrl = URL.createObjectURL(metadataBlob);
        const weightsUrl = URL.createObjectURL(weightsBlob);

        // Modify the model.json to point to our local weights URL
        const modifiedModelJson = {...localModelFiles.modelJson};
        if (modifiedModelJson.weightsManifest && modifiedModelJson.weightsManifest[0]) {
            modifiedModelJson.weightsManifest[0].paths = [weightsUrl];
        }

        // Create new blob with modified model.json
        const modifiedModelBlob = new Blob([JSON.stringify(modifiedModelJson)], {type: 'application/json'});
        const modifiedModelUrl = URL.createObjectURL(modifiedModelBlob);

        // Load the model with local files
        model = await tmPose.load(modifiedModelUrl, metadataUrl);
        maxPredictions = model.getTotalClasses();
        console.log('Local model loaded successfully. Classes:', maxPredictions);

        // Clean up blob URLs
        URL.revokeObjectURL(modelUrl);
        URL.revokeObjectURL(modifiedModelUrl);
        URL.revokeObjectURL(metadataUrl);
        URL.revokeObjectURL(weightsUrl);

        await setupCamera();

    } catch (error) {
        console.error('Failed to initialize local model:', error);
        throw error;
    }
}

async function setupCamera() {
    // Set up webcam
    const flip = true;
    webcam = new tmPose.Webcam(640, 480, flip);
    await webcam.setup();

    // Clear previous webcam if exists
    const container = document.getElementById('webcam-container');
    if (!container) {
        // Create webcam container if it doesn't exist
        const videoContainer = document.querySelector('.video-container');
        const webcamContainer = document.createElement('div');
        webcamContainer.id = 'webcam-container';
        videoContainer.appendChild(webcamContainer);
    }

    document.getElementById('webcam-container').appendChild(webcam.canvas);

    // Set up canvas for drawing
    const canvas = document.getElementById('output');
    canvas.width = 640;
    canvas.height = 480;
    ctx = canvas.getContext('2d');

    console.log('Webcam and canvas set up successfully');
}

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
            isRecognitionRunning = true;
            currentPoseIndex = 0;
            lastPoseTime = 0;
            isTransitioning = false;
            document.getElementById('start-recognition-button').style.display = 'none';
            document.getElementById('stop-recognition-button').style.display = 'inline-block';

            await webcam.play();
            updateCurrentPose();
            requestAnimationFrame(loop);

        } catch (error) {
            console.error('Error starting camera recognition:', error);
            alert('Failed to start camera. Please ensure camera permissions are granted.');
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
        }
        document.getElementById('start-recognition-button').style.display = 'inline-block';
        document.getElementById('stop-recognition-button').style.display = 'none';

        // Clear canvas
        if (ctx) {
            ctx.clearRect(0, 0, 640, 480);
        }

        // Hide timer
        document.getElementById('timer-display').style.display = 'none';
    }
}

function updateCurrentPose() {
    const pose = poses[currentPoseIndex];
    document.getElementById('pose-name').textContent = pose.name;

    const poseCompare = document.getElementById('pose-compare');
    const savedImage = poseImages.get(currentPoseIndex);

    if (savedImage) {
        poseCompare.src = savedImage;
        poseCompare.style.display = 'block';
    } else {
        poseCompare.style.display = 'none';
    }

    // Reset pose state
    poseCompare.className = 'pose-compare waiting';
}

async function loop() {
    if (!isRecognitionRunning) return;

    try {
        webcam.update();
        await predict();
        requestAnimationFrame(loop);
    } catch (error) {
        console.error('Error in recognition loop:', error);
        stopCameraRecognition();
    }
}

async function predict() {
    if (!model || !webcam.canvas) return;

    try {
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        const prediction = await model.predict(posenetOutput);

        // Clear canvas
        ctx.clearRect(0, 0, 640, 480);

        // Draw pose if detected
        if (pose) {
            drawPose(pose);
        }

        // Get current pose prediction
        if (prediction && prediction.length > currentPoseIndex) {
            confidenceScore = prediction[currentPoseIndex].probability;
            updateConfidenceDisplay();

            const settings = loadSettings();
            const threshold = settings.accuracyThreshold;

            if (confidenceScore >= threshold) {
                handleCorrectPose();
            } else {
                resetPoseTimer();
            }
        }

    } catch (error) {
        console.error('Prediction error:', error);
    }
}

function updateConfidenceDisplay() {
    const confidenceBar = document.querySelector('.confidence-bar');
    const confidenceText = document.querySelector('.confidence-text');
    const poseCompare = document.getElementById('pose-compare');

    if (confidenceBar && confidenceText) {
        const percentage = Math.round(confidenceScore * 100);
        confidenceBar.style.width = percentage + '%';
        confidenceText.textContent = `Confidence: ${percentage}%`;

        const settings = loadSettings();
        const threshold = settings.accuracyThreshold;

        if (confidenceScore >= threshold) {
            confidenceBar.classList.add('correct');
            poseCompare.className = 'pose-compare correct';
        } else {
            confidenceBar.classList.remove('correct');
            poseCompare.className = 'pose-compare waiting';
        }
    }
}

function handleCorrectPose() {
    const settings = loadSettings();
    const currentTime = Date.now();

    if (lastPoseTime === 0) {
        lastPoseTime = currentTime;
        showTimer(settings.recognitionDelay);
    }

    const elapsed = (currentTime - lastPoseTime) / 1000;
    const remaining = Math.max(0, settings.recognitionDelay - elapsed);

    if (remaining <= 0) {
        moveToNextPose();
    } else {
        showTimer(Math.ceil(remaining));
    }
}

function resetPoseTimer() {
    lastPoseTime = 0;
    document.getElementById('timer-display').style.display = 'none';
}

function showTimer(seconds) {
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = seconds;
    timerDisplay.style.display = 'block';
}

function moveToNextPose() {
    const settings = loadSettings();

    if (settings.audioEnabled) {
        playSuccessSound();
    }

    lastPoseTime = 0;
    document.getElementById('timer-display').style.display = 'none';

    currentPoseIndex = (currentPoseIndex + 1) % poses.length;
    updateCurrentPose();

    if (currentPoseIndex === 0) {
        // Completed all poses
        setTimeout(() => {
            alert('Congratulations! You completed all yoga poses!');
        }, 500);
    }
}

function playSuccessSound() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function drawPose(pose) {
    // Define the skeleton connections (pairs of keypoint indices)
    const connections = [
        [0, 1], [0, 2], [1, 3], [2, 4],
        [5, 6], [5, 7], [6, 8], [7, 9], [8, 10],
        [5, 11], [6, 12], [11, 12],
        [7, 9], [9, 11],
        [8, 10], [10, 12],
        [11, 13], [13, 15],
        [12, 14], [14, 16]
    ];

    // Draw skeleton lines
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 3;

    for (let connection of connections) {
        const [pointA, pointB] = connection;
        const keypointA = pose.keypoints[pointA];
        const keypointB = pose.keypoints[pointB];

        if (keypointA && keypointB && keypointA.score > 0.2 && keypointB.score > 0.2) {
            ctx.beginPath();
            ctx.moveTo(keypointA.position.x, keypointA.position.y);
            ctx.lineTo(keypointB.position.x, keypointB.position.y);
            ctx.stroke();
        }
    }

    // Draw keypoints
    for (let keypoint of pose.keypoints) {
        if (keypoint.score > 0.2) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF6B6B';
            ctx.fill();
        }
    }
}
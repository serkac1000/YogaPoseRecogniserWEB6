
let model, webcam, ctx, labelContainer, maxPredictions;
const poseImages = new Map();
let currentPoseImage = null;
let currentPoseIndex = 0;
let poseHoldTimer = 3;
let lastPoseTime = 0;
let isTransitioning = false;
let isRecognitionRunning = false;
let confidenceScore = 0;
let activePoses = [];

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

// Pose cycle for alternating between poses
let poseSequence = []; // Will be populated with active poses
let sequenceIndex = 0;

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
        accuracyThreshold: 0.5,
        activePoses: [true, true, true, true, true, true, true]
    };
    return { ...defaultSettings, ...settings };
}

function saveSettings(settings) {
    localStorage.setItem('yogaAppSettings', JSON.stringify(settings));
}

function saveLocalModelFiles() {
    try {
        if (localModelFiles.modelJson) {
            localStorage.setItem('localModelJson', JSON.stringify(localModelFiles.modelJson));
        }
        if (localModelFiles.metadataJson) {
            localStorage.setItem('localMetadataJson', JSON.stringify(localModelFiles.metadataJson));
        }
        // Don't save weights.bin to localStorage due to size limits - user must upload each time
        console.log('Model JSON and metadata saved to localStorage');
    } catch (error) {
        console.warn('Could not save model files to localStorage:', error);
    }
}

function loadLocalModelFiles() {
    try {
        const modelJson = localStorage.getItem('localModelJson');
        const metadataJson = localStorage.getItem('localMetadataJson');

        if (modelJson) {
            localModelFiles.modelJson = JSON.parse(modelJson);
            document.getElementById('model-json').nextElementSibling.classList.add('file-loaded');
            document.getElementById('model-json').nextElementSibling.textContent = '✓ model.json (saved)';
        }
        if (metadataJson) {
            localModelFiles.metadataJson = JSON.parse(metadataJson);
            document.getElementById('metadata-json').nextElementSibling.classList.add('file-loaded');
            document.getElementById('metadata-json').nextElementSibling.textContent = '✓ metadata.json (saved)';
        }
        // User must upload weights.bin fresh each time due to localStorage size limits
    } catch (error) {
        console.error('Error loading saved model files:', error);
    }
}

function savePoseSelection() {
    const settings = loadSettings();
    settings.activePoses = [];
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        settings.activePoses[i] = checkbox ? checkbox.checked : false;
    }
    saveSettings(settings);
}

function getActivePoses() {
    activePoses = [];
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        if (checkbox && checkbox.checked) {
            activePoses.push(i);
        }
    }
    // Update pose sequence with active poses
    poseSequence = [...activePoses];
    return activePoses;
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

    // Load pose checkboxes state
    if (settings.activePoses) {
        for (let i = 0; i < 7; i++) {
            const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
            if (checkbox) {
                checkbox.checked = settings.activePoses[i] || false;
            }
        }
    }

    // Update accuracy display
    document.getElementById('accuracy-value').textContent = settings.accuracyThreshold;

    // Add event listeners
    document.querySelectorAll('input[name="model-source"]').forEach(radio => {
        radio.addEventListener('change', toggleModelSource);
    });

    // Add pose checkbox listeners to save selection
    for (let i = 1; i <= 7; i++) {
        const checkbox = document.getElementById(`pose-${i}-enabled`);
        if (checkbox) {
            checkbox.addEventListener('change', savePoseSelection);
        }
    }

    // Add local file handlers
    document.getElementById('model-json').addEventListener('change', (e) => handleLocalFile(e, 'modelJson'));
    document.getElementById('metadata-json').addEventListener('change', (e) => handleLocalFile(e, 'metadataJson'));
    document.getElementById('weights-bin').addEventListener('change', (e) => handleLocalFile(e, 'weightsBin'));

    // Load pose images and local model files
    loadPoseImages();
    loadLocalModelFiles();
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
            
            // Save to localStorage (but not weights.bin due to size limits)
            if (fileType !== 'weightsBin') {
                saveLocalModelFiles();
            }
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

    // Get active poses
    const activePosesList = getActivePoses();
    if (activePosesList.length === 0) {
        alert('Please select at least one pose to practice.');
        return;
    }

    // Save current settings
    const settings = {
        modelUrl: document.getElementById('model-url').value,
        modelSource: modelSource,
        audioEnabled: document.getElementById('audio-enabled').checked,
        recognitionDelay: parseInt(document.getElementById('recognition-delay').value),
        accuracyThreshold: parseFloat(document.getElementById('accuracy-threshold').value),
        activePoses: []
    };

    // Save active poses state
    for (let i = 0; i < 7; i++) {
        const checkbox = document.getElementById(`pose-${i + 1}-enabled`);
        settings.activePoses[i] = checkbox ? checkbox.checked : false;
    }

    saveSettings(settings);

    // Validate based on model source
    if (modelSource === 'online') {
        if (!settings.modelUrl) {
            alert('Please enter a valid Teachable Machine model URL');
            return;
        }
    } else {
        if (!validateLocalFiles()) {
            alert('Please upload all required model files: model.json, metadata.json, and weights.bin. Note: You need to upload weights.bin each time due to browser storage limits.');
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
        // Validate files are loaded
        if (!localModelFiles.modelJson || !localModelFiles.metadataJson || !localModelFiles.weightsBin) {
            throw new Error('Missing required model files');
        }

        console.log('Creating model blob URLs...');
        
        // Create metadata blob first
        const metadataBlob = new Blob([JSON.stringify(localModelFiles.metadataJson)], {type: 'application/json'});
        const metadataUrl = URL.createObjectURL(metadataBlob);
        console.log('Metadata URL created:', metadataUrl);

        // Create weights blob with proper binary data
        let weightsData;
        if (localModelFiles.weightsBin instanceof ArrayBuffer) {
            weightsData = localModelFiles.weightsBin;
        } else {
            throw new Error('Weights data is not in the correct format (should be ArrayBuffer)');
        }
        
        const weightsBlob = new Blob([weightsData], {type: 'application/octet-stream'});
        const weightsUrl = URL.createObjectURL(weightsBlob);
        console.log('Weights URL created:', weightsUrl);

        // Create a modified model.json that points to our blob URL for weights
        const modifiedModelJson = JSON.parse(JSON.stringify(localModelFiles.modelJson));
        
        // Update the weights manifest to point to our blob URL
        if (modifiedModelJson.weightsManifest && modifiedModelJson.weightsManifest.length > 0) {
            // Replace the weights path with our blob URL
            modifiedModelJson.weightsManifest[0].paths = ['./weights.bin'];
            console.log('Updated weightsManifest paths');
        } else {
            throw new Error('Model file does not contain valid weightsManifest');
        }

        // Create model blob
        const modelBlob = new Blob([JSON.stringify(modifiedModelJson)], {type: 'application/json'});
        const modelUrl = URL.createObjectURL(modelBlob);
        console.log('Model URL created:', modelUrl);

        // Create a custom fetch function that intercepts requests for weights.bin
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            if (typeof url === 'string' && url.includes('weights.bin')) {
                console.log('Intercepting weights.bin request, returning local blob');
                return Promise.resolve(new Response(weightsBlob));
            }
            return originalFetch.call(this, url, options);
        };

        try {
            // Load the model with local files
            console.log('Loading model with URLs:', { modelUrl, metadataUrl });
            model = await tmPose.load(modelUrl, metadataUrl);
            maxPredictions = model.getTotalClasses();
            console.log('Local model loaded successfully. Classes:', maxPredictions);
        } finally {
            // Restore original fetch
            window.fetch = originalFetch;
            
            // Clean up blob URLs
            URL.revokeObjectURL(modelUrl);
            URL.revokeObjectURL(metadataUrl);
            URL.revokeObjectURL(weightsUrl);
        }

        await setupCamera();

    } catch (error) {
        console.error('Failed to initialize local model:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            modelJsonLoaded: !!localModelFiles.modelJson,
            metadataJsonLoaded: !!localModelFiles.metadataJson,
            weightsBinLoaded: !!localModelFiles.weightsBin,
            weightsBinType: localModelFiles.weightsBin ? localModelFiles.weightsBin.constructor.name : 'undefined'
        });
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

    // Clear existing webcam canvas
    container.innerHTML = '';
    container.appendChild(webcam.canvas);

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
    // Reset button states
    document.getElementById('start-recognition-button').style.display = 'inline-block';
    document.getElementById('stop-recognition-button').style.display = 'none';
}

async function startCameraRecognition() {
    if (!isRecognitionRunning && model) {
        try {
            console.log('Starting camera recognition...');
            
            // Get active poses and ensure we have at least one
            getActivePoses();
            if (poseSequence.length === 0) {
                alert('Please select at least one pose to practice.');
                return;
            }
            
            isRecognitionRunning = true;
            
            // Reset pose sequence
            sequenceIndex = 0;
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
        
        // Reset state
        sequenceIndex = 0;
        lastPoseTime = 0;
        isTransitioning = false;
        confidenceScore = 0;
        
        document.getElementById('start-recognition-button').style.display = 'inline-block';
        document.getElementById('stop-recognition-button').style.display = 'none';

        // Clear canvas
        if (ctx) {
            ctx.clearRect(0, 0, 640, 480);
        }

        // Hide timer and reset confidence
        document.getElementById('timer-display').style.display = 'none';
        
        // Reset confidence display
        const confidenceBar = document.querySelector('.confidence-bar');
        const confidenceText = document.querySelector('.confidence-text');
        if (confidenceBar && confidenceText) {
            confidenceBar.style.width = '0%';
            confidenceBar.classList.remove('correct');
            confidenceText.textContent = 'Confidence: 0%';
        }
        
        // Reset pose compare image
        const poseCompare = document.getElementById('pose-compare');
        if (poseCompare) {
            poseCompare.className = 'pose-compare waiting';
        }
    }
}

function updateCurrentPose() {
    if (poseSequence.length === 0) return;
    
    const currentPoseIndex = poseSequence[sequenceIndex];
    const pose = poses[currentPoseIndex];
    // Clean the pose name by removing the line break and Sanskrit name
    const cleanName = pose.name.split('\n')[0];
    document.getElementById('pose-name').textContent = `Current Pose: ${cleanName}`;

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

        // Get current pose in sequence
        if (poseSequence.length === 0) return;
        const currentPoseIndex = poseSequence[sequenceIndex];

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
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }
}

function showTimer(seconds) {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.textContent = seconds;
        timerDisplay.style.display = 'block';
    }
}

function moveToNextPose() {
    const settings = loadSettings();

    if (settings.audioEnabled) {
        playSuccessSound();
    }

    lastPoseTime = 0;
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }

    // Get the completed pose name before moving to next
    const completedPoseIndex = poseSequence[sequenceIndex];
    const completedPoseName = poses[completedPoseIndex].name.split('\n')[0];

    // Move to next pose in sequence
    sequenceIndex = (sequenceIndex + 1) % poseSequence.length;
    updateCurrentPose();

    // Show congratulations message without popup
    console.log(`Great! You completed ${completedPoseName}. Now try the next pose!`);
}

function playSuccessSound() {
    try {
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
    } catch (error) {
        console.error('Audio not supported or blocked:', error);
    }
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

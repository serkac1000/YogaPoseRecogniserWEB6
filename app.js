
let model, webcam, ctx, labelContainer, maxPredictions;
const poseImages = new Map();
let currentPoseImage = null;
let currentPoseIndex = 0;
let poseHoldTimer = 3;
let lastPoseTime = 0;
const poseOrder = ['Pose1', 'Pose2', 'Pose3', 'Pose4', 'Pose5', 'Pose6', 'Pose7'];
let audioEnabled = true;
let recognitionDelay = 3;

// Event Listeners
document.getElementById('start-button').addEventListener('click', startRecognition);
document.getElementById('back-button').addEventListener('click', showSettingsPage);
document.getElementById('audio-toggle').addEventListener('change', (e) => {
    audioEnabled = e.target.checked;
    localStorage.setItem('audioEnabled', audioEnabled);
});
document.getElementById('delay-setting').addEventListener('input', (e) => {
    recognitionDelay = parseFloat(e.target.value);
    localStorage.setItem('recognitionDelay', recognitionDelay);
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
    }
});

function showSettingsPage() {
    document.getElementById('recognition-page').classList.remove('active');
    document.getElementById('settings-page').classList.add('active');
    if (webcam) {
        webcam.stop();
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
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    model = await tmPose.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    const size = 640;
    const flip = true;
    webcam = new tmPose.Webcam(size, size, flip);
    await webcam.setup();
    await webcam.play();

    canvas = document.getElementById('output');
    ctx = canvas.getContext('2d');
    labelContainer = document.getElementById('pose-name');

    canvas.width = size;
    canvas.height = size;

    window.requestAnimationFrame(loop);
}

async function loop(timestamp) {
    webcam.update();
    await predict();
    window.requestAnimationFrame(loop);
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
    currentPose.src = poseImages.get(expectedPose);
    currentPose.style.display = 'block';

    // Update confidence bar
    const confidenceBar = document.getElementById('confidence-bar');
    const confidenceText = document.getElementById('confidence-text');
    const confidencePercent = (maxConfidence * 100).toFixed(1);
    
    confidenceBar.style.width = confidencePercent + '%';
    confidenceText.textContent = confidencePercent + '%';

    if (maxConfidence > 0.5 && bestPose === expectedPose) {
        confidenceBar.classList.add('correct');
        
        if (lastPoseTime === 0) {
            lastPoseTime = Date.now();
        }
        const holdTime = recognitionDelay - Math.floor((Date.now() - lastPoseTime) / 1000);
        
        if (holdTime <= 0) {
            playBeep();
            currentPoseIndex = (currentPoseIndex + 1) % poseOrder.length;
            lastPoseTime = 0;
        }
        
        labelContainer.textContent = `Current Pose: ${bestPose}\nConfidence: ${(maxConfidence * 100).toFixed(2)}%\nHold for: ${Math.max(0, holdTime)}s`;
    } else {
        confidenceBar.classList.remove('correct');
        lastPoseTime = 0;
        labelContainer.textContent = `Expected Pose: ${expectedPose}\nCurrent Pose: ${bestPose}\nConfidence: ${(maxConfidence * 100).toFixed(2)}%`;
    }
}

function drawPose(pose) {
    for (let keypoint of pose.keypoints) {
        if (keypoint.score > 0.2) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
        }
    }
}

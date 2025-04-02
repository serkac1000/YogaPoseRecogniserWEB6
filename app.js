
// Teachable Machine model URL
const URL = 'https://teachablemachine.withgoogle.com/models/gIF64n3nR/';
let model, webcam, ctx, labelContainer, maxPredictions;

// Pose sequence tracking
const poseSequence = ['Pose1', 'Pose2', 'Pose3'];
let currentPoseIndex = 0;
let lastCorrectPose = '';

async function init() {
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

    // Check if pose matches sequence with 50% confidence threshold
    if (maxConfidence > 0.5 && bestPose === poseSequence[currentPoseIndex] && bestPose !== lastCorrectPose) {
        lastCorrectPose = bestPose;
        currentPoseIndex = (currentPoseIndex + 1) % poseSequence.length;
    }

    labelContainer.textContent = `Current Pose: ${bestPose}\nNext Pose: ${poseSequence[currentPoseIndex]}\nConfidence: ${(maxConfidence * 100).toFixed(2)}%`;
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

init();

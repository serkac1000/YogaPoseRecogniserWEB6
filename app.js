
let detector;
let video;
let canvas;
let ctx;
let poses = [];

// Initialize the webcam and pose detector
async function init() {
    video = document.getElementById('webcam');
    canvas = document.getElementById('output');
    ctx = canvas.getContext('2d');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };

        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
            runtime: 'tfjs',
            enableSmoothing: true,
            modelType: 'full'
        };
        detector = await poseDetection.createDetector(model, detectorConfig);
        
        requestAnimationFrame(detectPose);
    } catch (error) {
        console.error('Error initializing:', error);
    }
}

// Detect poses in real-time
async function detectPose() {
    if (detector && video) {
        try {
            poses = await detector.estimatePoses(video);
            drawPose();
            analyzePose();
        } catch (error) {
            console.error('Error detecting pose:', error);
        }
    }
    requestAnimationFrame(detectPose);
}

// Draw the detected pose
function drawPose() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    poses.forEach(pose => {
        pose.keypoints.forEach(keypoint => {
            if (keypoint.score > 0.3) {
                ctx.beginPath();
                ctx.arc(keypoint.x, keypoint.y, 5, 0, 2 * Math.PI);
                ctx.fillStyle = 'red';
                ctx.fill();
            }
        });
    });
}

// Analyze the pose and display the name
function analyzePose() {
    if (poses.length > 0) {
        const pose = poses[0];
        // Simple pose analysis (can be expanded)
        const poseNameElement = document.getElementById('pose-name');
        poseNameElement.textContent = 'Current Pose: Standing';
    }
}

// Start the application
init();

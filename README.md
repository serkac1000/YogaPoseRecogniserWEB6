
# Yoga Pose Recognition Web App

A web application that uses machine learning to recognize yoga poses through webcam input.

## Features
- Real-time yoga pose detection using webcam
- Reference pose image comparison
- Confidence score display
- Easy-to-use settings interface

## Installation & Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/YogaPoseRecogniserWEB6.git
```

2. Navigate to the project directory:
```bash
cd YogaPoseRecogniserWEB6
```

3. Start a local server:
```bash
python3 -m http.server 5000 --bind 0.0.0.0
```

4. Open your browser and visit:
```
http://0.0.0.0:5000
```

## Usage
1. Open the web app
2. In Settings:
   - Enter your Teachable Machine model URL
   - Upload reference pose images
3. Click "Start Recognition" to begin pose detection
4. Allow camera access when prompted

## Requirements
- Modern web browser with webcam access
- Python 3.x for running local server

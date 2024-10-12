let openCvReady = false;
let faceCascade;
let utils;

function onOpenCvReady() {
  openCvReady = true;
  console.log('OpenCV.js is ready');

  // Load the face cascade classifier
  utils = new Utils('errorMessage'); // Create a utils object
  faceCascade = new cv.CascadeClassifier();

  // Load cascade file from the extension directory
  let faceCascadeFile = 'haarcascade_frontalface_default.xml';
  let faceCascadeFileURL = chrome.runtime.getURL(faceCascadeFile);

  utils.createFileFromUrl(faceCascadeFile, faceCascadeFileURL, () => {
    faceCascade.load(faceCascadeFile); // in the callback, load the cascade file
    console.log('Face cascade loaded');
  });
}

document.addEventListener('DOMContentLoaded', function () {
  let studyDurationInput = document.getElementById('studyDuration');
  let startButton = document.getElementById('startButton');
  let stopButton = document.getElementById('stopButton');
  let timerDisplay = document.getElementById('timerDisplay');

  let video = document.getElementById('video');
  let canvasOutput = document.getElementById('canvasOutput');
  let statsDiv = document.getElementById('stats');

  let studyDuration = 25 * 60; // seconds
  let timerInterval;
  let currentTime;

  let streaming = false;
  let src = null;
  let dst = null;
  let cap = null;

  let touchCount = 0;
  let phoneUsageTime = 0;
  let phoneUsageStart = null;

  let sessionData = {
    date: new Date().toLocaleDateString(),
    touchCount: 0,
    phoneUsageTime: 0
  };

  startButton.addEventListener('click', () => {
    studyDuration = parseInt(studyDurationInput.value) * 60;
    currentTime = studyDuration;
    startTimer();
    if (openCvReady) {
      startVideoProcessing();
    } else {
      console.log('Waiting for OpenCV to be ready...');
      let checkOpenCvInterval = setInterval(() => {
        if (openCvReady) {
          startVideoProcessing();
          clearInterval(checkOpenCvInterval);
        }
      }, 100);
    }
  });

  stopButton.addEventListener('click', () => {
    stopTimer();
    stopVideoProcessing();
    endSession();
  });

  function startTimer() {
    timerInterval = setInterval(() => {
      currentTime--;
      let minutes = Math.floor(currentTime / 60);
      let seconds = currentTime % 60;
      timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      if (currentTime <= 0) {
        stopTimer();
        stopVideoProcessing();
        endSession();
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerDisplay.textContent = "00:00";
  }

  function startVideoProcessing() {
    if (!openCvReady) {
      console.log('OpenCV is not ready yet');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        video.play();
        video.style.display = 'none'; // Hide the video element
        canvasOutput.style.display = 'none'; // Hide the canvas element
        streaming = true;
        cap = new cv.VideoCapture(video);
        src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
        dst = new cv.Mat(video.height, video.width, cv.CV_8UC1);
        processVideo();
      })
      .catch(function (err) {
        console.log("An error occurred: " + err);
      });
  }

  function stopVideoProcessing() {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(function (track) {
        track.stop();
      });
    }
    if (src && !src.isDeleted()) src.delete();
    if (dst && !dst.isDeleted()) dst.delete();
    if (cap && !cap.isDeleted()) cap.delete();
    streaming = false;
    video.style.display = 'none';
    canvasOutput.style.display = 'none';
  }

  function processVideo() {
    if (!streaming) return;
    let begin = Date.now();

    cap.read(src);

    // Flip the image horizontally (mirror image)
    cv.flip(src, src, 1);

    // Convert the image to grayscale
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);

    // Face detection
    let faces = new cv.RectVector();
    let msize = new cv.Size(0, 0);
    faceCascade.detectMultiScale(dst, faces, 1.1, 3, 0, msize, msize);

    let faceDetected = faces.size() > 0;

    // Phone usage detection logic
    if (!faceDetected) {
      if (!phoneUsageStart) {
        phoneUsageStart = Date.now();
      } else {
        let usageDuration = (Date.now() - phoneUsageStart) / 1000;
        if (usageDuration > phoneUsageAlertTime) {
          // Call out the user through audio
          playAudioFeedback();
          phoneUsageStart = null; // Reset
        }
      }
    } else {
      if (phoneUsageStart) {
        // Accumulate phone usage time
        phoneUsageTime += (Date.now() - phoneUsageStart) / 1000;
        phoneUsageStart = null;
        sessionData.phoneUsageTime = phoneUsageTime;
        console.log('Phone usage time:', phoneUsageTime);
      }
    }

    // Motion detection parameters
    if (!prevFrame) {
      prevFrame = new cv.Mat();
      dst.copyTo(prevFrame);
    } else {
      // Compute absolute difference between current frame and previous frame
      cv.absdiff(dst, prevFrame, diffFrame);

      // Threshold the difference to get the regions with significant changes
      cv.threshold(diffFrame, threshFrame, 25, 255, cv.THRESH_BINARY);

      // Count the number of non-zero pixels
      let nonZero = cv.countNonZero(threshFrame);

      if (nonZero > motionThreshold) {
        // Significant motion detected
        touchCount++;
        sessionData.touchCount = touchCount;
        console.log('Device touched:', touchCount);
      }

      // Copy current frame to previous frame for next iteration
      dst.copyTo(prevFrame);
    }

    // Schedule next frame processing
    let delay = 1000 / 10 - (Date.now() - begin);
    setTimeout(processVideo, delay);

    // Clean up
    faces.delete();
  }

  function playAudioFeedback() {
    let audio = new Audio('alert.mp3'); // Ensure alert.mp3 is in the extension directory
    audio.play();
  }

  function endSession() {
    // Display session stats
    statsDiv.innerHTML = `
      <p>Session Completed!</p>
      <p>Number of times you touched your device: ${sessionData.touchCount}</p>
      <p>Time spent on your phone: ${formatTime(sessionData.phoneUsageTime)}</p>
    `;

    // Save session data
    saveSessionData(sessionData);

    // Update and display the chart
    loadSessionData().then(data => {
      updateChart(data);
    });
  }

  function saveSessionData(data) {
    chrome.storage.local.get({ sessions: [] }, function (result) {
      let sessions = result.sessions;
      sessions.push(data);
      chrome.storage.local.set({ sessions: sessions }, function () {
        console.log('Session data saved.');
      });
    });
  }

  function loadSessionData() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get({ sessions: [] }, function (result) {
        resolve(result.sessions);
      });
    });
  }

  function updateChart(sessions) {
    let dates = sessions.map(s => s.date);
    let touchCounts = sessions.map(s => s.touchCount);
    let phoneUsageTimes = sessions.map(s => (s.phoneUsageTime / 60).toFixed(2)); // Convert to minutes

    let ctx = document.getElementById('statsChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Device Touches',
            data: touchCounts,
            borderColor: 'rgba(75,192,192,1)',
            fill: false,
          },
          {
            label: 'Phone Usage (min)',
            data: phoneUsageTimes,
            borderColor: 'rgba(192,75,192,1)',
            fill: false,
          }
        ]
      },
      options: {
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Count / Time'
            }
          }
        }
      }
    });
  }

  function formatTime(seconds) {
    let minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes} min ${seconds} sec`;
  }

  // Variables for motion detection
  let prevFrame = null;
  let diffFrame = new cv.Mat();
  let threshFrame = new cv.Mat();
  let motionThreshold = 5000; // Adjust based on sensitivity

  // Variables for phone usage detection
  let phoneUsageAlertTime = 10; // seconds before alerting

});

// Utils class for loading the face cascade
class Utils {
  constructor(errorOutputId) {
    this.errorOutputId = errorOutputId;
  }

  printError(err) {
    if (this.errorOutputId !== undefined) {
      document.getElementById(this.errorOutputId).innerHTML = err;
    } else {
      console.error(err);
    }
  }

  createFileFromUrl(path, url, callback) {
    let request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      if (request.readyState === 4) {
        if (request.status === 200) {
          let data = new Uint8Array(request.response);
          cv.FS_createDataFile('/', path, data, true, false, false);
          callback();
        } else {
          this.printError('Failed to load ' + url + ' status: ' + request.status);
        }
      }
    };
    request.send();
  }
}

// main.js
let socket = null;
let matchedSocketId = null;
let localStream = null;
let peerConnection = null;
let isVideoCallActive = false;

// Initialize socket connection
socket = io("http://localhost:3000/");

// DOM Elements
const genderSelect = document.getElementById('gender');
const interestInput = document.getElementById('interest');
const findMatchButton = document.getElementById('find-match');
const messageInput = document.getElementById('message');
const sendMessageButton = document.getElementById('send-message');
const messagesTextarea = document.getElementById('messages');
const disconnectButton = document.getElementById('disconnect');
const interestButtons = document.querySelectorAll('#interest-buttons button');
const startCallButton = document.getElementById("start-call");
const endCallButton = document.getElementById("end-call");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// Ice server configuration
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

// Event listeners
interestButtons.forEach(button => {
  button.addEventListener('click', () => {
    const selectedInterest = button.getAttribute('data-interest');
    interestInput.value = selectedInterest;
  });
});

findMatchButton.addEventListener('click', () => {
  const preferences = {
    gender: genderSelect.value,
    interest: interestInput.value
  };

  socket.emit('user-details', preferences);
  messagesTextarea.value = "🔍 Searching for a match...";
});

startCallButton.addEventListener("click", () => {
  if (matchedSocketId) {
    initiateVideoCall();
  } else {
    alert("You need to be matched with someone first.");
  }
});

endCallButton.addEventListener("click", () => {
  if (matchedSocketId && isVideoCallActive) {
    endVideoCall();
    socket.emit("end-call", matchedSocketId);
  }
});

sendMessageButton.addEventListener('click', () => {
  const message = messageInput.value.trim();

  if (message && matchedSocketId) {
    messagesTextarea.value += `\nYou: ${message}`;
    socket.emit('send-message', message, matchedSocketId);
    messageInput.value = '';
  } else {
    messagesTextarea.value += "\n⚠️ No match to send message.";
  }
});

disconnectButton.addEventListener('click', () => {
  if (matchedSocketId) {
    endVideoCall();
    socket.emit('disconnect-chat', matchedSocketId);
    messagesTextarea.value = "🔌 Disconnected.";
    matchedSocketId = null;
  } else {
    messagesTextarea.value += "\n⚠️ Not connected to anyone.";
  }
});

// Socket event handlers
socket.on('disconnect', () => {
  endVideoCall();
  messagesTextarea.value += "\n🔌 Disconnected from server.";
  matchedSocketId = null;
});

socket.on('disconect', message => {
  if (matchedSocketId !== null) {
    endVideoCall();
    matchedSocketId = null;
    messagesTextarea.value += `\n${message}`;
  } else {
    messagesTextarea.value += `\nYou are not connected`;
  }
});

socket.on('match-found', data => {
  if (data.matched) {
    messagesTextarea.value = "✅ Match found! Start chatting!";
    matchedSocketId = data.socketId;
    console.log("Matched with:", matchedSocketId);
  }
});

socket.on('receive-message', message => {
  messagesTextarea.value += `\nPartner: ${message}`;
});

// WebRTC functions
async function initiateVideoCall() {
  try {
    messagesTextarea.value += "\n📞 Initiating video call...";
    socket.emit("start-call", matchedSocketId);
  } catch (error) {
    console.error("Error initiating call:", error);
    messagesTextarea.value += "\n⚠️ Error initiating video call.";
  }
}

async function startLocalStream() {
  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
    }
    return true;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    messagesTextarea.value += "\n⚠️ Error accessing camera/microphone. Please check permissions.";
    return false;
  }
}

function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(iceServers);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate, matchedSocketId);
    }
  };

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === "failed" ||
      peerConnection.iceConnectionState === "disconnected" ||
      peerConnection.iceConnectionState === "closed") {
      messagesTextarea.value += "\n⚠️ Video connection lost.";
    }
  };

  return peerConnection;
}

function endVideoCall() {
  isVideoCallActive = false;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  messagesTextarea.value += "\n📞 Video call ended.";
}

// WebRTC socket event handlers
socket.on("start-video", async (partnerId) => {
  try {
    matchedSocketId = partnerId;
    const streamStarted = await startLocalStream();
    if (!streamStarted) return;

    createPeerConnection();
    isVideoCallActive = true;

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("video-offer", offer, partnerId);

    messagesTextarea.value += "\n📞 Sending video offer...";
  } catch (error) {
    console.error("Error starting video:", error);
    messagesTextarea.value += "\n⚠️ Error starting video call.";
  }
});

socket.on("video-offer", async (offer, partnerId) => {
  try {
    messagesTextarea.value += "\n📞 Received video call offer...";
    matchedSocketId = partnerId;

    const streamStarted = await startLocalStream();
    if (!streamStarted) return;

    createPeerConnection();
    isVideoCallActive = true;

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("video-answer", answer, partnerId);

    messagesTextarea.value += "\n📞 Sending video answer...";
  } catch (error) {
    console.error("Error handling video offer:", error);
    messagesTextarea.value += "\n⚠️ Error answering video call.";
  }
});

socket.on("video-answer", async (answer) => {
  try {
    messagesTextarea.value += "\n📞 Received video answer...";
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    console.error("Error handling video answer:", error);
    messagesTextarea.value += "\n⚠️ Error connecting video call.";
  }
});

socket.on("ice-candidate", async (candidate) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
});

socket.on("end-video", () => {
  endVideoCall();
  messagesTextarea.value += "\n📞 The other user ended the video call.";
});
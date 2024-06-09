const express = require('express');
const Base64 = require('crypto-js/enc-base64');
const { HmacSHA256 } = require('crypto-js');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

const { Server } = require('socket.io');
const { createServer } = require('node:http');
// 建立 HTTP 伺服器
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 或者指定你的前端 URL
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }, addTrailingSlash: false
});

const userService = new Map();

function getRoomSize(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? room.size : 0;
}
function roomSizeMsg(roomId) {
  const roomSize = getRoomSize(roomId);
  io.to(roomId).emit("roomSize", roomSize);
}

io.on('connection', (socket) => {

  socket.on('login', (info) => { // 加入聊天室
    socket.join(socket.id);
    const { name, roomId } = info;
    if (!userService.has(`${roomId}${name}`)) {
      io.to(socket.id).emit('loginStatus', true);
    } else {
      io.to(socket.id).emit('loginStatus', false);
    }
  });
  socket.on('joinRoom', (info) => { // 加入聊天室
    const { name, roomId } = info;
    userService.set(`${roomId}${name}`, { info, id: socket.id })
    socket.join(roomId);
    io.to(roomId).emit('systemMsg', `${name}加入了聊天室!`);
    roomSizeMsg(roomId)
  });
  socket.on('sendMessage', (messageInfo) => {
    const { userName, roomId, message } = messageInfo
    io.to(roomId).emit('returnMessage', { userName, message });
  });
  socket.on('leaveRoom', (info) => { // 離開聊天室
    const { name, roomId, isReload } = info;
    const leaveUser = userService.get(`${roomId}${name}`);
    if (leaveUser && isReload) {
      // 針對新開視窗做處理
      // 將停留在原畫面的使用者一併做登出
      io.to(leaveUser.id).emit('logout');
      const room = io.sockets.adapter.rooms.get(roomId); // 將強制登出的使用者從room名單中移除
      room.delete(leaveUser.id)
    } else {
      socket.leave(roomId);
    }
    roomSizeMsg(roomId)
    io.to(roomId).emit('systemMsg', `${name}離開了聊天室!`);
    userService.delete(`${roomId}${name}`)
  });

});


app.use(express.json());
app.use(cors());


const createHeader = (uri, params) => {
  const ChannelSecret = "080c23a52d12238f48e2d38044a2a09d";
  const nonce = parseInt(new Date().getTime() / 1000);
  const string = `${ChannelSecret}${uri}${JSON.stringify(params)}${nonce}`;
  const hmacDigest = Base64.stringify(HmacSHA256(string, ChannelSecret));

  return {
    "Content-Type": "application/json",
    'X-LINE-ChannelId': '2004505560',
    'X-LINE-Authorization': hmacDigest,
    "X-LINE-Authorization-Nonce": nonce
  };
};

app.post('/linepay/request', async (req, res) => {
  const requestBody = req.body;
  const requestUri = "/v3/payments/request";
  const headers = createHeader(requestUri, requestBody);
  try {
    const response = await axios.post(`https://sandbox-api-pay.line.me${requestUri}`, requestBody, { headers });
    res.json(response.data);
  } catch (error) {
    res.status(error.response.status).json(error.response.data);
  }
});

app.post('/payments/confirm', async (req, res) => {
  const requestBody = req.body;
  const { transactionId, amount, currency } = requestBody;
  const requestUri = `/v3/payments/${transactionId}/confirm`;
  const params = { amount, currency };
  const headers = createHeader(requestUri, params);
  try {
    const response = await axios.post(`https://sandbox-api-pay.line.me${requestUri}`, params, { headers });
    res.json(response.data);
  } catch (error) {
    res.status(error.response.status).json(error.response.data);
  }
});


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

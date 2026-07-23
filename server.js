const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Masa Yönetimi
let activePlayers = [];
let matchmakingQueue = [];
let gameRooms = {};
let roomCounter = 1;

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Oyuncu Girişi
  socket.on('joinGame', (playerData) => {

    socket.playerData = { ...playerData, id: socket.id };
    activePlayers.push(socket.playerData);

    // Bağlanan oyuncuya kendi durumunu bildir
    socket.emit('gameJoined', { socketId: socket.id });

    // Salondaki herkese güncel sohbet uyarısı at
    io.emit('chatMessage', {
        sender: 'Sistem',
        text: `${playerData.name} (${playerData.id}) masaya giriş yaptı!`
    });

});

       
// Eşleştirme Sistemi
socket.on('findMatch', () => {

    if (!matchmakingQueue.includes(socket.id)) {
        matchmakingQueue.push(socket.id);
    }

    io.emit('queueUpdate', {
        waiting: matchmakingQueue.length
    });

    if (matchmakingQueue.length >= 4) {

        const players = matchmakingQueue.splice(0, 4);

        const roomId = "room_" + roomCounter++;

        gameRooms[roomId] = {
            id: roomId,
            players
        };

        players.forEach(playerId => {

            const playerSocket =
                io.sockets.sockets.get(playerId);

            if (playerSocket) {

            playerSocket.join(roomId);

playerSocket.roomId = roomId;

playerSocket.emit('matchFound', {
    roomId,
    players: players.length
});

            }

        });

        io.to(roomId).emit('gameStart', {
            roomId
        });

    }

});
    // Canlı Sohbet Mesajları
    socket.on('sendMessage', (data) => {

    if (socket.roomId) {

        io.to(socket.roomId).emit(
            'chatMessage',
            {
                sender: data.sender,
                text: data.text
            }
        );

    }

});

    // Oyuncunun Taş Çekmesi
    socket.on('drawTile', () => {

    if (!socket.roomId) return;

    io.to(socket.roomId).emit(
        'chatMessage',
        {
            sender: 'Sistem',
            text: `${socket.playerData?.name || 'Bir oyuncu'} desteden taş çekti.`
        }
    );

});

    // Oyuncunun Taş Atması
   socket.on('discardTile', (tile) => {

    if (!socket.roomId) return;

    socket.to(socket.roomId).emit(
        'playerDiscarded',
        {
            tile,
            sender: socket.playerData?.name
        }
    );

});

  // Bağlantı Kopması



 // Bağlantı Kopması
socket.on('disconnect', () => {

    matchmakingQueue = matchmakingQueue.filter(id => id !== socket.id);
    activePlayers = activePlayers.filter(p => p.id !== socket.id);

    io.emit('chatMessage', {
        sender: 'Sistem',
        text: 'Bir oyuncu masadan ayrıldı.'
    });

    console.log('Oyuncu ayrıldı:', socket.id);
});

});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Okey 3D Pro Sunucusu ${PORT} portunda aktif!`);
    
});
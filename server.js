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

// =========================
// Sunucu Oyun Durumu
// =========================

const gameState = {
    deck: [],
    players: {},
    discardPile: [],
    currentTurn: null,
    indicator: null,
    okeyTile: null
};

// =========================
// Okey Destesi
// =========================

function createDeck() {

    const colors = ["red", "blue", "black", "yellow"];
    const deck = [];

    for (let copy = 0; copy < 2; copy++) {

        for (const color of colors) {

            for (let number = 1; number <= 13; number++) {

                deck.push({
                    color,
                    number,
                    joker: false
                });

            }

        }

    }

    // 2 Sahte Okey (False Joker)
    deck.push({
        color: "joker",
        number: 0,
        joker: true
    });

    deck.push({
        color: "joker",
        number: 0,
        joker: true
    });

    return deck;

}

function shuffleDeck(deck) {

    for (let i = deck.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [deck[i], deck[j]] = [deck[j], deck[i]];

    }

    return deck;

}

function createPlayer(socketId) {
    return {
        id: socketId,
        hand: [],
        score: 0,
        connected: true
    };
}

io.on("connection", (socket) => {

    console.log("Yeni oyuncu bağlandı:", socket.id);

    gameState.players[socket.id] = createPlayer(socket.id);

    console.log("Oyuncu kaydedildi:", socket.id);

    socket.on("joinGame", (playerData) => {

    socket.playerData = {
        ...playerData,
        id: socket.id
    };

    activePlayers.push(socket.playerData);

    socket.emit("gameJoined", {
        socketId: socket.id
    });

    io.emit("chatMessage", {
        sender: "Sistem",
        text: `${playerData.name} masaya giriş yaptı.`
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

        const deck = shuffleDeck(createDeck());

const indicator = deck.pop();

let okeyTile = null;

if (indicator.color !== "joker") {

    okeyTile = {
        color: indicator.color,
        number: indicator.number === 13 ? 1 : indicator.number + 1,
        joker: false
    };

}

gameRooms[roomId] = {
    id: roomId,
    players,
    deck,
    discardPile: [],
    currentTurn: players[0],
    indicator,
    okeyTile
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
// Oyunculara taş dağıt
players.forEach((playerId, index) => {

    const playerSocket = io.sockets.sockets.get(playerId);

    if (!playerSocket) return;

    const hand = [];

    const tileCount = index === 0 ? 15 : 14;

    for (let i = 0; i < tileCount; i++) {
        hand.push(gameRooms[roomId].deck.pop());
    }

    gameState.players[playerId].hand = hand;

    playerSocket.emit("yourHand", hand);

});

// İlk oyuncuya sıra ver
io.to(roomId).emit("turnChanged", gameRooms[roomId].currentTurn);

// Oyun durumunu gönder
io.to(roomId).emit("gameState", {
    discardPile: gameRooms[roomId].discardPile,
    deckCount: gameRooms[roomId].deck.length,
    currentTurn: gameRooms[roomId].currentTurn
});

io.to(roomId).emit("indicatorSelected", {
    indicator: gameRooms[roomId].indicator
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
    socket.on("drawTile", () => {

    if (!socket.roomId) return;

    const room = gameRooms[socket.roomId];

    if (!room) return;

    const player = gameState.players[socket.id];

    if (!player) return;

    if (room.currentTurn !== socket.id) {
    socket.emit("invalidMove", "Sıra sende değil.");
    return;
}

    if (room.deck.length === 0) {

        socket.emit("deckEmpty");

        return;

    }

    const tile = room.deck.pop();

    player.hand.push(tile);

    socket.emit("tileDrawn", tile);

    io.to(socket.roomId).emit("gameState", {
    discardPile: room.discardPile,
    deckCount: room.deck.length,
    currentTurn: room.currentTurn
});

    io.to(socket.roomId).emit("chatMessage", {
        sender: "Sistem",
        text: `${socket.playerData?.name || "Bir oyuncu"} desteden taş çekti.`
    });

});


    // Oyuncunun Taş Atması
   socket.on("discardTile", (tile) => {

    if (!socket.roomId) return;

    const room = gameRooms[socket.roomId];

    if (!room) return;

    const player = gameState.players[socket.id];

    if (!player) return;

    const tileIndex = player.hand.findIndex(t =>
        t.color === tile.color &&
        t.number === tile.number &&
        t.joker === tile.joker
    );

    if (tileIndex === -1) {
        socket.emit("invalidMove", "Bu taş elinde yok.");
        return;
    }

    const discardedTile = player.hand.splice(tileIndex, 1)[0];

    room.discardPile.push(discardedTile);

    io.to(socket.roomId).emit("gameState", {
    discardPile: room.discardPile,
    deckCount: room.deck.length,
    currentTurn: room.currentTurn
});

    io.to(socket.roomId).emit("playerDiscarded", {
        playerId: socket.id,
        tile: discardedTile
    });
    
const currentIndex = room.players.indexOf(socket.id);

room.currentTurn = room.players[(currentIndex + 1) % room.players.length];

io.to(socket.roomId).emit("turnChanged", room.currentTurn);

io.to(socket.roomId).emit("gameState", {
    discardPile: room.discardPile,
    deckCount: room.deck.length,
    currentTurn: room.currentTurn
});

});

  // Bağlantı Kopması



 // Bağlantı Kopması
socket.on('disconnect', () => {

    delete gameState.players[socket.id];

console.log("Oyuncu silindi:", socket.id);

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
console.log('started server');

const io = require("socket.io");
const server = io.listen(5000);
//http:localhost:5000/:game/:roomId

const gameChoices = ['/spyfall', '/tictactoe', '/war'];
const gameMD = new Map();

gameChoices.forEach(game => {
  gameMD.set(game, {
    nsp: server.of(game),
    rooms: [],
  })
})

const players = new Map();
const socketIDtoPlayer = new Map();

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data) {
      console.log(data);
      data.disconnectTime = -1;
      socketIDtoPlayer.set(socket.id, data.uuid);
      players.set(data.uuid, data);
    })

    socket.on('createRoom', function(uuid) {
      console.log(uuid);
      socket.join(uuid);
      console.log('created a room');
      console.log(socket.rooms);
      socket.emit('createdRoom', uuid);
    });
    
    // when socket disconnects, remove it from the list:
    // also keep a time stamp since last login for player
    socket.on("forceDisconnect", function(){
      const player = socketIDtoPlayer.get(socket.id);
      const playerData = players.get(player);
      playerData.disconnectTime = Date.now();
      socket.disconnect();
      console.info(`Client gone [id=${socket.id}]`);
    });

    socket.on("disconnect", () => {
      const player = socketIDtoPlayer.get(socket.id);
      const playerData = players.get(player);
      playerData.disconnectTime = Date.now();
      console.info(`Client gone [id=${socket.id}]`);
    });

    socket.on
  });
})

server.of('/spyfall').on("connection", (socket) => {
  socket.on('hello world', function(data) {
    console.log(data);
    socket.emit('print', 'welcome');
  })
})


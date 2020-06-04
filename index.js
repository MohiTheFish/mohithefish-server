console.log('started server');

const io = require("socket.io");
const server = io.listen(5000);

const gameChoices = ['/spyfall', '/tictactoe', '/war'];
const gameMD = new Map();

gameChoices.forEach(game => {
  gameMD.set(game, {
    nsp: server.of(game),
    rooms: [],
  })
})

const players = new Map();

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When use first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data) {
      console.log(data);
      players.set(socket.id, data);
    })
    
    // when socket disconnects, remove it from the list:
    socket.on("disconnect", () => {
      players.delete(socket.id);
      console.info(`Client gone [id=${socket.id}]`);
    });
  });
})

server.of('/spyfall').on("connection", (socket) => {
  socket.on('hello world', function(data) {
    console.log(data);
    socket.emit('print', 'welcome');
  })
})


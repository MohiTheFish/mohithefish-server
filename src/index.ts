import { Socket } from "socket.io";

console.log('started server');

const Room = require("./room");
const Player = require("./player");

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

const rooms = new Map();
const socketIDtoPlayer = new Map();


// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket: Socket) => {
    console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data:Object) {
      console.log(data);
      const p = new Player(data);
      socketIDtoPlayer.set(socket.id, p);
    });

    socket.on('createRoom', function(uuid:string) {
      socket.join(uuid);
      rooms.set(uuid, new Room(socketIDtoPlayer.get(socket.id)))
      console.log('created a room');
      socket.emit('createdRoom', uuid);
    });
    
    // when socket disconnects, remove it from the list:
    // also keep a time stamp since last login for player
    socket.on("forceDisconnect", function(){
      const player = socketIDtoPlayer.get(socket.id);
      player.disconnectPlayer();
      socket.disconnect();
      console.info(`Client forced out [id=${socket.id}]`);
    });

    socket.on("disconnect", () => {
      const player = socketIDtoPlayer.get(socket.id);
      player.disconnectPlayer();
      console.info(`Client gone [id=${socket.id}]`);
    });

  });
})

server.of('/spyfall').on("connection", (socket: Socket) => {
  socket.on('hello world', function(data: any) {
    console.log(data);
    socket.emit('print', 'welcome');
  })
})



import io, {Socket} from "socket.io";
import { v4 as uuid } from 'uuid';
import Player from './player';
import Room, {ConciseRoomInfo} from './room';
import SpyfallRoom from './Room/spyfall';
import MafiaRoom from "./Room/mafia";

var allowedOrigins = "http://mohithefish.github.io/:* http://mohithefish.github.io:*";
const server = io.listen((process.env.PORT || 5000), {
  origins: "*:*"
  // origins: allowedOrigins
});

//http:localhost:5000/:game/:roomId

const gameChoices = ['spyfall', 'mafia', 'war'];
const nameSpaceToRooms = new Map<string, Room[]>();
const rooms = new Map<string, Room>();
const userIdToPlayer = new Map<string, Player>();
const socketToUserId = new Map<string, string>();

// When user requests to join a room
export type RoomData = {
  userId: string;
  targetRoom: string;
  submittedId: boolean;
};
// Initialize the map of game to rooms.
gameChoices.forEach(game => {
  nameSpaceToRooms.set(game, []);
});

function deleteRoomFromNamespace(game: string, roomToDelete: Room) {
  const rooms: Array<Room> = nameSpaceToRooms.get(game)!;
  for(let i=0; i<rooms.length; i++){
    const room = rooms[i];
    if (room === roomToDelete) {
      room.end();
      rooms.splice(i, 1);
      break;
    }
  }
}


function deleteHost(room: Room) {
  const shouldDeleteRoom = room.removeHost();
  if (shouldDeleteRoom) {
    deleteRoomFromNamespace(room.roomType, room);
  }
}

function ejectPlayer(socket: io.Socket, server: io.Server) : Player | undefined {
  const userId = socketToUserId.get(socket.id);
  if (!userId) {return;}
  const player = userIdToPlayer.get(userId)!;
  const roomId = player.roomId;
  // If player is already in a room
  if (roomId) {
    // Remove them from that room
    socket.leave(roomId);
    const currentRoom = rooms.get(roomId)!;
    let index = 0;
    // Delete the player from the room, and return the index of where they were in the room. 
    if(currentRoom.host === player) {
      deleteHost(currentRoom);
    }
    else {
      index = currentRoom.removePlayer(player);
    }
    server.to(roomId).emit('playerLeft', index);
  }
  return player;
}

// event fired every time a new client connects:
server.on("connection", (socket: Socket) => {
  // console.info(`Client connected [id=${socket.id}] and is playing ${game}`);

  // When user first connects, they send over some data about what game they are playing
  // They also provide their name.
  socket.on('initialConnection', function (userId: string) {
    // For disconnect, we want to be able to determine which player was the one that connected.
    socketToUserId.set(socket.id, userId);
    const player = userIdToPlayer.get(userId);
    if (player) {
      player.connectPlayer(socket);
    }
    else {
      userIdToPlayer.set(userId, new Player(userId, socket));
    }
  });

  
  socket.on('updateMyName', function([userId, username]){
    const player = userIdToPlayer.get(userId)!;
    player.updateName(username);
    socket.emit('nameUpdated', player.username);
  });

  socket.on('createRoom', function(args: any[]) {
    const [userId, game, settings] = args;
    console.log(args);

    // Get player from their userId;
    const player = userIdToPlayer.get(userId)!;

    // Create a new room id.
    const newroomId = uuid();

    // Have socket listen on the room
    socket.join(newroomId);

    // Create the new room
    let newRoom: any;
    switch(game) {
      case gameChoices[0]: {
        newRoom = new SpyfallRoom(newroomId, player, settings);
        break;
      }
      case gameChoices[1]: {
        newRoom = new MafiaRoom(newroomId, player, settings);
        break;
      }
      default: {
        newRoom = new Room(newroomId, player, 'basic');
      }
    }
    
    // Add it to our dictionary
    rooms.set(newroomId, newRoom);

    // Add it to list of rooms available for this game.
    nameSpaceToRooms.get(game)!.push(newRoom);

    socket.emit('createdRoom', newRoom.getRoomInfo());
  });

  socket.on('updateSettings', function(args: any[]){
    const [userId, settings] = args;
    // Get player from their userId;
    const player = userIdToPlayer.get(userId)!; 

    // Get room player is in.
    const room = rooms.get(player.roomId)!; 

    // Update room settings
    const newSettings = room.updateSettings(settings);

    // Inform players
    server.to(player.roomId).emit('settingsUpdated', newSettings)
  });

  socket.on('togglePrivateRoom', function(userId: string) {
    const player = userIdToPlayer.get(userId)!; 
    const room = rooms.get(player.roomId)!; 
    const newPrivate = room.togglePrivate();
    socket.emit('toggledPrivate', newPrivate);
  });

  socket.on('ejectPlayerFromRoom', function() {
    ejectPlayer(socket, server);
  });

  socket.on('getAvailableRooms', function(game: string) {
    // Get player from their userId
    ejectPlayer(socket, server);

    // Otherwise just iterate through all the rooms this namespace has. 
    const candidateRooms = nameSpaceToRooms.get(game)!;
    console.log(candidateRooms);
    const availableRooms: Array<ConciseRoomInfo> = [];
    candidateRooms.forEach(room => {
      if (!room.isPrivate) {
        availableRooms.push(room.getConciseRoomInfo());
      }
    });
    socket.emit('availableRooms', availableRooms);
  });

  socket.on('joinRoom', function(data: RoomData) {
    // The user is trying to join a room.
    const {targetRoom, userId, submittedId} = data;
    const room = rooms.get(targetRoom);
    // If room exists
    
    if (room) {
      
      // @TODO Let players be able to join a room via id after it has already been created. */
      // if (room.isPrivate && !submittedId) {
      //   socket.emit('needId');
      // }
      // Get player and add them to room;
      const player = userIdToPlayer.get(userId)!;
      room.addPlayer(player);

      // Inform everyone currently in the room that someone else has joined.
      const roomInfo = room.getRoomInfo();
      server.to(targetRoom).emit('othersJoined', roomInfo);
      socket.join(targetRoom);

      const roomSettings = room.getSettings();
      // Inform original client that they have now joined.
      socket.emit('youJoined', roomSettings);
    }
    else {
      socket.emit('invalidRoom', `${targetRoom} was not found.`);
    }
  });

  socket.on('startGame', function(userId: string) {
    // Get player from their id.
    const player = userIdToPlayer.get(userId)!;
    // Get the room they are in.
    const roomId = player.roomId;
    const room = (rooms.get(roomId)!);
    // Start the game and return game information.
    room.begin(server);
    
    // The players are notified inside of the begin function for their respective game.
  });

  socket.on('returnToLobby', function(userId: string) {
    const player = userIdToPlayer.get(userId)!;
    const roomId = player.roomId;
    const room = (rooms.get(roomId)!);
    room.end();

    server.to(roomId).emit('sentBackToLobby');
  });

  // when socket disconnects, remove it from the list:
  // also keep a time stamp since last login for player
  socket.on("forceDisconnect", function(){
    throw new Error('Client was force disconnected');
    const playerid = socketToUserId.get(socket.id)!;
    const player = userIdToPlayer.get(playerid)!;
    player.disconnectPlayer();
    socket.disconnect();
    console.info(`Client forced out [id=${socket.id}]`);
  });

  socket.on("disconnect", () => {
    // Remove player if they are in a room
    const player = ejectPlayer(socket, server);
    if (player){
      player.disconnectPlayer();
    }
  });

});

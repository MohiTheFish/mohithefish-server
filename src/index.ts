
import io, {Socket} from "socket.io";
import { v4 as uuid } from 'uuid';
import Player from './player';
import Room, {ConciseRoomInfo} from './room';
import SpyfallRoom from './Room/spyfall';

var allowedOrigins = "http://mohithefish.github.io/:* http://mohithefish.github.io:*";
const server = io.listen((process.env.PORT || 5000), {
  origins: "*:*"
  // origins: allowedOrigins
});

//http:localhost:5000/:game/:roomId

const gameChoices = ['/spyfall', '/mafia', '/war'];
const gameMD = new Map();

gameChoices.forEach(game => {
  gameMD.set(game, {
    nsp: server.of(game),
    rooms: [],
  })
})

const nameSpaceToRooms = new Map<string, Room[]>();
const rooms = new Map<string, Room>();
const userIdToPlayer = new Map<string, Player>();
const socketToUserId = new Map<string, string>();

export type PlayerData = {
  userId: string,
  username: string,
  gamename: string,
  disconnectTime: number,
};

export type RoomData = {
  userId: string;
  targetRoom: string;
  submittedId: boolean;
};

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


function deleteHost(room: Room, game:string) {
  const shouldDeleteRoom = room.removeHost();
  if (shouldDeleteRoom) {
    deleteRoomFromNamespace(game, room);
  }
}

function ejectPlayer(socket: io.Socket, game: string, server: io.Server) : Player {
  const userId = socketToUserId.get(socket.id)!;
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
      deleteHost(currentRoom, game);
    }
    else {
      index = currentRoom.removePlayer(player);
    }
    server.of(game).to(roomId).emit('playerLeft', index);
  }
  return player;
}

// event fired every time a new client connects:
gameChoices.forEach(game => {
  server.of(game).on("connection", (socket: Socket) => {
    // console.info(`Client connected [id=${socket.id}] and is playing ${game}`);
  
    // When user first connects, they send over some data about what game they are playing
    // They also provide their name.
    socket.on('initialConnection', function (data: PlayerData) {
      // For disconnect, we want to be able to determine which player was the one that connected.
      socketToUserId.set(socket.id, data.userId);
      const player = userIdToPlayer.get(data.userId);
      if (player) {
        player.connectPlayer();
      }
      else {
        userIdToPlayer.set(data.userId, new Player(data));
      }
    });

    socket.on('createRoom', function(args: any[]) {
      const [userId, settings] = args;

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
        default: {
          newRoom = new Room(newroomId, player);
        }
      }
      
      // Add it to our dictionary
      rooms.set(newroomId, newRoom);

      // Add it to list of rooms available for this game.
      nameSpaceToRooms.get(game)!.push(newRoom);

      // Return room info.
      socket.emit('createdRoom', newRoom.getRoomInfo());
    });

    socket.on('updateMyName', function([userId, name]){
      const player = userIdToPlayer.get(userId)!;
      player.username = name;

      // @TODO The server should notify the client that their name has been updated.
      // Currently the client assumes that it has been updated by the time they need to use it.
      // socket.emit()
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
      server.of(game).to(player.roomId).emit('settingsUpdated', newSettings)
    });

    socket.on('togglePrivateRoom', function(userId: string) {
      const player = userIdToPlayer.get(userId)!; 
      const room = rooms.get(player.roomId)!; 
      const newPrivate = room.togglePrivate();
      socket.emit('toggledPrivate', newPrivate);
    });

    socket.on('ejectPlayerFromRoom', function(userId: string) {
      ejectPlayer(socket, game, server);
    });

    socket.on('getAvailableRooms', function(userId:string) {
      // Get player from their userId
      ejectPlayer(socket, game, server);

      // Otherwise just iterate through all the rooms this namespace has. 
      // @TODO - Add checks for max occupancy.
      console.log(game);
      const candidateRooms = nameSpaceToRooms.get(game)!;
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
        server.of(game).to(targetRoom).emit('othersJoined', roomInfo);
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
      const gameState = room.begin(server);
      server.of(game).to(roomId).emit('gameStarted', gameState);
    });

    socket.on('returnToLobby', function(userId: string) {
      const player = userIdToPlayer.get(userId)!;
      const roomId = player.roomId;
      const room = (rooms.get(roomId)!);
      room.end();

      server.of(game).to(roomId).emit('sentBackToLobby');
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
      const player = ejectPlayer(socket, game, server);
      player.disconnectPlayer();
    });

  });
})

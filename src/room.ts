import io from 'socket.io';
import Player from './player';

export const GAMESTARTED: string = 'gameStarted';

export type ConciseRoomInfo = {
  hostname: string,
  numPlayers: number,
  roomId: string,
  isPrivate: boolean,
};

export type LobbyRoomInfo = {
  members: Array<string>,
  spectators: Array<string>,
  roomId: string,
  settings?: any
}

export default class Room {
  roomId: string;
  roomType: string;
  members: Array<Player>;
  spectators: Array<Player>;
  currentlyInGame: boolean = false;
  isPrivate: boolean = false;
  server: io.Server;

  constructor(roomId: string, host: Player, server: io.Server, roomType: string) {
    this.roomId = roomId;
    host.roomId = roomId;
    this.members = [host];
    this.spectators = [];
    this.roomType = roomType;
    this.server = server;
  }

  updateSettings(settings:any) {
    // Set is private eventually
  }
  getSettings() : LobbyRoomInfo {
    // prototyping for subclasses to use
    return this.getRoomInfo();
  }
  getRoomInfo() : LobbyRoomInfo {
    let memberNames = this.members.map(m => m.username);
    let spectatorNames = this.spectators.map(m => m.username);
    return {
      members: memberNames,
      spectators: spectatorNames,
      roomId: this.roomId,
    };
  }

  togglePrivate() : boolean {
    this.isPrivate = !this.isPrivate;
    return this.isPrivate;
  }

  getConciseRoomInfo() : ConciseRoomInfo {
    return {
      hostname: this.members[0].username,
      numPlayers: this.members.length,
      roomId: this.roomId,
      isPrivate: this.isPrivate,
    };
  }

  addPlayer(player: Player) : void {
    player.roomId = this.roomId;
    if (this.currentlyInGame) {
      this.spectators.push(player);
      const roomSettings = this.getSettings();
      player.socket?.emit('youSpectated', roomSettings);
    }
    else {
      this.members.push(player);
      // Inform everyone currently in the room that someone else has joined.
      const roomInfo = this.getRoomInfo();
      this.server.to(this.roomId).emit('othersJoined', roomInfo);
      player.socket?.join(this.roomId);

      const roomSettings = this.getSettings();
      // Inform original client that they have now joined.
      player.socket?.emit('youJoined', roomSettings);
    }
    
  }

  deleteRoomFromNamespace(nameSpaceToRooms: Map<string, Room[]>) {
    const rooms: Array<Room> = nameSpaceToRooms.get(this.roomType)!;
    for(let i=0; i<rooms.length; i++){
      const room = rooms[i];
      if (room === this) {
        room.end();
        this.informSpectators();
        rooms.splice(i, 1);
        break;
      }
    }
  }

  deleteHost(nameSpaceToRooms: Map<string, Room[]>) {
    const shouldDeleteRoom = this.removeHost();
    if (shouldDeleteRoom) {
      this.deleteRoomFromNamespace(nameSpaceToRooms);
    }
  }

  removePlayer(player: Player, nameSpaceToRooms: Map<string, Room[]>) {
    console.log('currently in game:' + this.currentlyInGame);
    // If players are in the game, we do not want to screw around with the indexing situation. 
    if (this.currentlyInGame) { return; }

    player.socket?.leave(this.roomId);
    let index = 0;
    // Delete the player from the room, and return the index of where they were in the room. 
    if(this.host === player) {
      this.deleteHost(nameSpaceToRooms);
    }
    else {
      index = this.members.indexOf(player);
      if (index > -1) {
        this.members.splice(index, 1);
      }
      player.roomId = "";
    }
    console.log('index of removed player:' + index);
    this.server.to(this.roomId).emit('playerLeft', index);
  }

  get host() {
    return this.members[0];
  }

  removeHost() : boolean {
    if (this.members.length === 1) {
      return true;
    }
    const host = this.members[0];
    host.roomId = "";
    this.members.shift();
    return false;
  }

  begin() {
    this.currentlyInGame = true;
  }

  end() {
    this.currentlyInGame = false;
  }

  returnToLobby(nameSpaceToRooms: Map<string, Room[]>) {
    this.clearInactivePlayers(nameSpaceToRooms);
    this.addSpectatorsToLobby();
  }
  clearInactivePlayers(nameSpaceToRooms: Map<string, Room[]>) {
    for(var i = 0; i<this.members.length; i++) {
      const player = this.members[i];
      if(player.disconnectTime > 0) { // are disconnected
        this.removePlayer(player, nameSpaceToRooms);
        i--;
      }
    }
  }
  addSpectatorsToLobby() {
    this.spectators.forEach(player => {
      this.members.push(player)
    })
  }
  informSpectators() {
    this.server.to(this.roomId).emit('roomClosed');
  }
}
import io from 'socket.io';
import Player from './player';

export const GAMESTARTED: string = 'gameStarted';

export type ConciseRoomInfo = {
  hostname: string,
  numPlayers: number,
  roomId: string,
  isPrivate: boolean,
};

export default class Room {
  roomId: string;
  roomType: string;
  members: Array<Player>;
  currentlyInGame: boolean = false;
  isPrivate: boolean = false;
  server: io.Server;

  constructor(roomId: string, host: Player, server: io.Server, roomType: string) {
    this.roomId = roomId;
    host.roomId = roomId;
    this.members = [host];
    this.roomType = roomType;
    this.server = server;
  }

  updateSettings(settings:any) {
    // Set is private eventually
  }
  getSettings() : any {
    // prototyping for subclasses to use
  }
  getRoomInfo() : any {
    let memberNames = this.members.map(m => m.username);
    return {
      members: memberNames,
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
    this.members.push(player);
    player.roomId = this.roomId;
  }

  removePlayer(player: Player) : number {
    const index = this.members.indexOf(player);
    if (index > -1) {
      this.members.splice(index, 1);
    }
    player.roomId = "";
    return index;
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
}
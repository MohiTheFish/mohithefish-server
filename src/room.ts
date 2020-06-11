import io from 'socket.io';
import Player from './player';

export type ConciseRoomInfo = {
  hostname: string,
  numPlayers: number,
  roomId: string,
  isPrivate: boolean,
};

export default class Room {
  host: Player;
  roomId: string;
  members: Array<Player>;
  currentlyInGame: boolean = false;
  isPrivate: boolean = false;

  constructor(roomId: string, host: Player) {
    this.roomId = roomId;
    this.host = host;
    host.roomId = roomId;
    this.members = [];
  }

  getRoomInfo() : any {
    let memberNames = this.members.map(m => m.username);
    return {
      hostname: this.host.username,
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
      hostname: this.host.username,
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

  removeHost() : boolean {
    if (this.members.length === 0) {
      return true;
    }
    this.host.roomId = "";
    this.host = this.members[0];
    this.members.shift();
    return false;
  }

  begin(server?: io.Server) {
    this.currentlyInGame = true;
  }

  end() {
    this.currentlyInGame = false;
  }
}
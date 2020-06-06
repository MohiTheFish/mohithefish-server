import { PlayerData } from './index';


export default class Player {
  username: string;
  gamename: string;
  userId: string;
  disconnectTime: number;
  roomname: string;

  constructor(data: PlayerData) {
    this.username = data.username;
    this.gamename = data.gamename;
    this.userId = data.userId;
    this.disconnectTime = -1;
    this.roomname = "";
  }

  disconnectPlayer() {
    this.disconnectTime = Date.now();
  }

  joinRoom(roomname: string) {
    this.roomname = roomname;
  }

  connectPlayer() {
    this.disconnectTime = -1;
  }
}

import { PlayerData } from './index';


export default class Player {
  username: string;
  gamename: string;
  userId: string;
  disconnectTime: number;
  roomId: string;

  constructor(data: PlayerData) {
    this.username = data.username;
    this.gamename = data.gamename;
    this.userId = data.userId;
    this.disconnectTime = -1;
    this.roomId = "";
  }

  disconnectPlayer() {
    this.disconnectTime = Date.now();
  }

  joinRoom(roomId: string) {
    this.roomId = roomId;
  }

  connectPlayer() {
    this.disconnectTime = -1;
  }
}

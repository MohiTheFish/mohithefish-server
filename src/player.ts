import { PlayerData } from './index';


export default class Player {
  username: string;
  gamename: string;
  uuid: string;
  disconnectTime: number;
  
  constructor(data: PlayerData) {
    this.username = data.username;
    this.gamename = data.gamename;
    this.uuid = data.uuid;
    this.disconnectTime = -1;
  }

  disconnectPlayer() {
    this.disconnectTime = Date.now();
  }

  connectPlayer() {
    this.disconnectTime = -1;
  }
}

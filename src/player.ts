import io from 'socket.io';
import {getRandomInt} from './util';

const randomNameOptions = [
  'Helix',
  'Baboon',
  'Botella',
  'Balloon',
  'Beaker',
  'Hat',
  'Armadillo',
  'Flounder',
  'Mouse',
];

export default class Player {
  username: string = "";
  gamename: string = "";
  userId: string;
  disconnectTime: number;
  roomId: string;
  socket: io.Socket | null;

  constructor(userId: string, playerSocket: io.Socket) {
    this.userId = userId;
    this.disconnectTime = -1;
    this.roomId = "";
    this.socket = playerSocket;
  }

  updateName(name: string) {
    if(name) {
      this.username = name;
    }
    else {
      const randomName = randomNameOptions[getRandomInt(randomNameOptions.length)];
      this.username = `Anonymous ${randomName}`;
    }
  }

  connectPlayer(socket: io.Socket) {
    this.disconnectTime = -1;
    this.socket = socket;
  }
  disconnectPlayer() {
    this.disconnectTime = Date.now();
    this.socket = null;
  }

  joinRoom(roomId: string) {
    this.roomId = roomId;
  }

  emit(eventName: string, data: any) {
    if (this.socket) {
      this.socket.emit(eventName, data);
    }
  }

}

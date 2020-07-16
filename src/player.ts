import io from 'socket.io';
import {getRandomItem} from './util';

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
  /** The player's selected username */
  username: string = "";
  /** The room the player is in. */
  roomId: string;
  /** The userId of the player. Generated in the client */
  userId: string;
  /** DisconnectTime. Used to decide whether a player should be removed after returnToLobby is called */
  disconnectTime: number;
  /** The socket of the player */
  socket: io.Socket | null;

  constructor(userId: string, playerSocket: io.Socket) {
    this.userId = userId;
    this.disconnectTime = -1;
    this.roomId = "";
    this.socket = playerSocket;
  }

  /**
   * Updates a player's name
   * @param name new name. if empty, a random one from randomNameOptions will be selected
   */
  updateName(name: string) {
    if(name) {
      this.username = name;
    }
    else {
      const randomName = getRandomItem(randomNameOptions);
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

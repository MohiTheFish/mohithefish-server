import io from 'socket.io';

export function getRandomInt(max: number) : number {
  return Math.floor(Math.random() * Math.floor(max));
}

const randomNameOptions = [
  'Helix',
  'Baboon',
  'Botella',
  'Balloon',
  'Beaker',
  'Hat',
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
    console.log('updating ' + this.userId);
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

}

import Room from '../room';
import Player from '../player';

import io from 'socket.io';

const TIME_PADDING = 2;

function getRandomInt(max: number) : number {
  return Math.floor(Math.random() * Math.floor(max));
}

const locations = [
  'Airplane',
  'Bank',
  'Beach',
  'Cathedral',
  'Circus Tent',
  'Corporate Party',
  'Crusader Army',
  'Casino',
  'Day Spa',
  'Embassy',
  'Hospital',
  'Hotel',
  'Military Base',
  'Movie Studio',
  'Ocean Liner',
  'Passenger Train',
  'Pirate Ship',
  'Polar Station',
  'Police Station',
  'Restaurant',
  'School',
  'Service Station',
  'Space Station',
  'Submarine',
  'Supermarket',
  'Theater',
  'University',
  'World War II Squad'
];

export default class SpyfallRoom extends Room {
  timeRemaining: number = 0;
  spyIndex: number = 0;
  roomInterval: any;

  constructor(roomId: string, host: Player, settings: any) {
    super(roomId, host);
    const { isPrivate, spyfall: {time}} = settings;
    this.timeRemaining = parseInt(time) * 60 + TIME_PADDING;
    this.isPrivate = isPrivate;
  }

  begin(server: io.Server) : any {
    super.begin();
    // Randomly pick a spy
    this.spyIndex = getRandomInt(this.members.length+1) - 1;
    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.roomInterval = setInterval(() => {this.sendTime(server)}, 1000);
    return {
      spyIndex: this.spyIndex,
      time: this.timeRemaining,
      locations: locations,
      secretLocation: locations[getRandomInt(locations.length)],
    };
  }

  end() {
    super.end();
    if(this.roomInterval) {
      clearInterval(this.roomInterval);
      this.roomInterval = null;
    }
  }

  sendTime(server: io.Server) {
    // Interval calls.
    server.of('/spyfall').to(this.roomId).emit('timeUpdate', this.timeRemaining);
    this.timeRemaining -= 1;
    if(this.timeRemaining === 0) {
      this.end();
    }
  }
}
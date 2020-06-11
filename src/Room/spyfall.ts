import Room from '../room';
import Player from '../player';

const TIME_PADDING = 5;
const TIME_LIMIT = 60 * 8 + TIME_PADDING;

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

  constructor(roomId: string, host: Player, settings: any) {
    super(roomId, host);
    const { isPrivate, spyfall: {time}} = settings;
    this.timeRemaining = time * 60;
    this.isPrivate = isPrivate;

  }

  begin() : any {
    super.begin();
    this.spyIndex = getRandomInt(this.members.length+1) - 1;
    return {
      spyIndex: this.spyIndex,
      time: this.timeRemaining,
      locations: locations,
      secretLocation: locations[getRandomInt(locations.length)],
    };
  }

  end() {
    super.end();
  }
}
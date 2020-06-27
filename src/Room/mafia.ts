import Room, {GAMESTARTED} from '../room';
import Player from '../player';

import { v4 as uuid } from 'uuid';
import io from 'socket.io';

enum ROLES {
  VILLAGER,
  DETECTIVE,
  MEDIC,
  MAFIA,
  GODFATHER,
  SK,
  JOKER,
  NUM_ROLES,
};

type mafiaProfile = {
  role: ROLES,
  isAlive: boolean,
  votingFor: string,
  isAbstaining: boolean,
  targetOfPower: string,
};

function getNumMafia(numMafia: number, numMembers: number) : number {
  if (numMafia >= 0) {
    return numMafia;
  }
  if (numMembers < 5) {
    return 1;
  }
  if (numMembers < 11) {
    return 2;
  }
  if (numMembers < 18) {
    return 3;
  }
  return 4;
  
}

/**
 * Randomly shuffles a given array
 * 
 * Credit to: https://javascript.info/task/shuffle
 * @param array array to shuffle
 */
function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i

    // swap elements array[i] and array[j]
    // we use "destructuring assignment" syntax to achieve that
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Function to interpret what phase and what number a phase is in
 * 
 * Ex) phase = 0 refers to day 0
 * 
 * Ex) phase = 1 refers to night 1
 * 
 * Ex) phase = 4 refers to day 2
 * @param phase a number indicating the phase
 */
function interpretPhase(phase: number) : string {
  const isEven = phase % 2 === 0;
  if (isEven) {
    const num = phase / 2;
    return `day ${num}`;
  }
  else {
    const num = (phase+1) / 2;
    return `night ${num}`;
  }
}
export default class MafiaRoom extends Room {
  dayTimeLimit: number = 300;
  nightTimeLimit: number = 60;
  defenseTimeLimit: number = 20;

  numMafia: number = 2;
  allowSK: boolean = false;
  allowJoker: boolean = false;
  phase: number = 0;
  mainTimeRemaining: number = 0;
  mainInterval: any = null;
  secondaryTimeRemaining: number = 0;
  secondaryInterval: any = null;
  mafiaRoomId: string;
  roleCounts: object = {};

  memberProfiles: Array<mafiaProfile> = [];

  setMafiaSettings(mafiaSettings: any) {
    const {
      dayTimeLimit, 
      nightTimeLimit,
      defenseTimeLimit,
      numMafia,
      allowSK,
      allowJoker,
    } = mafiaSettings;
    

    this.dayTimeLimit = Number.parseInt(dayTimeLimit);
    this.nightTimeLimit = Number.parseInt(nightTimeLimit);
    this.defenseTimeLimit = Number.parseInt(defenseTimeLimit);
    this.numMafia = getNumMafia(Number.parseInt(numMafia), this.members.length);
    this.allowSK = allowSK;
    this.allowJoker = allowJoker;
  }

  constructor(roomId: string, host: Player, server: io.Server, settings: any) {
    super(roomId, host, server, 'mafia');
    console.log(settings);
    
    const { 
      isPrivate, 
      mafia,
    } = settings;

    this.isPrivate = isPrivate;
    this.mafiaRoomId = uuid();

    this.setMafiaSettings(mafia);
  }

  updateSettings(settings: any) : any {
    const { 
      mafia
    } = settings;

    this.setMafiaSettings(mafia);

    return { 
      isPrivate: this.isPrivate, 
      mafia,
    };
  }

  getSettings() : any {
    const roomInfo = super.getRoomInfo();
    roomInfo.settings = {
      isPrivate: this.isPrivate, 
      mafia: {
        dayTimeLimit: this.dayTimeLimit, 
        nightTimeLimit: this.nightTimeLimit,
        defenseTimeLimit: this.defenseTimeLimit,
        numMafia: this.numMafia,
        allowSK: this.allowSK,
        allowJoker: this.allowJoker,
      }
    }
    return roomInfo;
  }

  begin() : any {
    super.begin();

    const numPlayers = this.members.length;
    const profiles: mafiaProfile[] = [];

    const roles: ROLES[] = [];
    roles.length = numPlayers;
    // Put in numMafia roles
    for(var i = 0; i<this.numMafia; i++) {
      roles[i] = ROLES.MAFIA;
    }

    // Put in 1 detective and 1 medic
    roles[this.numMafia] = ROLES.DETECTIVE;
    roles[this.numMafia+1] = ROLES.MEDIC;

    // Fill in the rest with villager role
    for(var i=this.numMafia+2; i<roles.length; i++) {
      roles[i] = ROLES.VILLAGER;
    }

    // If we are using a SK, just put him in the last location
    if (this.allowSK) {
      roles[roles.length-1] = ROLES.SK;
    }
    // If we are using joker put him in second to last location.
    if (this.allowJoker) {
      roles[roles.length-2] = ROLES.JOKER;
    }
    
    // Shuffle all the roles. The new index corresponds to the players position
    shuffle(roles);


    // Intializes all the profiles
    roles.forEach(role => {
      const profile = {
        role: role,
        isAlive: true,
        isAbstaining: false,
        targetOfPower: "",
        votingFor: "",
      }
      profiles.push(profile);
    });

    this.mainTimeRemaining = 5; // Phase 0 will have 5 seconds.
    const baseGameState = {
      time: this.mainTimeRemaining,
      role: ROLES.VILLAGER,
      roleCount: {
        mafiaCount: this.numMafia,
        villagerCount: (roles.length-this.numMafia)
      }
    }

    console.log(profiles);
    this.members.forEach((member, index) => {
      const socket = member.socket;
      if (socket) {
        baseGameState.role = profiles[index].role;
        socket.emit(GAMESTARTED, baseGameState);
      }
    });
    this.memberProfiles = profiles;

    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.mainInterval = setInterval(this.sendTime, 1000); 
    
  }

  end() {
    super.end();
    if(this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;
    }
    if (this.secondaryInterval) {
      clearInterval(this.secondaryInterval);
      this.secondaryInterval = null;
    }
    this.phase = 0;
    this.memberProfiles = [];
    this.roleCounts = {};
  }

  pauseMainTime(server: io.Server) {
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;

      this.secondaryInterval = setInterval(this.secondarySendTime, 1000);
    }
  }

  secondarySendTime() {
    // Interval calls.
    this.server.to(this.roomId).emit('secondaryTimeUpdate', [this.phase, this.secondaryTimeRemaining]);
    this.secondaryTimeRemaining -= 1;
    if(this.secondaryTimeRemaining === -1) {
      clearInterval(this.secondaryInterval);
    }
  }

  sendTime() {
    // Interval calls.
    this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, this.mainTimeRemaining]);
    console.log(this.mainTimeRemaining);
    this.mainTimeRemaining -= 1;
    if(this.mainTimeRemaining === -1) {
      this.phase += 1;
      if (this.phase % 2 === 1) {
        this.mainTimeRemaining = this.nightTimeLimit;
      }
      else {
        this.mainTimeRemaining = this.dayTimeLimit;
      }
    }
  }
}
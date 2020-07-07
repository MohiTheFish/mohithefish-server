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

enum AUDIENCE {
  NOBODY,
  EVERYONE, 
  MAFIA, 
};

type mafiaProfile = {
  role: ROLES,
  isAlive: boolean,
  numVotes: number,
  votingFor: number,
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

function getHalf(number: number) : number {
  return Math.floor((number+1) / 2);
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

function isDay(phase: number) {
  return phase % 2 === 0;
}

function printExists(item: any, itemname: string) {
  if (item) {
    console.log(`${itemname} exists`);
  }
  else {
    console.log(`${itemname} does not exist`);
  }
}

const ABSTAIN: number = -2;
const UNDECIDED: number = -1;
const RECAP_TIME: number = 3;

export default class MafiaRoom extends Room {
  dayTimeLimit: number = 300;
  nightTimeLimit: number = 60;
  defenseTimeLimit: number = 20;
  numMafia: number = 2;
  allowSK: boolean = false;
  allowJoker: boolean = false;

  numAlive: number = 0;
  phase: number = 0;
  mainTimeRemaining: number = 0;
  mainInterval: NodeJS.Timeout | null = null;
  secondaryTimeRemaining: number = 0;
  secondaryInterval: NodeJS.Timeout | null = null;
  mafiaRoomId: string;
  numAbstain: number = 0;
  onTrial: string = '';
  allowVotesOnTrial: boolean = false;
  isRecapPeriod: boolean = false;

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
    this.numMafia = Number.parseInt(numMafia);
    this.allowSK = allowSK;
    this.allowJoker = allowJoker;
  }

  constructor(roomId: string, host: Player, server: io.Server, settings: any) {
    super(roomId, host, server, 'mafia');
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

  getSettings() : object {
    return {
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
  }

  /**
   * Initialize profiles
   * 
   * Initializes numAbstain
   */
  begin() : any {
    super.begin();

    this.numAbstain = 0;
    this.numAlive = this.members.length;
    this.secondaryTimeRemaining = this.defenseTimeLimit;
    this.isRecapPeriod = true;

    const profiles: mafiaProfile[] = [];

    const targetNumMafia = getNumMafia(this.numMafia, this.members.length);
    const roles: ROLES[] = [];
    roles.length = this.numAlive;
    // Put in numMafia roles
    for(var i = 0; i<targetNumMafia; i++) {
      roles[i] = ROLES.MAFIA;
    }

    // Put in 1 detective and 1 medic
    roles[targetNumMafia] = ROLES.DETECTIVE;
    roles[targetNumMafia+1] = ROLES.MEDIC;

    // Fill in the rest with villager role
    for(var i=targetNumMafia+2; i<roles.length; i++) {
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
    roles.forEach((role, index) => {
      const profile = {
        role: role,
        isAlive: true,
        numVotes: 0,
        targetOfPower: "",
        votingFor: -1,
      }
      if (role === ROLES.MAFIA) {
        if (index < this.members.length) {
          const player = this.members[index];
          player.socket?.join(this.mafiaRoomId);
        }
      }
      profiles.push(profile);
    });

    this.mainTimeRemaining = 5; // Phase 0 will have 5 seconds.
    this.isRecapPeriod = true;
    const baseGameState = {
      time: this.mainTimeRemaining,
      role: ROLES.VILLAGER,
      roleCount: {
        mafiaCount: targetNumMafia,
        villagerCount: (roles.length-targetNumMafia)
      },
      numPlayers: this.numAlive,
    }

    this.members.forEach((member, index) => {
      const socket = member.socket;
      if (socket) {
        baseGameState.role = profiles[index].role;
        socket.emit(GAMESTARTED, baseGameState);
      }
    });
    this.memberProfiles = profiles;

    // Create a repeating interval. This server will synchronize the clocks for all clients.
    this.mainInterval = setInterval(() => this.sendTime(), 1000); 
  }

  /**
   * Performs clean up of the mafia room
   */
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
  }

  endDay() {
    this.mainTimeRemaining = 0;
  }
  /**
   * Stop the main sendTime function interval.
   */
  pauseMainTime() {
    if (this.mainInterval) {
      this.server.to(this.roomId).emit('trialStarted', this.onTrial);
      clearInterval(this.mainInterval);
      this.mainInterval = null;

      this.secondaryInterval = setInterval(() => this.secondarySendTime(), 1000);
    }
  }

  /**
   * Sends the secondary time (court duration) to all the players.
   */
  secondarySendTime() {
    // Interval calls.
    this.server.to(this.roomId).emit('secondaryTimeUpdate', [this.phase, this.secondaryTimeRemaining]);
    this.secondaryTimeRemaining -= 1;
    if(this.secondaryTimeRemaining === -1) {
      if(this.secondaryInterval) {
        clearInterval(this.secondaryInterval);
      }
    }
  }

  /**
   * Sends the current time remaining for the session to all players
   */
  sendTime() {
    // Interval calls.
    this.server.to(this.roomId).emit('mainTimeUpdate', [this.phase, this.mainTimeRemaining, this.isRecapPeriod]);
    this.mainTimeRemaining -= 1;
    if(this.mainTimeRemaining === -1) {
      if (this.isRecapPeriod) {
        this.isRecapPeriod = false;
        this.phase++;
        if (this.phase % 2 === 1) {
          this.mainTimeRemaining = this.nightTimeLimit;
        }
        else {
          this.memberProfiles = this.memberProfiles.map(profile => {
            return {
              role: profile.role,
              isAlive: profile.isAlive,
              numVotes: 0,
              votingFor: -1,
              targetOfPower: '',
            };
          });
          this.mainTimeRemaining = this.dayTimeLimit;
        }
      }
      else {
        this.isRecapPeriod = true;
        this.mainTimeRemaining = RECAP_TIME;
      }
    }
  }

  /**
   * Votes for a player during the day phase and updates the chat history.
   * @param myIndex the index of the player voting
   * @param targetIndex the target of the vote
   */
  votePlayer(myIndex: number, targetIndex: number) {
    const myPlayer = this.members[myIndex];
    const myProfile = this.memberProfiles[myIndex];

    const oldTarget = myProfile.votingFor;
    let message = '';
    let checkAbstain = false;
    let checkVotes = -1;
    // 4 cases
    // 1) myPlayer is abstaining
    // 2) myPlayer is voting for someone fresh
    // 3) myPlayer is removing their vote for a player
    // 4) myPlayer is switching their vote
    if (targetIndex === ABSTAIN) {
      if(oldTarget === ABSTAIN) {
        this.numAbstain--;
        message = `${myPlayer.username} is no longer abstaining.`;
        myProfile.votingFor = UNDECIDED;
      }
      else if(oldTarget === UNDECIDED) {
        this.numAbstain++;
        message = `${myPlayer.username} is choosing to abstain.`;
        myProfile.votingFor = ABSTAIN;
        checkAbstain = true;
      }
      else { //oldTarget was player
        const oldTargetPlayer = this.members[oldTarget];
        const oldTargetProfile = this.memberProfiles[oldTarget];
        oldTargetProfile.numVotes--;

        this.numAbstain++;
        message = `${myPlayer.username} switched from voting ${oldTargetPlayer.username} to abstaining.`;
        myProfile.votingFor = ABSTAIN;
        checkAbstain = true;
      }
    }
    else {
      const targetPlayer = this.members[targetIndex];
      const targetProfile = this.memberProfiles[targetIndex];
      if (oldTarget === ABSTAIN) {
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        this.numAbstain--;
        message = `${myPlayer.username} switched from abstaining to voting for ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
      else if (oldTarget === UNDECIDED) {
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        message = `${myPlayer.username} is voting for ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
      else if(oldTarget === targetIndex) {
        myProfile.votingFor = UNDECIDED;
        targetProfile.numVotes--;
        message = `${myPlayer.username} is no longer voting for ${targetPlayer.username}.`;
      }
      else {
        const oldTargetPlayer = this.members[oldTarget];
        const oldTargetProfile = this.memberProfiles[oldTarget];
        oldTargetProfile.numVotes--;
        
        myProfile.votingFor = targetIndex;
        targetProfile.numVotes++;
        message = `${myPlayer.username} switched vote from ${oldTargetPlayer.username} to ${targetPlayer.username}.`;
        checkVotes = targetIndex;
      }
    }
    const baseObj = {
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      message,
      newTarget: myProfile.votingFor,
      oldTarget,
    };
    myPlayer.socket?.to(this.roomId).emit('otherPlayerVotedMafia', baseObj);
    myPlayer.emit('iVotedMafia', baseObj);

    const numNeeded = getHalf(this.numAlive);
    if(checkAbstain && this.numAbstain >= numNeeded) {
      this.endDay();
      this.server.to(this.roomId).emit('mafiaChatUpdated', {
        audience: AUDIENCE.EVERYONE,
        phase: this.phase,
        message: `Voting abstained.`
      });
    }
    if(checkVotes !== -1) {
      const targetPlayer = this.members[targetIndex];
      const targetProfile = this.memberProfiles[targetIndex];
      if (targetProfile.numVotes >= numNeeded) {
        this.onTrial = targetPlayer.username;
        this.server.to(this.roomId).emit('beginTrial', this.onTrial);
        this.pauseMainTime();
      }
    }
  }

  /**
   * Sends a message in the chat history and updates all relevant parties of the message
   * @param index The index of the player sending a message 
   * @param userId The user id of the player sending a message
   * @param message The message the player sent
   */
  updateChat(index: number, userId: string, message: string) {
    const player = this.members[index];
    const profile = this.memberProfiles[index];
    if (player.userId !== userId) {
      console.log('out of order!');
    }
    const tagMessage = `${player.username}: ${message}`;
    const baseObj = {
      audience: AUDIENCE.EVERYONE,
      phase: this.phase,
      message: tagMessage,
    };

    
    // If it's day time, make message publicly available
    if (isDay(this.phase)) {
      this.server.to(this.roomId).emit('mafiaChatUpdated', baseObj);
    }
    else {
      // Different scenarios for texting at night
      if(profile.role === ROLES.MAFIA) {
        // If player is a mafia, send to all mafias.
        baseObj.audience = AUDIENCE.MAFIA;
        this.server.to(this.mafiaRoomId).emit('mafiaChatUpdated', baseObj);
      }
      else {
        // Otherwise just update the player's individual chat message. 
        baseObj.audience = AUDIENCE.NOBODY;
        player.emit('mafiaChatUpdated', baseObj);
      }
    }
  }
}